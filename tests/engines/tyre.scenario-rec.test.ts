/**
 * v0.11.0 — the scenario recommender (`recommendUnderScenario`), locked
 * against the REAL save numbers (the Shanghai 2028 fixture carries the
 * owner-verified SQL values of autosave-5.sav / race 212 / 56 laps — the
 * same law as tyre.sim.test.ts; every number below flows THROUGH the
 * engine, never around it):
 *
 *   · SC [25,27]  → S→M→S, pit 25/38, 80.2s — the plan the old SC card
 *     could NEVER see (outside the ranked top 6): its pit 25 sits inside
 *     the window, the lead stays at 83.1s → −2.9s, verdict switch;
 *   · SC [19,21]  → S→S→M, pit 19/38, 75.8s — the LEAD's own order, pit 1
 *     already inside the window → −7.3s ("giữ plan, pit ở V19 dưới SC");
 *     the exact price tie with order-equivalent S→M→S resolves to the
 *     seed's own signature;
 *   · rain [19,28] → S18/I10/S28, pit 18/28, 154.1s; alternates
 *     S18/I11/S27 157.9s + S18/I10/M28 164.6s; the lead plan is
 *     INFEASIBLE under rain (both slick stints inside the window) →
 *     verdict switch is mandatory;
 *   · parity: the search's own price for a plan equals a straight
 *     `priceManualPlan` call on the same stints + scenario — one pricing
 *     law, two entry points;
 *   · the honest-off law: no scenario → null; SC events without the
 *     track's Races_Tracks columns → null (rain-only still works).
 */

import { describe, it, expect } from 'vitest';
import {
  recommendUnderScenario,
  priceManualPlan,
} from '@/engines/tyre.engine';
import type { SaveModel } from '@/domain/types';
import {
  buildShanghaiModel,
  SHANGHAI_RACE_ID,
} from '../helpers/shanghai-2028-fixture';

const SC2527 = { mode: 'sc' as const, startLap: 25, laps: 3 };
const SC1921 = { mode: 'sc' as const, startLap: 19, laps: 3 };
const RAIN1928 = { startLap: 19, laps: 10 };

describe('recommendUnderScenario — SC [25,27] (the plan the top-6 card never saw)', () => {
  const model: SaveModel = buildShanghaiModel();

  it('recommends S→M→S pit 25/38 at 80.2s — 2.9s under the lead, switch', () => {
    const rec = recommendUnderScenario(model, SHANGHAI_RACE_ID, 0, {
      events: [SC2527],
      rain: [],
    })!;
    expect(rec).not.toBeNull();
    expect(rec.recommendation.order).toEqual(['S', 'M', 'S']);
    expect(rec.recommendation.pitLaps).toEqual([25, 38]);
    expect(rec.recommendation.timeS).toBe(80.2);
    expect(rec.recommendation.stints.map((s) => s.laps)).toEqual([25, 13, 18]);
    expect(rec.currentGreenS).toBe(83.1);
    expect(rec.deltaS).toBe(-2.9);
    expect(rec.verdict).toBe('switch');
    /* the lead plan has no pit inside [25,27] — it re-prices to its own
       green number, still feasible */
    expect(rec.currentUnderScenario.feasible).toBe(true);
    if (rec.currentUnderScenario.feasible) {
      expect(rec.currentUnderScenario.plan.timeS).toBe(83.1);
    }
  });

  it('carries the SC-ratio assumption with the track\'s real columns', () => {
    const rec = recommendUnderScenario(model, SHANGHAI_RACE_ID, 0, {
      events: [SC2527],
      rain: [],
    })!;
    const a = rec.assumptions.find((x) => x.key === 'scRatio');
    expect(a).toBeDefined();
    expect(a!.params.sc).toBe(13);
    expect(a!.params.pit).toBe(20);
    expect(a!.params.cost).toBe('13.5');
  });

  it('alternates are distinct plans sorted by price (80.2 tie, then 80.5)', () => {
    const rec = recommendUnderScenario(model, SHANGHAI_RACE_ID, 0, {
      events: [SC2527],
      rain: [],
    })!;
    expect(rec.alternates.length).toBe(2);
    expect(rec.alternates[0]!.timeS).toBeGreaterThanOrEqual(rec.recommendation.timeS);
    expect(rec.alternates[1]!.timeS).toBeGreaterThanOrEqual(rec.alternates[0]!.timeS);
    const sig = (p: { order: string[]; stints: { laps: number }[] }): string =>
      `${p.order.join('→')}:${p.stints.map((s) => s.laps).join('/')}`;
    expect(sig(rec.recommendation)).not.toBe(sig(rec.alternates[0]!));
    expect(sig(rec.alternates[0]!)).not.toBe(sig(rec.alternates[1]!));
  });
});

