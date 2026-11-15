/**
 * v0.9.1 — the set-assignment feasibility law (prompt §2) locked against
 * the REAL MarinaBay save numbers (autosave-4.sav, Day 46663, race 204,
 * 62 laps — Nguyen found the bug, assistant verified 2026-11-15):
 *
 *   · v0.8.1 proposed lead S→M→M (S16/M23/M23, 94.0s) — but each car owns
 *     exactly 1 usable M set (fresh #8, life 31); the two other M sets are
 *     locked (AvailabilityState 2). A 2-stint M plan was never runnable.
 *   · v0.9.1 lead: S→S→M (S17/S18/M27), pit 17,35 · 97.1s; trail M→S→S
 *     (M27/S17/S18), pit 27,44 · 97.1s — a dead tie → hedge split.
 *   · No 2-M and no 2-H plan anywhere; 22 of 52 sanity-passed plans remain.
 *   · Monza regression (save4.sav Day 46635): lead S(19)→M(34) 57.6s and
 *     trail M(34)→S(19) 57.6s unchanged (locked in grid.engine.test.ts).
 *
 * The tyre numbers are the save's own (prompt §0/§5); the engine prices are
 * cross-checked by scripts/compute-marina-feasible.ts.
 */

import { describe, it, expect } from 'vitest';
import {
  buildTyreLab,
  buildWetPlan,
  whatIfPitShift,
  evaluateStrategy,
  type StrategyResult,
} from '@/engines/tyre.engine';
import {
  assignSetsForCar,
  isPlanFeasibleForCar,
  type InventorySet,
  type InventoryCar,
} from '@/engines/grid.engine';
import {
  buildMarinaBayModel,
  MARINA_RACE_ID,
  MARINA_LAPS,
} from '../helpers/marinabay-fixture';
import { buildSilverstoneModel, SILVERSTONE_LAPS } from '../helpers/silverstone-fixture';

/* ── the MarinaBay per-car stock, as InventorySet rows ───────────────────── */

const marinaSets = (offset: number): InventorySet[] => [
  { tyreSetId: offset + 1, compound: 'S', wear: 1, lifeRemaining: 21, lapsCompleted: 0, sessionLastUsedIn: null, available: true, fresh: true },
  { tyreSetId: offset + 2, compound: 'S', wear: 1, lifeRemaining: 21, lapsCompleted: 0, sessionLastUsedIn: null, available: true, fresh: true },
  { tyreSetId: offset + 3, compound: 'S', wear: 1, lifeRemaining: 21, lapsCompleted: 0, sessionLastUsedIn: null, available: true, fresh: true },
  { tyreSetId: offset + 4, compound: 'S', wear: 0.45, lifeRemaining: 19, lapsCompleted: 14, sessionLastUsedIn: 1, available: true, fresh: false },
  { tyreSetId: offset + 5, compound: 'S', wear: 0.48, lifeRemaining: 19, lapsCompleted: 12, sessionLastUsedIn: 1, available: true, fresh: false },
  { tyreSetId: offset + 6, compound: 'M', wear: 0.62, lifeRemaining: 18, lapsCompleted: 22, sessionLastUsedIn: 2, available: false, fresh: false },
  { tyreSetId: offset + 7, compound: 'M', wear: 0.75, lifeRemaining: 22, lapsCompleted: 18, sessionLastUsedIn: 1, available: false, fresh: false },
  { tyreSetId: offset + 8, compound: 'M', wear: 1, lifeRemaining: 31, lapsCompleted: 0, sessionLastUsedIn: null, available: true, fresh: true },
  { tyreSetId: offset + 9, compound: 'H', wear: 1, lifeRemaining: 48, lapsCompleted: 0, sessionLastUsedIn: null, available: true, fresh: true },
];

const marinaCar = (carId: number, offset: number): InventoryCar => ({
  carId,
  label: `Xe ${carId + 1}`,
  driverId: null,
  seatVerified: false,
  sets: marinaSets(offset),
  aggregate: [],
});

/* ── the law itself (prompt §2) ──────────────────────────────────────────── */

