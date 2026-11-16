/**
 * v0.9.7 — the free-form simulator's pricing law, locked against the REAL
 * save numbers (prompt §1.5 — every case below was measured by the owner on
 * autosave-5.sav / save1.sav with this exact engine; the fixtures carry the
 * owner-verified SQL values and the numbers below flow THROUGH the engine,
 * never around it):
 *
 *   · B1–B8: Shanghai 2028 builder cases on Xe 1's own garage
 *     (cap S27/M41/H59, I/W priced at the field wet lives 84/109);
 *   · V1–V3: Vegas builder cases on Xe 2's own garage (cap S18/M31/H47,
 *     wet lives 99/128) — V1 must equal the trail card's numbers exactly
 *     (75.7s / +0.2), the proof that the builder prices like the lab;
 *   · the wear law (per-stint round-0.1-first, absent-when-0), the cliff,
 *     the frac clamp and the labelled wet assumptions are all exercised.
 */

import { describe, it, expect } from 'vitest';
import {
  priceManualPlan,
  wetPace,
  SIM_DEG,
  ORACLE_DEG,
  stintDegPenaltyWith,
  priceFixedStints,
  pitCostAtLap,
} from '@/engines/tyre.engine';
import {
  buildShanghaiModel,
  SHANGHAI_RACE_ID,
} from '../helpers/shanghai-2028-fixture';
import {
  buildVegasModel,
  VEGAS_RACE_ID,
} from '../helpers/vegas-fixture';

describe('wetPace — the game carries wet pace (prompt §0, real-save numbers)', () => {
  it('Shanghai: S 94.24 → I +7.33 (n=110) / W +18.10 (n=66), lives 84/109', () => {
    const wp = wetPace(buildShanghaiModel())!;
    expect(wp.elt.S).toBeCloseTo(94.24, 2);
    expect(wp.elt.I).toBeCloseTo(101.57, 2);
    expect(wp.elt.W).toBeCloseTo(112.34, 2);
    expect(wp.deltas.I).toBe(7.33);
    expect(wp.deltas.W).toBe(18.1);
    expect(wp.lives.I).toBe(84);
    expect(wp.lives.W).toBe(109);
    expect(wp.samples.I).toBe(110);
    expect(wp.samples.W).toBe(66);
  });

  it('Vegas: S 97.86 → I +8.63 (n=110) / W +20.35 (n=44), lives 99/128', () => {
    const wp = wetPace(buildVegasModel())!;
    expect(wp.elt.S).toBeCloseTo(97.86, 2);
    expect(wp.deltas.I).toBe(8.63);
    expect(wp.deltas.W).toBe(20.35);
    expect(wp.lives.I).toBe(99);
    expect(wp.lives.W).toBe(128);
    expect(wp.samples.I).toBe(110);
    expect(wp.samples.W).toBe(44);
  });
});

describe('SIM_DEG — I/W borrow the M curve, oracle values untouched', () => {
  it('S/M/H keys equal ORACLE_DEG; I/W equal M (final 2.0, cliff 0.02)', () => {
    for (const c of ['S', 'M', 'H'] as const) {
      expect(SIM_DEG.final[c]).toBe(ORACLE_DEG.final[c]);
      expect(SIM_DEG.cliff[c]).toBe(ORACLE_DEG.cliff[c]);
    }
    expect(SIM_DEG.final.I).toBe(2.0);
    expect(SIM_DEG.final.W).toBe(2.0);
    expect(SIM_DEG.cliff.I).toBe(0.02);
    expect(SIM_DEG.cliff.W).toBe(0.02);
    expect(SIM_DEG.cliffThreshold).toBe(ORACLE_DEG.cliffThreshold);
  });

  it('pricing an I stint with SIM_DEG equals the M curve arithmetic', () => {
    // deg(11, 84) = 2 × (11/3) × (11/84)², no cliff (11 < 0.6 × 84)
    expect(stintDegPenaltyWith(SIM_DEG, 'I', 11, 84)).toBeCloseTo(
      2 * (11 / 3) * Math.pow(11 / 84, 2),
      10,
    );
  });
});

