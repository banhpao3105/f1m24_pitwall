/**
 * v0.9.2 — the SC/VSC what-if engine (roadmap v0.9 §2.2.3, finally shipped).
 *
 * Locked against the REAL MarinaBay Races_Tracks columns (TrackID 15, read
 * from a real F1M 24 save by scripts/probe-v090-pitcost.ts):
 *   Pit 29s · Green 27s · SC 16s · SCChance 2/3.
 * The green pit cost stays the lab's own calibrated 20.7s (18.5 + 2.2);
 * the SC cost scales it by the track's real ratio 16/29 → 11.4207s, VSC
 * takes the green↔SC midpoint → 16.0603s. Every expected number below is
 * hand-computed from those two lines — nothing is invented.
 */

import { describe, it, expect } from 'vitest';
import { whatIfSCVSC, buildTyreLab } from '../../src/engines/tyre.engine';
import { buildMarinaBayModel, MARINA_RACE_ID } from '../helpers/marinabay-fixture';
import type { SaveModel } from '../../src/domain/types';

const join = (c: readonly string[]): string => c.join('→');

describe('whatIfSCVSC — the real-column pricing (MarinaBay)', () => {
  const model: SaveModel = buildMarinaBayModel();

  it('the green pit cost is untouched and the track columns are the real ones', () => {
    const result = whatIfSCVSC(model, MARINA_RACE_ID, { mode: 'sc', startLap: 17, laps: 3 });
    expect(result).not.toBeNull();
    expect(result!.pitCostGreenS).toBe(20.7); // the engine's own constant, unchanged
    expect(result!.trackCols).toEqual({ pitLaneS: 29, greenFlagS: 27, scS: 16, chance: 2 / 3 });
  });

  it('SC pricing = 20.7 × (16/29) and one in-window stop saves 9.3s', () => {
    const result = whatIfSCVSC(model, MARINA_RACE_ID, { mode: 'sc', startLap: 17, laps: 3 })!;
    // 20.7 × 16/29 = 11.4207 → 11.4
    expect(result.pitCostScenarioS).toBe(11.4);
    // the lead S(17)/S(18)/M(27) has its lap-17 stop inside the window:
    // 97.1 − (20.7 − 11.4207) = 87.8207 → 87.8, saved 9.3
    const lead = result.rows.find((r) => join(r.order) === 'S→S→M')!;
    expect(lead.greenTimeS).toBe(97.1);
    expect(lead.scenarioTimeS).toBe(87.8);
    expect(lead.savedS).toBe(9.3);
    expect(lead.stopsInWindow).toBe(1);
    expect(result.rows[0].scenarioTimeS).toBe(87.8); // sorted by scenario time
  });

  it('a window covering BOTH trail stops flips the green tie — SC makes the 2-stop hedge fastest', () => {
    const result = whatIfSCVSC(model, MARINA_RACE_ID, { mode: 'sc', startLap: 27, laps: 18 })!;
    const trail = result.rows.find((r) => join(r.order) === 'M→S→S')!;
    // both stops (27, 44) in [27, 45): 97.1 − 2 × 9.2793 = 78.5414 → 78.5
    expect(trail.stopsInWindow).toBe(2);
    expect(trail.scenarioTimeS).toBe(78.5);
    expect(trail.savedS).toBe(18.6);
    // the lead (pits 17, 35) only catches the lap-35 stop → 87.8
    const lead = result.rows.find((r) => join(r.order) === 'S→S→M')!;
    expect(lead.scenarioTimeS).toBe(87.8);
    // the green tie (both 97.1) is broken: the trail plan now leads
    expect(result.rows[0].order).toEqual(trail.order);
  });

  it('VSC takes the labelled green↔SC midpoint — 20.7 × 0.7759 = 16.1s', () => {
    const result = whatIfSCVSC(model, MARINA_RACE_ID, { mode: 'vsc', startLap: 17, laps: 3 })!;
    expect(result.pitCostScenarioS).toBe(16.1);
    const lead = result.rows.find((r) => join(r.order) === 'S→S→M')!;
    // 97.1 − (20.7 − 16.0603) = 92.4603 → 92.5, saved 4.6
    expect(lead.scenarioTimeS).toBe(92.5);
    expect(lead.savedS).toBe(4.6);
  });

  it('a window that misses every stop changes nothing (times and order)', () => {
    const green = buildTyreLab(model, MARINA_RACE_ID);
    const result = whatIfSCVSC(model, MARINA_RACE_ID, { mode: 'sc', startLap: 50, laps: 5 })!;
    expect(result.rows).toHaveLength(green.data!.strategies.length);
    for (const row of result.rows) {
      expect(row.stopsInWindow).toBe(0);
      expect(row.scenarioTimeS).toBe(row.greenTimeS);
      expect(row.savedS).toBe(0);
    }
    // order identical to the green ranking
    expect(result.rows.map((r) => join(r.order))).toEqual(
      green.data!.strategies.map((s) => join(s.order)),
    );
  });

  it('no infeasible plan is resurrected — the v0.9.1 set law holds under re-pricing', () => {
    // every window, every mode: a plan with two consecutive M stints can
    // never appear (each player car owns ONE M set)
    for (const mode of ['sc', 'vsc'] as const) {
      for (const startLap of [1, 17, 27, 40]) {
        const result = whatIfSCVSC(model, MARINA_RACE_ID, { mode, startLap, laps: 10 })!;
        for (const row of result.rows) {
          for (let i = 1; i < row.stints.length; i++) {
            expect(row.stints[i].compound === 'M' && row.stints[i - 1].compound === 'M').toBe(
              false,
            );
          }
        }
      }
    }
  });

  it('the assumptions are structured and carry the real numbers', () => {
    const sc = whatIfSCVSC(model, MARINA_RACE_ID, { mode: 'sc', startLap: 17, laps: 3 })!;
    expect(sc.assumptions.map((a) => a.key)).toEqual(['scRatio', 'repricedOnly', 'userWindow']);
    expect(sc.assumptions[0].params).toEqual({ sc: 16, pit: 29, green: '20.7', cost: '11.4' });
    const vsc = whatIfSCVSC(model, MARINA_RACE_ID, { mode: 'vsc', startLap: 17, laps: 3 })!;
    expect(vsc.assumptions[0].key).toBe('vscMidpoint');
    expect(vsc.assumptions[0].params.cost).toBe('16.1');
  });

  it('returns null when the save lacks the track columns — feature off, no invented numbers', () => {
    const stripped: SaveModel = {
      ...model,
      races: model.races.map((r) =>
        r.raceId === MARINA_RACE_ID
          ? {
              ...r,
              trackPitLaneTimeLossS: undefined,
              trackSafetyCarTimeLossS: undefined,
              trackSafetyCarChance: undefined,
              trackGreenFlagTimeLossS: undefined,
            }
          : r,
      ),
    };
    expect(whatIfSCVSC(stripped, MARINA_RACE_ID, { mode: 'sc', startLap: 17, laps: 3 })).toBeNull();
  });

  it('returns null for an unknown race', () => {
    expect(whatIfSCVSC(model, 99999, { mode: 'sc', startLap: 1, laps: 3 })).toBeNull();
  });
});
