/**
 * v0.9.7 step 2 — the multi-window SC/VSC what-if (prompt §2.4, measured on
 * the real saves' owner-verified fixture numbers). The single-window
 * `whatIfSCVSC` (v0.9.2) stays 100% untouched — its own 8 tests must keep
 * passing; with exactly ONE window the multi produces identical rows (M3),
 * the proof that multi is a pure generalization, not a new law.
 *
 * Rounding trap (v0.9.2 law, kept): per-pit discounts sum UNROUNDED, only
 * the totals round — M1: 7.245 + 3.6225 = 10.8675 → saved 10.9, never
 * 7.2 + 3.6 = 10.8.
 */

import { describe, it, expect } from 'vitest';
import { whatIfSCVSC, whatIfSCVSCMulti } from '@/engines/tyre.engine';
import {
  buildShanghaiModel,
  SHANGHAI_RACE_ID,
} from '../helpers/shanghai-2028-fixture';
import {
  buildMarinaBayModel,
  MARINA_RACE_ID,
} from '../helpers/marinabay-fixture';

const SC_1719 = { mode: 'sc' as const, startLap: 17, laps: 3 };
const VSC_3739 = { mode: 'vsc' as const, startLap: 37, laps: 3 };
const VSC_1820 = { mode: 'vsc' as const, startLap: 18, laps: 3 };
const VSC_2744 = { mode: 'vsc' as const, startLap: 27, laps: 18 };