describe('assignSetsForCar — the greedy per-car law (prompt §2)', () => {
  it('assigns longest stint ↔ longest-life set when the stock fits', () => {
    const out = assignSetsForCar(marinaSets(0), [
      { compound: 'S', laps: 17 },
      { compound: 'S', laps: 18 },
      { compound: 'M', laps: 27 },
    ]);
    expect(out).not.toBeNull();
    // longest stint first: S18 (index 1) takes pool[0] = set #1, S17 takes #2,
    // M 27 takes the fresh #8 — longest stint ↔ longest-life set
    const byLaps = out!.sort((a, b) => a.stintIndex - b.stintIndex);
    expect(byLaps.map((a) => a.life)).toEqual([21, 21, 31]);
    expect(byLaps.map((a) => a.tyreSetId)).toEqual([2, 1, 8]);
    expect(byLaps.map((a) => a.fresh)).toEqual([true, true, true]);
  });

  it('returns null when a compound has fewer sets than stints (the MarinaBay 2-M bug)', () => {
    // the exact save shape: two M stints, ONE usable M set per car
    expect(
      assignSetsForCar(marinaSets(0), [
        { compound: 'S', laps: 16 },
        { compound: 'M', laps: 23 },
        { compound: 'M', laps: 23 },
      ]),
    ).toBeNull();
  });

  it('returns null when the 2nd set exists but is too short: M [31,19] vs stints [23,23]', () => {
    const sets: InventorySet[] = [
      { tyreSetId: 1, compound: 'M', wear: 1, lifeRemaining: 31, lapsCompleted: 0, sessionLastUsedIn: null, available: true, fresh: true },
      { tyreSetId: 2, compound: 'M', wear: 0.7, lifeRemaining: 19, lapsCompleted: 10, sessionLastUsedIn: 1, available: true, fresh: false },
    ];
    expect(
      assignSetsForCar(sets, [
        { compound: 'M', laps: 23 },
        { compound: 'M', laps: 23 },
      ]),
    ).toBeNull();
    // and the same stock fits [23, 19]
    expect(
      assignSetsForCar(sets, [
        { compound: 'M', laps: 23 },
        { compound: 'M', laps: 19 },
      ]),
    ).not.toBeNull();
  });

  it('accepts a stint exactly at the set life (the game kills a set AT its life)', () => {
    const sets: InventorySet[] = [
      { tyreSetId: 1, compound: 'M', wear: 1, lifeRemaining: 31, lapsCompleted: 0, sessionLastUsedIn: null, available: true, fresh: true },
    ];
    expect(assignSetsForCar(sets, [{ compound: 'M', laps: 31 }])).not.toBeNull();
    expect(assignSetsForCar(sets, [{ compound: 'M', laps: 32 }])).toBeNull();
  });

  it('never counts a locked (AvailabilityState 2) set — the MarinaBay M 18/22 stay out', () => {
    const lockedOnly: InventorySet[] = marinaSets(0).filter((s) => s.compound === 'M');
    // the only usable M is #8 (life 31): one 31-lap stint fits, two do not
    expect(assignSetsForCar(lockedOnly, [{ compound: 'M', laps: 23 }])).not.toBeNull();
    expect(
      assignSetsForCar(lockedOnly, [
        { compound: 'M', laps: 18 },
        { compound: 'M', laps: 18 },
      ]),
    ).toBeNull();
  });

  it('ignores life-0 rows and never lets another car’s stock help (no team pooling)', () => {
    const carA = marinaCar(0, 0); // full stock
    const carB: InventoryCar = {
      ...marinaCar(1, 100),
      sets: marinaSets(100).filter((s) => s.compound !== 'M'), // car B has NO M at all
    };
    const plan = [
      { compound: 'S', laps: 17 },
      { compound: 'M', laps: 27 },
    ] as const;
    expect(isPlanFeasibleForCar(carA, plan)).toBe(true);
    expect(isPlanFeasibleForCar(carB, plan)).toBe(false);
  });

  it('applies the same law to I/W (wet) compounds', () => {
    const sets: InventorySet[] = [
      { tyreSetId: 1, compound: 'I', wear: 1, lifeRemaining: 48, lapsCompleted: 0, sessionLastUsedIn: null, available: true, fresh: true },
      { tyreSetId: 2, compound: 'W', wear: 1, lifeRemaining: 62, lapsCompleted: 0, sessionLastUsedIn: null, available: true, fresh: true },
    ];
    expect(
      assignSetsForCar(sets, [
        { compound: 'I', laps: 48 },
        { compound: 'W', laps: 4 },
      ]),
    ).not.toBeNull();
    expect(
      assignSetsForCar(sets, [
        { compound: 'I', laps: 20 },
        { compound: 'I', laps: 20 },
      ]),
    ).toBeNull();
  });
});