describe('pitCostAtLap — cheapest covering window wins (Shanghai cols 13/20)', () => {
  const cols = { pitLaneS: 20, scS: 13 };
  it('no window → green 20.7; SC → 13.455; VSC → 17.0775', () => {
    expect(pitCostAtLap(10, 20.7, cols, [])).toBe(20.7);
    expect(pitCostAtLap(19, 20.7, cols, [{ mode: 'sc', startLap: 19, laps: 3 }])).toBeCloseTo(13.455, 10);
    expect(pitCostAtLap(38, 20.7, cols, [{ mode: 'vsc', startLap: 37, laps: 3 }])).toBeCloseTo(17.0775, 10);
  });
  it('overlap: the SC window (cheaper) wins, no stacking', () => {
    const events = [
      { mode: 'sc' as const, startLap: 17, laps: 3 },
      { mode: 'vsc' as const, startLap: 18, laps: 3 },
    ];
    expect(pitCostAtLap(19, 20.7, cols, events)).toBeCloseTo(13.455, 10);
  });
});

describe('priceFixedStints — fixed pricing, no re-split', () => {
  it('sums delta×laps + deg at the priced lives + pit costs (B1 arithmetic)', () => {
    const r = priceFixedStints(
      [
        { compound: 'S', laps: 19 },
        { compound: 'M', laps: 18 },
        { compound: 'M', laps: 19 },
      ],
      { S: 27, M: 41, H: 59, I: 84, W: 109 },
      { S: 0, M: 1.21, H: 1.25, I: 7.33, W: 18.1 },
      () => 20.7,
    );
    expect(r.timeS).toBe(100.8);
    expect(r.pitLaps).toEqual([19, 37]);
    expect(r.stints.map((s) => [s.fromLap, s.toLap])).toEqual([[1, 19], [20, 37], [38, 56]]);
    expect(r.stints[0]!.degS).toBeCloseTo(9.64398, 4); // cliff included
  });
});