describe('recommendUnderScenario — SC [19,21] (keep the plan, pit under SC)', () => {
  const model: SaveModel = buildShanghaiModel();

  it('recommends the lead\'s own S→S→M pit 19/38 at 75.8s — 7.3s under green', () => {
    const rec = recommendUnderScenario(model, SHANGHAI_RACE_ID, 0, {
      events: [SC1921],
      rain: [],
    })!;
    expect(rec.recommendation.order).toEqual(['S', 'S', 'M']);
    expect(rec.recommendation.pitLaps).toEqual([19, 38]);
    expect(rec.recommendation.timeS).toBe(75.8);
    expect(rec.deltaS).toBe(-7.3);
    expect(rec.verdict).toBe('switch');
    /* the recommendation IS the seed plan: same stint signature, priced
       under the scenario — the "giữ plan" reading, not an order swap */
    expect(rec.currentUnderScenario.feasible).toBe(true);
    if (rec.currentUnderScenario.feasible) {
      expect(rec.currentUnderScenario.plan.timeS).toBe(75.8);
      expect(rec.currentUnderScenario.plan.order).toEqual(['S', 'S', 'M']);
    }
  });
});

describe('recommendUnderScenario — rain [19,28] (the lead cannot run at all)', () => {
  const model: SaveModel = buildShanghaiModel();

  it('recommends S18/I10/S28 pit 18/28 at 154.1s; verdict switch is mandatory', () => {
    const rec = recommendUnderScenario(model, SHANGHAI_RACE_ID, 0, {
      events: [],
      rain: [RAIN1928],
    })!;
    expect(rec.recommendation.order).toEqual(['S', 'I', 'S']);
    expect(rec.recommendation.pitLaps).toEqual([18, 28]);
    expect(rec.recommendation.timeS).toBe(154.1);
    expect(rec.currentUnderScenario.feasible).toBe(false);
    if (!rec.currentUnderScenario.feasible) {
      /* BOTH slick stints are named, verbatim engine strings */
      expect(rec.currentUnderScenario.errors.length).toBe(2);
      expect(rec.currentUnderScenario.errors[0]).toContain(
        'stint S vòng 1–19 chạy slick trong mưa (cửa sổ 19–28)',
      );
      expect(rec.currentUnderScenario.errors[1]).toContain(
        'stint S vòng 20–38 chạy slick trong mưa (cửa sổ 19–28)',
      );
    }
    expect(rec.verdict).toBe('switch');
  });

  it('alternates: S18/I11/S27 157.9s then S18/I10/M28 164.6s', () => {
    const rec = recommendUnderScenario(model, SHANGHAI_RACE_ID, 0, {
      events: [],
      rain: [RAIN1928],
    })!;
    expect(rec.alternates.map((a) => a.order)).toEqual([
      ['S', 'I', 'S'],
      ['S', 'I', 'M'],
    ]);
    expect(rec.alternates[0]!.pitLaps).toEqual([18, 29]);
    expect(rec.alternates[0]!.timeS).toBe(157.9);
    expect(rec.alternates[1]!.pitLaps).toEqual([18, 28]);
    expect(rec.alternates[1]!.timeS).toBe(164.6);
  });

  it('the recommendation carries the wet-deg-borrowed assumption', () => {
    const rec = recommendUnderScenario(model, SHANGHAI_RACE_ID, 0, {
      events: [],
      rain: [RAIN1928],
    })!;
    expect(rec.assumptions.some((a) => a.key === 'wetDegBorrowed')).toBe(true);
    expect(rec.assumptions.some((a) => a.key === 'scRatio')).toBe(false);
  });
});