/* ── the lab on the REAL save numbers (prompt §4 DoD) ────────────────────── */

describe('buildTyreLab — MarinaBay autosave-4.sav (Day 46663, race 204, 62 laps)', () => {
  const lab = buildTyreLab(buildMarinaBayModel(), MARINA_RACE_ID);
  const data = lab.data;

  it('ranks on model lives 22/33/48 and executes on the garage cap 21/31/48', () => {
    expect(data.lives).toEqual({ S: 22, M: 33, H: 48 });
    expect(data.inventory?.maxStint).toEqual({ S: 21, M: 31, H: 48 });
    // no practice measurement → the model constants rank (verified: they
    // reproduce every v0.8.1 price on this save)
    expect(data.deltas).toEqual({ S: 0, M: 0.55, H: 1.05 });
  });

  it('proposes lead S→S→M (S17/S18/M27), pit 17,35 · 97.1s — not S→M→M', () => {
    expect(data.best!.order.join('→')).toBe('S→S→M');
    expect(data.best!.stints.map((s) => `${s.compound}(${s.laps})`)).toEqual([
      'S(17)',
      'S(18)',
      'M(27)',
    ]);
    expect(data.best!.pitLaps).toEqual([17, 35]);
    expect(data.best!.timeS).toBeCloseTo(97.1, 1);
  });

  it('each stint carries its REAL assigned set — the M stint runs fresh set #8 (life 31)', () => {
    const stints = data.best!.stints;
    // longest stint first: S18 → pool[0] (#1), S17 → #2 — both fresh life 21
    // (v0.9.4: the never-set `spare` flag is gone — the label reads `fresh`)
    expect(stints[0]!.setUsed).toMatchObject({ tyreSetId: 2, fresh: true, life: 21 });
    expect(stints[1]!.setUsed).toMatchObject({ tyreSetId: 1, fresh: true, life: 21 });
    expect(stints[2]!.setUsed).toMatchObject({ tyreSetId: 8, fresh: true, life: 31 });
    expect(Object.keys(stints[0]!.setUsed!)).not.toContain('spare');
  });

  it('trail M→S→S (M27/S17/S18), pit 27,44 · 97.1s — dead tie, hedge split', () => {
    const trail = data.carPlans!.trail!;
    expect(data.carPlans!.lead.plan.stints.map((s) => `${s.compound}(${s.laps})`)).toEqual([
      'S(17)',
      'S(18)',
      'M(27)',
    ]);
    expect(trail.plan.stints.map((s) => `${s.compound}(${s.laps})`)).toEqual([
      'M(27)',
      'S(17)',
      'S(18)',
    ]);
    expect(trail.plan.pitLaps).toEqual([27, 44]);
    expect(trail.plan.timeS).toBeCloseTo(97.1, 1);
    expect(trail.reason).toBe('diff-compound');
    expect(data.carPlans!.tie).toBe(true);
    // pits stay ≥ 3 laps clear: 27 vs 17 = 10, 44 vs 35 = 9
    expect(trail.plan.pitLaps.every((p) => data.carPlans!.lead.plan.pitLaps.every((l) => Math.abs(p - l) >= 3))).toBe(true);
    expect(lab.assumptions.some((a) => a.text.includes('tách để tránh dẫm chân + hedge'))).toBe(true);
  });

  it('NO 2-M and NO 2-H plan anywhere in the ranked list', () => {
    for (const plan of data.strategies) {
      const m = plan.stints.filter((s) => s.compound === 'M').length;
      const h = plan.stints.filter((s) => s.compound === 'H').length;
      expect(m).toBeLessThanOrEqual(1);
      expect(h).toBeLessThanOrEqual(1);
    }
    // the old wrong lead is gone with its exact reason
    expect(data.strategies.some((s) => s.order.join('→') === 'S→M→M')).toBe(false);
    const note = lab.assumptions.find((a) => a.text.includes('kho không chạy được: S→M→M'));
    expect(note).toBeDefined();
    expect(note!.text).toBe(
      'Bỏ phương án nhanh hơn theo model vì kho không chạy được: S→M→M — cần 2 stint M (23 + 23 vòng) nhưng mỗi xe chỉ có 1 bộ M khả dụng (đời 31)',
    );
  });

  it('S→M→H survives at rank 6: S15/M23/H24 · 101.9s (the game-order plan)', () => {
    const smh = data.strategies[5];
    expect(smh).toBeDefined();
    expect(smh!.order.join('→')).toBe('S→M→H');
    expect(smh!.stints.map((s) => `${s.compound}(${s.laps})`)).toEqual([
      'S(15)',
      'M(23)',
      'H(24)',
    ]);
    expect(smh!.timeS).toBeCloseTo(101.9, 1);
  });

  it('vsBestS is re-based on the best FEASIBLE plan (lead +0.0s, not the filtered 90.7s model best)', () => {
    expect(data.best!.vsBestS).toBe(0);
    for (const plan of data.strategies) {
      expect(plan.vsBestS).toBeCloseTo(
        Math.round((plan.timeS - data.best!.timeS) * 10) / 10,
        1,
      );
    }
    // the 3S+1M pair sits 0.4s behind; the game-order plan 4.8s
    expect(data.strategies[3]!.vsBestS).toBeCloseTo(0.4, 1);
    expect(data.strategies[5]!.vsBestS).toBeCloseTo(4.8, 1);
  });

  it('the game plan stays the game’s own split: S→M→H pit 19,38 · 103.7s', () => {
    expect(data.gamePlan!.compounds.join('→')).toBe('S→M→H');
    expect(data.gamePlan!.pitLaps).toEqual([19, 38]);
    expect(data.gamePlan!.stintLaps).toEqual([18, 19, 25]);
    expect(data.gamePlan!.totalTimeS).toBeCloseTo(103.7, 1);
  });

  it('22 of the 52 sanity-passed plans remain feasible (the DoD count)', () => {
    /* Mirror of the engine pipeline (same enumeration, same sanity filter,
       same cap re-split, same per-car set law) — the count is asserted here
       so the mirror script (scripts/compute-marina-feasible.ts) and the
       engine can never drift apart. */
    const DRY = ['S', 'M', 'H'] as const;
    const orders: { order: typeof DRY[number][] }[] = [];
    for (const a of DRY) for (const b of DRY) if (a !== b) orders.push({ order: [a, b] });
    for (const a of DRY) for (const b of DRY) for (const c of DRY) {
      if (new Set([a, b, c]).size < 2) continue;
      orders.push({ order: [a, b, c] });
      orders.push({ order: [a, b, c, a] });
    }
    expect(orders.length).toBe(54);
    const minStintLaps = Math.max(5, Math.round(MARINA_LAPS / 12));
    const invCap = { ...data.lives, ...data.inventory!.maxStint };
    let sanity = 0;
    let feasible = 0;
    for (const { order } of orders) {
      const r = evaluateStrategy(order as never, MARINA_LAPS, data.lives, data.deltas, data.pitCostS);
      if (!r) continue;
      if (!r.stints.every((st) => st.laps >= minStintLaps)) continue;
      sanity++;
      const capEval = evaluateStrategy(order as never, MARINA_LAPS, invCap, data.deltas, data.pitCostS);
      if (!capEval) continue;
      if (data.inventory!.cars.every((car) => isPlanFeasibleForCar(car, capEval.stints))) feasible++;
    }
    expect(sanity).toBe(52);
    expect(feasible).toBe(22);
  });
});