describe('priceManualPlan — Shanghai 2028 (autosave-5.sav numbers, Xe 1)', () => {
  const model = buildShanghaiModel();

  it('B1: S19/M18/M19 → 100.4s · wear −0.4 · vsBest +17.3 · base 100.8 · pits [19,37]', () => {
    const r = priceManualPlan(model, SHANGHAI_RACE_ID, 0, [
      { compound: 'S', laps: 19 },
      { compound: 'M', laps: 18 },
      { compound: 'M', laps: 19 },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.timeS).toBe(100.4);
    expect(r.plan.wearS).toBe(-0.4);
    expect(r.plan.vsBestS).toBe(17.3);
    expect(r.plan.baseTimeS).toBe(100.8);
    expect(r.plan.pitLaps).toEqual([19, 37]);
    expect(r.plan.order).toEqual(['S', 'M', 'M']);
    expect(r.plan.stops).toBe(2);
    expect(r.carLabel).toBe('Xe 1');
    // sets: S19=#3 fresh 28 (w −0.8), M18=#7 used 37 (w +0.5), M19=#9 fresh 42 (w −0.1)
    expect(r.plan.stints.map((s) => s.setUsed)).toEqual([
      { tyreSetId: 3, fresh: true, life: 28 },
      { tyreSetId: 7, fresh: false, life: 37 },
      { tyreSetId: 9, fresh: true, life: 42 },
    ]);
    expect(r.plan.stints.map((s) => s.wearS)).toEqual([-0.8, 0.5, -0.1]);
    expect(r.assumptions).toEqual([]);
  });

  it('B2: M13/S13/M13/M17 → INFEASIBLE, the M-count shortfall only', () => {
    const r = priceManualPlan(model, SHANGHAI_RACE_ID, 0, [
      { compound: 'M', laps: 13 },
      { compound: 'S', laps: 13 },
      { compound: 'M', laps: 13 },
      { compound: 'M', laps: 17 },
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toEqual(['cần 3 stint M nhưng xe chỉ có 2 bộ M khả dụng']);
  });

  it('B3: S28/I11/S17 + rain [29,39] → 160.2s · wear −0.9 · vsBest +77.1 · base 161.1 · 2 assumptions', () => {
    const r = priceManualPlan(
      model,
      SHANGHAI_RACE_ID,
      0,
      [
        { compound: 'S', laps: 28 },
        { compound: 'I', laps: 11 },
        { compound: 'S', laps: 17 },
      ],
      { rain: [{ startLap: 29, laps: 11 }] },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.timeS).toBe(160.2);
    expect(r.plan.wearS).toBe(-0.9);
    expect(r.plan.vsBestS).toBe(77.1);
    expect(r.plan.baseTimeS).toBe(161.1);
    expect(r.plan.pitLaps).toEqual([28, 39]);
    // sets: S28=#3f (w −0.4), I11=#12f (absent), S17=#5f (w −0.5)
    expect(r.plan.stints.map((s) => s.setUsed)).toEqual([
      { tyreSetId: 3, fresh: true, life: 28 },
      { tyreSetId: 12, fresh: true, life: 82 },
      { tyreSetId: 5, fresh: true, life: 28 },
    ]);
    expect(r.plan.stints.map((s) => s.wearS)).toEqual([-0.4, undefined, -0.5]);
    // exactly the pace-ELT + deg-M-curve assumptions — the I stint sits
    // INSIDE the rain window, so no dry-under-wet caveat
    expect(r.assumptions).toHaveLength(2);
    expect(r.assumptions[0]).toBe(
      'pace I/W = ELT trung vị toàn trường của game cho lốp mưa (pace trên đường ướt theo game, không phải số đo practice)',
    );
    expect(r.assumptions[1]).toBe(
      'deg I/W mượn curve của M (save không có hằng số deg cho lốp mưa — giả định gán nhãn)',
    );
  });

  it('B4: S19/M18/S19 + rain [29,39] → INFEASIBLE, both slick-in-rain errors', () => {
    const r = priceManualPlan(
      model,
      SHANGHAI_RACE_ID,
      0,
      [
        { compound: 'S', laps: 19 },
        { compound: 'M', laps: 18 },
        { compound: 'S', laps: 19 },
      ],
      { rain: [{ startLap: 29, laps: 11 }] },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toEqual([
      'stint M vòng 20–37 chạy slick trong mưa (cửa sổ 29–39)',
      'stint S vòng 38–56 chạy slick trong mưa (cửa sổ 29–39)',
    ]);
  });

  it('B5: S19/I18/S19 no rain → 191.6s · wear −1.6 · vsBest +108.5 · base 193.2 · 3 assumptions', () => {
    const r = priceManualPlan(model, SHANGHAI_RACE_ID, 0, [
      { compound: 'S', laps: 19 },
      { compound: 'I', laps: 18 },
      { compound: 'S', laps: 19 },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.timeS).toBe(191.6);
    expect(r.plan.wearS).toBe(-1.6);
    expect(r.plan.vsBestS).toBe(108.5);
    expect(r.plan.baseTimeS).toBe(193.2);
    expect(r.plan.pitLaps).toEqual([19, 37]);
    expect(r.plan.stints.map((s) => s.setUsed)).toEqual([
      { tyreSetId: 3, fresh: true, life: 28 },
      { tyreSetId: 12, fresh: true, life: 82 },
      { tyreSetId: 5, fresh: true, life: 28 },
    ]);
    // the I stint runs on DRY → the lower-bound caveat joins the two wet ones
    expect(r.assumptions).toHaveLength(3);
    expect(r.assumptions[2]).toBe(
      'stint I/W chạy trên khô: giá dùng delta ELT ướt của game — thực tế còn chậm hơn, số này là cận dưới (lạc quan)',
    );
  });

  it('B6: H56 no-stop → 353.8s · wear ABSENT · vsBest +270.7 · pits [] · set H56=#10f', () => {
    const r = priceManualPlan(model, SHANGHAI_RACE_ID, 0, [{ compound: 'H', laps: 56 }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.timeS).toBe(353.8);
    expect(r.plan.wearS).toBeUndefined();
    expect(r.plan.vsBestS).toBe(270.7);
    expect(r.plan.baseTimeS).toBe(353.8);
    expect(r.plan.pitLaps).toEqual([]);
    expect(r.plan.stops).toBe(0);
    expect(r.plan.stints[0]!.setUsed).toEqual({ tyreSetId: 10, fresh: true, life: 59 });
    expect(r.plan.stints[0]!.wearS).toBeUndefined();
  });

  it('B7: S19/M18 → INFEASIBLE, the lap-total error', () => {
    const r = priceManualPlan(model, SHANGHAI_RACE_ID, 0, [
      { compound: 'S', laps: 19 },
      { compound: 'M', laps: 18 },
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toEqual(['tổng số vòng 37 ≠ 56 vòng của chặng']);
  });

  it('B8: B1 + SC [19,21] → 93.2s · vsBest +10.1 (pit 19 prices at 13.455)', () => {
    const r = priceManualPlan(
      model,
      SHANGHAI_RACE_ID,
      0,
      [
        { compound: 'S', laps: 19 },
        { compound: 'M', laps: 18 },
        { compound: 'M', laps: 19 },
      ],
      { events: [{ mode: 'sc', startLap: 19, laps: 3 }] },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.timeS).toBe(93.2);
    expect(r.plan.wearS).toBe(-0.4);
    expect(r.plan.vsBestS).toBe(10.1);
    // baseTimeS is the rounded priceFixedStints total (93.602… → 93.6)
    expect(r.plan.baseTimeS).toBe(93.6);
  });

  it('validation collects every error at once (lap total + min stint + wet refusal)', () => {
    const r = priceManualPlan(model, SHANGHAI_RACE_ID, 0, [
      { compound: 'S', laps: 2 },
      { compound: 'I', laps: 30 },
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toEqual([
      'tổng số vòng 32 ≠ 56 vòng của chặng',
      'stint S 2 vòng < tối thiểu 4 vòng',
    ]);
  });

  it('a save without wet allocation refuses I/W with the explicit error', () => {
    const dryOnly = buildShanghaiModel();
    dryOnly.tyres = dryOnly.tyres.filter((t) => t.weekendTyreType <= 2);
    const r = priceManualPlan(dryOnly, SHANGHAI_RACE_ID, 0, [
      { compound: 'I', laps: 28 },
      { compound: 'S', laps: 28 },
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toEqual([
      'save không có allocation lốp mưa (I/W) — không định giá được Inter/Wet',
    ]);
  });
});

describe('priceManualPlan — Vegas (save1.sav numbers, Xe 2)', () => {
  const model = buildVegasModel();

  it('V1: M24/S13/S13 → 75.7s · wear +0.2 · vsBest +3.0 · base 75.5 — equals the trail card', () => {
    const r = priceManualPlan(model, VEGAS_RACE_ID, 1, [
      { compound: 'M', laps: 24 },
      { compound: 'S', laps: 13 },
      { compound: 'S', laps: 13 },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.timeS).toBe(75.7);
    expect(r.plan.wearS).toBe(0.2);
    expect(r.plan.vsBestS).toBe(3.0);
    expect(r.plan.baseTimeS).toBe(75.5);
    expect(r.plan.pitLaps).toEqual([24, 37]);
    expect(r.carLabel).toBe('Xe 2');
    // sets: M24=#8 fresh 31, S13=#0 worn 18 (+0.1), S13=#3 worn 18 (+0.1)
    expect(r.plan.stints.map((s) => s.setUsed)).toEqual([
      { tyreSetId: 8, fresh: true, life: 31 },
      { tyreSetId: 0, fresh: false, life: 18 },
      { tyreSetId: 3, fresh: false, life: 18 },
    ]);
    expect(r.plan.stints.map((s) => s.wearS)).toEqual([undefined, 0.1, 0.1]);
    expect(r.assumptions).toEqual([]);
  });

  it('V2: S19/M15/S16 → INFEASIBLE, the S-life shortfall at rank 1', () => {
    const r = priceManualPlan(model, VEGAS_RACE_ID, 1, [
      { compound: 'S', laps: 19 },
      { compound: 'M', laps: 15 },
      { compound: 'S', laps: 16 },
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toEqual(['stint S dài nhất 19 vòng vượt đời bộ S thứ 1 (18 vòng)']);
  });

  it('V3: M19/I10/M21 + rain [20,29] → 155.9s · wear ABSENT · vsBest +83.2 · base 155.9', () => {
    const r = priceManualPlan(
      model,
      VEGAS_RACE_ID,
      1,
      [
        { compound: 'M', laps: 19 },
        { compound: 'I', laps: 10 },
        { compound: 'M', laps: 21 },
      ],
      { rain: [{ startLap: 20, laps: 10 }] },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.timeS).toBe(155.9);
    expect(r.plan.wearS).toBeUndefined();
    expect(r.plan.vsBestS).toBe(83.2);
    expect(r.plan.baseTimeS).toBe(155.9);
    expect(r.plan.pitLaps).toEqual([19, 29]);
    // sets: M19=#9 fresh 31, I10=#13 fresh 91, M21=#8 fresh 31
    expect(r.plan.stints.map((s) => s.setUsed)).toEqual([
      { tyreSetId: 9, fresh: true, life: 31 },
      { tyreSetId: 13, fresh: true, life: 91 },
      { tyreSetId: 8, fresh: true, life: 31 },
    ]);
    expect(r.plan.stints.map((s) => s.wearS)).toEqual([undefined, undefined, undefined]);
    expect(r.assumptions).toHaveLength(2); // inside the rain window — no dry caveat
  });

  it('an unknown car index fails honestly', () => {
    const r = priceManualPlan(model, VEGAS_RACE_ID, 7, [{ compound: 'S', laps: 50 }]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toEqual(['không có xe 8 trong kho']);
  });
});
