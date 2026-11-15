/**
 * v0.9.3 — the tier law: usable = measured && !clamped.
 *
 * The Interlagos 2027 save (save2.sav, Day 46698, race 207) caught the bug:
 * practice measured M +0.97 (usable) and H +0.384 raw — FASTER than M, so
 * the v0.6.1 monotonic clamp forced H to 1.12 and the v0.5.1 same-tier rule
 * (which only checked "was it measured at all") let the lab rank M on the
 * practice number while H ranked on the allocation estimate +0.71. The
 * mixed tiers made the old lead S→S→H win by exactly the practice/allocation
 * gap; Nguyen ran S→M→S in-game and gained 4 positions.
 *
 * Fix (prompt §3): a CLAMPED value is the model's opinion, never a
 * measurement — the ranking M and H ALWAYS share one tier (practice or the
 * model constants), and allocation is never a ranking delta (evidence only,
 * in the assumption's fallbackValue).
 *
 * Every Interlagos number below is the owner-verified §4 DoD — reproduced
 * here on the fixture built from those exact inputs.
 */

import { describe, it, expect } from 'vitest';
import { buildTyreLab } from '../../src/engines/tyre.engine';
import {
  buildInterlagosModel,
  INTERLAGOS_RACE_ID,
} from '../helpers/interlagos-fixture';
import { buildMarinaBayModel, MARINA_RACE_ID } from '../helpers/marinabay-fixture';
import type { SaveModel, PracticeResult } from '../../src/domain/types';

/** 9 practice rows (3 drivers per compound) with the given best laps (s). */
function practiceRows(s: number, m: number, h: number): PracticeResult[] {
  return [
    { driverId: 1, teamId: 2, session: 1, bestLapMs: s * 1000, bestLapTyre: 2, raceFormula: 1 },
    { driverId: 2, teamId: 2, session: 1, bestLapMs: (s + 0.12) * 1000, bestLapTyre: 2, raceFormula: 1 },
    { driverId: 3, teamId: 3, session: 1, bestLapMs: (s + 0.24) * 1000, bestLapTyre: 2, raceFormula: 1 },
    { driverId: 4, teamId: 3, session: 1, bestLapMs: m * 1000, bestLapTyre: 1, raceFormula: 1 },
    { driverId: 5, teamId: 4, session: 1, bestLapMs: (m + 0.12) * 1000, bestLapTyre: 1, raceFormula: 1 },
    { driverId: 6, teamId: 4, session: 1, bestLapMs: (m + 0.24) * 1000, bestLapTyre: 1, raceFormula: 1 },
    { driverId: 7, teamId: 5, session: 1, bestLapMs: h * 1000, bestLapTyre: 0, raceFormula: 1 },
    { driverId: 8, teamId: 5, session: 1, bestLapMs: (h + 0.12) * 1000, bestLapTyre: 0, raceFormula: 1 },
    { driverId: 9, teamId: 6, session: 1, bestLapMs: (h + 0.24) * 1000, bestLapTyre: 0, raceFormula: 1 },
  ];
}

function withPractice(s: number, m: number, h: number): SaveModel {
  const model = buildInterlagosModel();
  const race = model.races.find((r) => r.raceId === INTERLAGOS_RACE_ID)!;
  race.practice = practiceRows(s, m, h);
  return model;
}