/* ── the set law gates the what-if shift too (prompt bước 1.7) ───────────── */

describe('whatIfPitShift — the set gate', () => {
  const laps = 62;
  const maxStint = { S: 21, M: 31, H: 48 };
  const deltas = { S: 0, M: 0.55, H: 1.05 };
  const plan = (stints: [number, number, number]): StrategyResult => ({
    order: ['S', 'S', 'M'],
    stops: 2,
    timeS: 90,
    stints: [
      { compound: 'S', laps: stints[0], fromLap: 1, toLap: stints[0], deltaS: 0, degS: 0 },
      { compound: 'S', laps: stints[1], fromLap: stints[0] + 1, toLap: stints[0] + stints[1], deltaS: 0, degS: 0 },
      { compound: 'M', laps: stints[2], fromLap: stints[0] + stints[1] + 1, toLap: laps, deltaS: 0.55, degS: 0 },
    ],
    pitLaps: [stints[0], stints[0] + stints[1]],
    vsBestS: 0,
  });

  it('a shift that stretches a stint past its set life → shifted null, clamped', () => {
    // stock: two usable S sets lives [21, 19] — base (19,21) fits, (20,21) does not
    const sets: InventorySet[] = [
      { tyreSetId: 1, compound: 'S', wear: 1, lifeRemaining: 21, lapsCompleted: 0, sessionLastUsedIn: null, available: true, fresh: true },
      { tyreSetId: 2, compound: 'S', wear: 0.5, lifeRemaining: 19, lapsCompleted: 10, sessionLastUsedIn: 1, available: true, fresh: false },
      { tyreSetId: 3, compound: 'M', wear: 1, lifeRemaining: 31, lapsCompleted: 0, sessionLastUsedIn: null, available: true, fresh: true },
    ];
    const base = plan([19, 21, 22]);
    const ok = whatIfPitShift(base, laps, maxStint, deltas, 20.7, 0, undefined, sets);
    expect(ok.shifted).not.toBeNull();
    // shift +1: S stints become (20, 21) — the 20 needs the 19-life set → dead
    const shifted = whatIfPitShift(base, laps, maxStint, deltas, 20.7, 1, undefined, sets);
    expect(shifted.shifted).toBeNull();
    expect(shifted.clamped).toBe(true);
    expect(shifted.deltaS).toBeNull();
  });

  it('without sets the behaviour is unchanged (pre-v0.9.1 callers)', () => {
    const base = plan([19, 19, 24]);
    const r = whatIfPitShift(base, laps, maxStint, deltas, 20.7, 1);
    expect(r.shifted).not.toBeNull();
  });
});