describe('recommendUnderScenario — the honest edges', () => {
  const model: SaveModel = buildShanghaiModel();

  it('no scenario (events + rain both empty) → null, nothing invented', () => {
    expect(
      recommendUnderScenario(model, SHANGHAI_RACE_ID, 0, { events: [], rain: [] }),
    ).toBeNull();
  });

  it('SC events without the track columns → null; rain-only still prices', () => {
    const stripped: SaveModel = {
      ...model,
      races: model.races.map((r) =>
        r.raceId === SHANGHAI_RACE_ID
          ? { ...r, trackPitLaneTimeLossS: undefined, trackSafetyCarTimeLossS: undefined }
          : r,
      ),
    };
    expect(
      recommendUnderScenario(stripped, SHANGHAI_RACE_ID, 0, {
        events: [SC2527],
        rain: [],
      }),
    ).toBeNull();
    const rec = recommendUnderScenario(stripped, SHANGHAI_RACE_ID, 0, {
      events: [],
      rain: [RAIN1928],
    })!;
    expect(rec.recommendation.timeS).toBe(154.1);
    expect(rec.assumptions.some((a) => a.key === 'scRatio')).toBe(false);
  });

  it('a missing car index → null (never prices on an invented garage)', () => {
    expect(
      recommendUnderScenario(model, SHANGHAI_RACE_ID, 9, {
        events: [SC2527],
        rain: [],
      }),
    ).toBeNull();
  });
});

describe('recommendUnderScenario — pricing parity with priceManualPlan', () => {
  const model: SaveModel = buildShanghaiModel();

  it('the SC recommendation priced by priceManualPlan equals the search price', () => {
    const rec = recommendUnderScenario(model, SHANGHAI_RACE_ID, 0, {
      events: [SC2527],
      rain: [],
    })!;
    const p = priceManualPlan(
      model,
      SHANGHAI_RACE_ID,
      0,
      rec.recommendation.stints.map((s) => ({ compound: s.compound, laps: s.laps })),
      { events: [SC2527], rain: [] },
    );
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.plan.timeS).toBe(rec.recommendation.timeS);
  });

  it('the rain recommendation priced by priceManualPlan equals the search price', () => {
    const rec = recommendUnderScenario(model, SHANGHAI_RACE_ID, 0, {
      events: [],
      rain: [RAIN1928],
    })!;
    const p = priceManualPlan(
      model,
      SHANGHAI_RACE_ID,
      0,
      rec.recommendation.stints.map((s) => ({ compound: s.compound, laps: s.laps })),
      { events: [], rain: [RAIN1928] },
    );
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.plan.timeS).toBe(rec.recommendation.timeS);
  });

  it('each alternate also prices identically through priceManualPlan', () => {
    const rec = recommendUnderScenario(model, SHANGHAI_RACE_ID, 0, {
      events: [],
      rain: [RAIN1928],
    })!;
    for (const alt of rec.alternates) {
      const p = priceManualPlan(
        model,
        SHANGHAI_RACE_ID,
        0,
        alt.stints.map((s) => ({ compound: s.compound, laps: s.laps })),
        { events: [], rain: [RAIN1928] },
      );
      expect(p.ok).toBe(true);
      if (p.ok) expect(p.plan.timeS).toBe(alt.timeS);
    }
  });
});