describe('whatIfSCVSCMulti — Shanghai 2028 (track cols pit 20 / SC 13)', () => {
  const model = buildShanghaiModel();

  it('pitCosts: SC 13.5 (20.7 × 13/20) · VSC 17.1 (green↔SC midpoint)', () => {
    const m = whatIfSCVSCMulti(model, SHANGHAI_RACE_ID, [SC_1719, VSC_3739])!;
    expect(m).not.toBeNull();
    expect(m.pitCostGreenS).toBe(20.7);
    expect(m.pitCosts.sc).toBe(13.5);
    expect(m.pitCosts.vsc).toBe(17.1);
    expect(m.trackCols).toEqual({ pitLaneS: 20, greenFlagS: 18, scS: 13, chance: 1 });
    expect(m.laps).toBe(56);
    expect(m.scenarios).toEqual([SC_1719, VSC_3739]);
  });

  it('M1: SC[17,19] + VSC[37,39] — SSM/SMS/MSS 72.2 · SSH/SHS/HSS 72.6, all saved 10.9 (2 pits in windows)', () => {
    const m = whatIfSCVSCMulti(model, SHANGHAI_RACE_ID, [SC_1719, VSC_3739])!;
    expect(m.rows.map((r) => r.order.join('→'))).toEqual([
      'S→S→M', 'S→M→S', 'M→S→S', 'S→S→H', 'S→H→S', 'H→S→S',
    ]);
    expect(m.rows.map((r) => r.scenarioTimeS)).toEqual([72.2, 72.2, 72.2, 72.6, 72.6, 72.6]);
    expect(m.rows.map((r) => r.savedS)).toEqual([10.9, 10.9, 10.9, 10.9, 10.9, 10.9]);
    expect(m.rows.map((r) => r.stopsInWindows)).toEqual([2, 2, 2, 2, 2, 2]);
    // 7.245 + 3.6225 = 10.8675 — summed unrounded, then rounded
    expect(m.rows[0]!.greenTimeS).toBe(83.1);
    expect(m.rows[3]!.greenTimeS).toBe(83.5);
    // assumptions: scRatio (≥1 SC) + vscMidpoint (≥1 VSC) + the two standing ones
    expect(m.assumptions.map((a) => a.key)).toEqual([
      'scRatio', 'vscMidpoint', 'repricedOnly', 'userWindows',
    ]);
    expect(m.assumptions[0]!.params).toEqual({
      sc: 13, pit: 20, green: '20.7', cost: '13.5',
    });
    expect(m.assumptions[1]!.params).toEqual({ cost: '17.1' });
    expect(m.assumptions[3]!.params).toEqual({ count: 2 });
  });

  it('M2: SC[17,19] + VSC[18,20] overlap — pit 18/19 takes the cheaper SC once (saved 7.2, no stacking)', () => {
    const m = whatIfSCVSCMulti(model, SHANGHAI_RACE_ID, [SC_1719, VSC_1820])!;
    expect(m.rows.map((r) => r.scenarioTimeS)).toEqual([75.9, 75.9, 75.9, 76.3, 76.3, 76.3]);
    expect(m.rows.map((r) => r.savedS)).toEqual([7.2, 7.2, 7.2, 7.2, 7.2, 7.2]);
    expect(m.rows.map((r) => r.stopsInWindows)).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it('M3: a single-window multi is IDENTICAL to the untouched v0.9.2 single what-if', () => {
    const single = whatIfSCVSC(model, SHANGHAI_RACE_ID, SC_1719)!;
    const multi = whatIfSCVSCMulti(model, SHANGHAI_RACE_ID, [SC_1719])!;
    const key = (r: { order: { join: (s: string) => string }; scenarioTimeS: number; savedS: number; stopsInWindows?: number; stopsInWindow?: number }) =>
      `${r.order.join('→')}|${r.scenarioTimeS}|${r.savedS}|${r.stopsInWindows ?? r.stopsInWindow}`;
    expect(multi.rows.map(key)).toEqual(single.rows.map(key));
    expect(multi.rows.map((r) => r.scenarioTimeS)).toEqual([75.9, 75.9, 75.9, 76.3, 76.3, 76.3]);
    // SC-only timeline: no vscMidpoint assumption
    expect(multi.assumptions.map((a) => a.key)).toEqual([
      'scRatio', 'repricedOnly', 'userWindows',
    ]);
  });

  it('an empty timeline is null — no invented numbers', () => {
    expect(whatIfSCVSCMulti(model, SHANGHAI_RACE_ID, [])).toBeNull();
  });
});

describe('whatIfSCVSCMulti — MarinaBay (autosave-4 numbers, cols pit 29 / SC 16)', () => {
  const model = buildMarinaBayModel();

  it('MB1: the OLD single-window function still prices the lead at 87.8 (SC[17,19])', () => {
    const single = whatIfSCVSC(model, MARINA_RACE_ID, SC_1719)!;
    expect(single.rows[0]!.order.join('→')).toBe('S→S→M');
    expect(single.rows[0]!.scenarioTimeS).toBe(87.8);
    expect(single.rows[0]!.savedS).toBe(9.3);
  });

  it('MB2: multi [SC 17,19] rows are identical to MB1', () => {
    const single = whatIfSCVSC(model, MARINA_RACE_ID, SC_1719)!;
    const multi = whatIfSCVSCMulti(model, MARINA_RACE_ID, [SC_1719])!;
    const key = (r: { order: { join: (s: string) => string }; scenarioTimeS: number; savedS: number; stopsInWindows?: number; stopsInWindow?: number }) =>
      `${r.order.join('→')}|${r.scenarioTimeS}|${r.savedS}|${r.stopsInWindows ?? r.stopsInWindow}`;
    expect(multi.rows.map(key)).toEqual(single.rows.map(key));
  });

  it('MB3: SC[17,19] + VSC[27,44] — SSM 83.2 (13.9, 2) · MSS 87.8 (9.3, 2 — both pits inside the VSC window) · SSMS 92.9 (4.6, 1) · SMH 97.3 (4.6, 1)', () => {
    const m = whatIfSCVSCMulti(model, MARINA_RACE_ID, [SC_1719, VSC_2744])!;
    expect(m.rows.map((r) => r.order.join('→'))).toEqual([
      'S→S→M', 'S→M→S', 'M→S→S', 'S→S→M→S', 'S→M→S→S', 'S→M→H',
    ]);
    expect(m.rows.map((r) => r.scenarioTimeS)).toEqual([83.2, 83.2, 87.8, 92.9, 92.9, 97.3]);
    expect(m.rows.map((r) => r.savedS)).toEqual([13.9, 13.9, 9.3, 4.6, 4.6, 4.6]);
    expect(m.rows.map((r) => r.stopsInWindows)).toEqual([2, 2, 2, 1, 1, 1]);
    // greens untouched: 97.1 ×3, 97.5 ×2, 101.9
    expect(m.rows.map((r) => r.greenTimeS)).toEqual([97.1, 97.1, 97.1, 97.5, 97.5, 101.9]);
  });

  it('a track without the SC/pit columns returns null (no invented pricing)', () => {
    const noCols = buildMarinaBayModel();
    for (const r of noCols.races) {
      r.trackPitLaneTimeLossS = undefined as unknown as number;
      r.trackSafetyCarTimeLossS = undefined as unknown as number;
    }
    expect(whatIfSCVSCMulti(noCols, MARINA_RACE_ID, [SC_1719])).toBeNull();
  });
});