describe('v0.9.3 tier matrix — the ranking M/H ALWAYS share one tier (prompt §3)', () => {
  it('row 1 — M usable + H usable → practice / practice', () => {
    // H honest (+2.0, slower than M) → no clamp fires on either side
    const lab = buildTyreLab(withPractice(90.0, 90.97, 92.0), INTERLAGOS_RACE_ID);
    expect(lab.data.deltas.M).toBe(0.97);
    expect(lab.data.deltas.H).toBe(2.0);
    expect(lab.data.paceSource.M).toBe('practice');
    expect(lab.data.paceSource.H).toBe('practice');
    expect(lab.data.sameTierFallback).toBe(false);
  });

  it('row 2 — M usable + H clamped → model / model (THE INTERLAGOS CASE)', () => {
    // H raw +0.384 faster than M +0.97 → monotonic clamp → H unusable
    const lab = buildTyreLab(buildInterlagosModel(), INTERLAGOS_RACE_ID);
    expect(lab.data.deltas.M).toBe(0.55);
    expect(lab.data.deltas.H).toBe(1.05);
    expect(lab.data.paceSource.M).toBe('model');
    expect(lab.data.paceSource.H).toBe('model');
    expect(lab.data.sameTierFallback).toBe(true);
  });

  it('row 3 — M clamped + H usable → model / model (symmetric)', () => {
    // M degenerate (faster than Soft — noise) → clamped to the 0.05 floor;
    // H honest (+2.0) — still both model constants
    const lab = buildTyreLab(withPractice(90.0, 89.5, 92.0), INTERLAGOS_RACE_ID);
    expect(lab.data.deltas.M).toBe(0.55);
    expect(lab.data.deltas.H).toBe(1.05);
    expect(lab.data.paceSource.M).toBe('model');
    expect(lab.data.paceSource.H).toBe('model');
    expect(lab.data.sameTierFallback).toBe(true);
    // the M record keeps its raw value and the assumption names the clamp
    expect(lab.data.paceMeasured.M?.rawDelta).toBeCloseTo(-0.5, 3);
    expect(lab.assumptions.some((a) => a.text.includes('bị kẹp biên/sanity'))).toBe(true);
  });

  it('row 4 — both clamped → model / model (no usable measurement survives)', () => {
    // M degenerate AND H under the 0.1 floor — both clamps fire
    const lab = buildTyreLab(withPractice(90.0, 89.5, 89.7), INTERLAGOS_RACE_ID);
    expect(lab.data.deltas.M).toBe(0.55);
    expect(lab.data.deltas.H).toBe(1.05);
    expect(lab.data.paceSource.M).toBe('model');
    expect(lab.data.paceSource.H).toBe('model');
    // both sides unusable → NOT the same-tier fallback — its own assumption
    expect(lab.data.sameTierFallback).toBe(false);
    expect(
      lab.assumptions.some((a) => a.text.includes('Cả M và H đều đo được nhưng bị clamp')),
    ).toBe(true);
  });

  it('row 5 — both unmeasured → model / model (MarinaBay, unchanged)', () => {
    const lab = buildTyreLab(buildMarinaBayModel(), MARINA_RACE_ID);
    expect(lab.data.deltas.M).toBe(0.55);
    expect(lab.data.deltas.H).toBe(1.05);
    expect(lab.data.paceSource.M).toBe('model');
    expect(lab.data.paceSource.H).toBe('model');
    // neither compound has a practice record — the deltas are the DEFAULTS
    // (sameTierFallback only fires when exactly one side is usable)
    expect(lab.data.sameTierFallback).toBe(false);
    expect(lab.data.paceMeasured.M).toBeNull();
    expect(lab.data.paceMeasured.H).toBeNull();
  });

  it('allocation and clamped never appear as a ranking source — any scenario', () => {
    for (const model of [
      buildInterlagosModel(),
      withPractice(90.0, 89.5, 92.0),
      withPractice(90.0, 89.5, 89.7),
      buildMarinaBayModel(),
    ]) {
      const lab = buildTyreLab(model, model.races[0].raceId);
      for (const c of ['M', 'H'] as const) {
        expect(['allocation', 'clamped']).not.toContain(lab.data.paceSource[c]);
      }
    }
  });
});