/* ── the wet plan obeys the same law (prompt bước 2.2) ───────────────────── */

describe('buildWetPlan — the set gate on I/W', () => {
  it('without an inventory the plan is unchanged (Silverstone I 48 / W 62)', () => {
    const model = buildSilverstoneModel();
    const wet = buildWetPlan(model, SILVERSTONE_LAPS);
    expect(wet).not.toBeNull();
    expect(wet!.stints).toEqual([
      { compound: 'I', laps: 48 },
      { compound: 'W', laps: 4 },
    ]);
  });

  it('an inventory whose cars own I/W stock keeps the plan', () => {
    const model = buildSilverstoneModel();
    const inventory = {
      cars: [marinaCar(0, 0), marinaCar(1, 100)].map((car) => ({
        ...car,
        sets: [
          ...car.sets,
          { tyreSetId: 901, compound: 'I' as const, wear: 1, lifeRemaining: 48, lapsCompleted: 0, sessionLastUsedIn: null, available: true, fresh: true },
          { tyreSetId: 902, compound: 'W' as const, wear: 1, lifeRemaining: 62, lapsCompleted: 0, sessionLastUsedIn: null, available: true, fresh: true },
        ],
      })),
    } as never;
    const wet = buildWetPlan(model, SILVERSTONE_LAPS, inventory);
    expect(wet).not.toBeNull();
    expect(wet!.stints).toEqual([
      { compound: 'I', laps: 48 },
      { compound: 'W', laps: 4 },
    ]);
  });

  it('a car without a wet set (or with too-short I life) makes the plan null', () => {
    const model = buildSilverstoneModel();
    const noWet = {
      cars: [
        marinaCar(0, 0), // no I/W sets at all
        marinaCar(1, 100),
      ],
    } as never;
    expect(buildWetPlan(model, SILVERSTONE_LAPS, noWet)).toBeNull();

    const shortInter = {
      cars: [marinaCar(0, 0), marinaCar(1, 100)].map((car) => ({
        ...car,
        sets: [
          ...car.sets,
          { tyreSetId: 901, compound: 'I' as const, wear: 1, lifeRemaining: 30, lapsCompleted: 0, sessionLastUsedIn: null, available: true, fresh: true },
          { tyreSetId: 902, compound: 'W' as const, wear: 1, lifeRemaining: 62, lapsCompleted: 0, sessionLastUsedIn: null, available: true, fresh: true },
        ],
      })),
    } as never;
    // the plan's I stint is 48 laps — a 30-life Inter cannot run it
    expect(buildWetPlan(model, SILVERSTONE_LAPS, shortInter)).toBeNull();
  });
});