describe('v0.9.3 buildTyreLab — Interlagos DoD (prompt §4, save2.sav numbers)', () => {
  const lab = buildTyreLab(buildInterlagosModel(), INTERLAGOS_RACE_ID);
  const data = lab.data;

  it('ranking deltas are the model constants — no allocation anywhere', () => {
    expect(data.deltas).toEqual({ S: 0, M: 0.55, H: 1.05 });
    expect(data.paceSource.M).toBe('model');
    expect(data.paceSource.H).toBe('model');
    // the measured records stay visible as evidence
    expect(data.paceMeasured.M).toEqual({ delta: expect.closeTo(0.97, 3), source: 'session' });
    expect(data.paceMeasured.H).toEqual({
      delta: expect.closeTo(1.12, 3),
      source: 'session',
      rawDelta: expect.closeTo(0.384, 3),
    });
  });

  it('lives from the field medians 30/45/64; garage cap 27/42/58', () => {
    expect(data.lives).toEqual({ S: 30, M: 45, H: 64 });
    expect(data.lifeSource).toEqual({ S: 'allocation', M: 'allocation', H: 'allocation' });
    expect(data.inventory!.maxStint).toEqual({ S: 27, M: 42, H: 58 });
  });

  it('lead: S→S→M (S20/S20/M31) pit 20,40 · 93.2s · vsBest +0.0 · model 86.5s', () => {
    const best = data.best!;
    expect(best.order.join('→')).toBe('S→S→M');
    expect(best.stints.map((s) => [s.compound, s.laps])).toEqual([
      ['S', 20],
      ['S', 20],
      ['M', 31],
    ]);
    expect(best.pitLaps).toEqual([20, 40]);
    expect(best.timeS).toBe(93.2);
    expect(best.vsBestS).toBe(0);
    expect(best.modelTimeS).toBeCloseTo(86.5, 1);
  });

  it('lead set assignment: S20 = #0 (27), S20 = #2 (27), M31 = #9 (42) — all fresh', () => {
    const sets = data.best!.stints.map((s) => s.setUsed);
    // v0.9.4: the never-set `spare` flag is gone — the label reads `fresh`
    expect(sets[0]).toEqual({ tyreSetId: 0, fresh: true, life: 27 });
    expect(sets[1]).toEqual({ tyreSetId: 2, fresh: true, life: 27 });
    expect(sets[2]).toEqual({ tyreSetId: 9, fresh: true, life: 42 });
  });

  it('trail: M→S→S pit 31,51 · 93.2s — exact tie, pits 11 and 11 laps clear', () => {
    const trail = data.carPlans!.trail!;
    expect(trail.plan.order.join('→')).toBe('M→S→S');
    expect(trail.plan.stints.map((s) => [s.compound, s.laps])).toEqual([
      ['M', 31],
      ['S', 20],
      ['S', 20],
    ]);
    expect(trail.plan.pitLaps).toEqual([31, 51]);
    expect(trail.plan.timeS).toBe(93.2);
    expect(data.carPlans!.tie).toBe(true);
    // the trail's M stint runs the trail car's own fresh M set #9
    expect(trail.plan.stints[0].setUsed!.tyreSetId).toBe(9);
    // ≥3 laps clear of the lead's pits (20,40): gaps 11 and 11
    const gaps = trail.plan.pitLaps.map((l, i) => Math.abs(l - data.best!.pitLaps[i]));
    for (const g of gaps) expect(g).toBeGreaterThanOrEqual(3);
  });

  it('S→M→S — the order Nguyen ran — is the same 93.2s multiset (rank 3)', () => {
    const sms = data.strategies.find((s) => s.order.join('→') === 'S→M→S')!;
    expect(sms.timeS).toBe(93.2);
    expect(sms.stints.map((s) => s.laps).sort((a, b) => b - a)).toEqual([31, 20, 20]);
  });

  it('top 6: SSM/MSS/SMS 93.2 · SSMS/SMSS 96.6 (wear +0.4) · SSH 105.6 (+12.4)', () => {
    expect(data.strategies.map((s) => s.order.join('→'))).toEqual([
      'S→S→M',
      'M→S→S',
      'S→M→S',
      'S→S→M→S',
      'S→M→S→S',
      'S→S→H',
    ]);
    /* v0.9.4 — the wear correction moves ONLY the 4-stint plans: their 3rd
       S stint runs a fresh 26-life set (#1/#3) against the 27 cap, pricing
       +0.4s of real deg (S16@26 − S16@27 = +0.445 → +0.4). The 2-stint
       plans and the game-order plan run 27/27/42-life sets = their caps →
       wear 0 → every v0.9.3 number holds. Rank order is untouched. */
    expect(data.strategies.map((s) => s.timeS)).toEqual([93.2, 93.2, 93.2, 96.6, 96.6, 105.6]);
    expect(data.strategies.map((s) => s.vsBestS)).toEqual([0, 0, 0, 3.4, 3.4, 12.4]);
    expect(data.strategies[3]!.wearS).toBe(0.4);
    expect(data.strategies[5]!.wearS).toBeUndefined();
  });

  it('the infeasible note names S→M→M with the exact §4 wording', () => {
    expect(lab.assumptions.some((a) =>
      a.text ===
      'Bỏ phương án nhanh hơn theo model vì kho không chạy được: S→M→M — cần 2 stint M (27 + 26 vòng) nhưng mỗi xe chỉ có 1 bộ M khả dụng (đời 42)',
    )).toBe(true);
  });

  it('confidence stays LOW with exactly the §4 reasons', () => {
    expect(lab.confidence).toBe('LOW');
    const summary = lab.assumptions.find((a) => a.text.startsWith('Confidence LOW:'));
    expect(summary!.text).toBe(
      'Confidence LOW: delta xếp hạng chưa đủ cả M và H từ practice; ' +
        'practice chỉ 1 session đo được delta và allocation lệch quá 0.2s so với practice',
    );
  });

  it('the clamp assumption tells the truth: measured, discarded, raw + allocation as evidence', () => {
    const fallback = lab.assumptions.find((a) => a.text.includes('nhanh hơn M nên không dùng được'));
    expect(fallback).toBeDefined();
    expect(fallback!.text).toContain('+0.384s');
    expect(fallback!.text).toContain('hằng số model cho cả M và H');
    // the OLD lie ("Delta H chưa được đo ở track này") must not appear
    expect(fallback!.text).not.toContain('chưa được đo ở track này');
    expect(fallback!.fallbackValue).toContain('M +0.55s, H +1.05s');
    expect(fallback!.fallbackValue).toContain('giá trị thô H +0.384s');
    expect(fallback!.fallbackValue).toContain('allocation H +0.71s');
  });

  it('game plan S→S→H (pit 19,33) re-priced to 121.5s on the new deltas (old 108.3s)', () => {
    const gp = data.gamePlan!;
    expect(gp.compounds).toEqual(['S', 'S', 'H']);
    expect(gp.pitLaps).toEqual([19, 33]);
    // the engine's stint convention: the pit lap belongs to the NEXT stint's
    // pricing boundary — 18 + 14 + 39 = 71
    expect(gp.stintLaps).toEqual([18, 14, 39]);
    expect(gp.totalTimeS).toBe(121.5);
  });
});
