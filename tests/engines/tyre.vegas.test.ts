/**
 * v0.9.4 — the two-car briefing on DIVERGENT garages, locked against the
 * REAL Las Vegas save numbers (save1.sav, Day 46712, race 208, 50 laps,
 * pre-race — prompt §0/DoD):
 *
 *   · v0.9.1 bug 1 (wrong car): the trail card showed car 1's fresh sets
 *     (#0/#1 "mới đời 20") because priceOn could never re-attach the trail
 *     car's own stock on unverified seats. v0.9.4: the cards brief per CAR
 *     (garageFor card order) — the trail runs car 2's worn #0/#3 and never
 *     touches car 2's locked S #1.
 *   · v0.9.1 bug 2 (dead "used" label): `spare` was never true, so every
 *     set rendered "mới". v0.9.4: the label reads `fresh` — the trail's
 *     S sets are "đã dùng".
 *   · The wear→price law: the game's own EstimatedLapTime prices each set
 *     (+0.01s/lap on the worn softs here) and the deg runs at the assigned
 *     set's life vs the priced life — best −2.8s, trail +0.2s, game −2.5s.
 *
 * Unit blocks below lock wearCorrection itself, the card-order garage
 * (and the verified-seat override), and the pit-shift fallback carrying
 * the trail car's sets + wear.
 */

import { describe, it, expect } from 'vitest';
import {
  buildTyreLab,
  getAllocationPace,
  wearCorrection,
  type AllocationPace,
} from '@/engines/tyre.engine';
import type { InventorySet } from '@/engines/grid.engine';
import {
  buildVegasModel,
  VEGAS_RACE_ID,
  OWARD_ID,
  RICCIARDO_ID,
} from '../helpers/vegas-fixture';
import type { SaveModel, Race } from '../../src/domain/types';

/* ── the DoD on the REAL save numbers (prompt DoD — Vegas save1.sav) ─────── */

describe('buildTyreLab — Vegas save1.sav (Day 46712, race 208, 50 laps)', () => {
  const lab = buildTyreLab(buildVegasModel(), VEGAS_RACE_ID);
  const data = lab.data;

  it('ranks on lives 22/33/51, executes on cap 18/31/47; per-car caps diverge', () => {
    expect(data.lives).toEqual({ S: 22, M: 33, H: 51 });
    expect(data.inventory!.maxStint).toEqual({ S: 18, M: 31, H: 47 });
    expect(data.inventory!.perCarMaxStint[20]).toEqual({ S: 20, M: 31, H: 47 });
    expect(data.inventory!.perCarMaxStint[21]).toEqual({ S: 18, M: 31, H: 47 });
    expect(data.inventory!.cars.map((c) => c.label)).toEqual(['Xe 1', 'Xe 2']);
    expect(data.inventory!.cars.every((c) => !c.seatVerified)).toBe(true);
    expect(data.deltas).toEqual({ S: 0, M: 0.42, H: 2.79 });
    expect(getAllocationPace(buildVegasModel())!.lapTime).toEqual({
      S: 97.86, M: 98.24, H: 98.68,
    });
  });

  it('LEAD (Xe 1): S→S→M (S14/S14/M22) pit 14,28 · 72.2s · wear 0 — car 1 sets', () => {
    const lead = data.carPlans!.lead;
    expect(lead.driverId).toBe(OWARD_ID);
    expect(lead.gridPos).toBe(10);
    expect(lead.carLabel).toBe('Xe 1');
    expect(lead.plan.order.join('→')).toBe('S→S→M');
    expect(lead.plan.stints.map((s) => [s.compound, s.laps])).toEqual([
      ['S', 14], ['S', 14], ['M', 22],
    ]);
    expect(lead.plan.pitLaps).toEqual([14, 28]);
    expect(lead.plan.timeS).toBe(72.2);
    expect(lead.plan.wearS).toBeUndefined();
    // toàn bộ mới, đúng kho xe 1
    expect(lead.plan.stints.map((s) => s.setUsed)).toEqual([
      { tyreSetId: 0, fresh: true, life: 20 },
      { tyreSetId: 1, fresh: true, life: 20 },
      { tyreSetId: 8, fresh: true, life: 31 },
    ]);
  });

  it('TRAIL (Xe 2): S→M→S (S13/M24/S13) pit 13,37 · 75.7s · wear +0.2 · pit-gap', () => {
    const trail = data.carPlans!.trail!;
    expect(trail.driverId).toBe(RICCIARDO_ID);
    expect(trail.gridPos).toBe(19);
    expect(trail.carLabel).toBe('Xe 2');
    expect(trail.reason).toBe('pit-gap');
    // v0.9.6 — SMS ranks ahead of MSS in the ranked list (same 72.7s on the
    // team cap); re-based on car 2's price its vsBestS is +3.5 > 2.0, so it
    // is NOT a diff-compound pick and the first gap-clearing candidate wins.
    // With the new law (gap ≥ 1) SMS clears: pit 13 sits 1 lap from the
    // lead's pit 14, pit 37 is 9 laps from pit 28.
    expect(trail.plan.order.join('→')).toBe('S→M→S');
    expect(trail.plan.stints.map((s) => [s.compound, s.laps])).toEqual([
      ['S', 13], ['M', 24], ['S', 13],
    ]);
    expect(trail.plan.pitLaps).toEqual([13, 37]);
    expect(trail.plan.timeS).toBe(75.7);
    expect(trail.plan.wearS).toBe(0.2);
    // S #0 ĐÃ DÙNG (đời 18) mở đầu, M #8 mới (đời 31) ở giữa,
    // S #3 ĐÃ DÙNG (đời 18) kết thúc — toàn bộ kho xe 2
    expect(trail.plan.stints[0]!.setUsed).toEqual({ tyreSetId: 0, fresh: false, life: 18 });
    expect(trail.plan.stints[1]!.setUsed).toEqual({ tyreSetId: 8, fresh: true, life: 31 });
    expect(trail.plan.stints[2]!.setUsed).toEqual({ tyreSetId: 3, fresh: false, life: 18 });
    // +0.01s/lap × 13 vòng = +0.1 từng S stint (làm tròn 0.1 trước, tổng 0.2)
    expect(trail.plan.stints.map((s) => s.wearS)).toEqual([0.1, undefined, 0.1]);
    // re-based on the trail car's own price (v0.9.4): 75.7 − 72.2 = +3.5
    // — outside the 2.0s band, so the pick is 'pit-gap', not diff-compound
    expect(trail.plan.vsBestS).toBe(3.5);
  });

  it('no plan assigned to car 2 ever touches its LOCKED S #1', () => {
    const trail = data.carPlans!.trail!;
    for (const st of trail.plan.stints) {
      expect(st.setUsed!.tyreSetId).not.toBe(1);
    }
  });

  it('BEST (ranked[0]): S→S→M (S13/S13/M24) pit 13,26 · 72.7s · wear −2.8', () => {
    const best = data.best!;
    expect(best.order.join('→')).toBe('S→S→M');
    expect(best.stints.map((s) => [s.compound, s.laps])).toEqual([
      ['S', 13], ['S', 13], ['M', 24],
    ]);
    expect(best.pitLaps).toEqual([13, 26]);
    expect(best.timeS).toBe(72.7);
    expect(best.wearS).toBe(-2.8);
  });

  it('top 6 ranked: 72.7/72.7/72.7/82.6/82.6/113.9 — wear −2.8/−2.8/−2.8/−2.4/−2.4/−6.6', () => {
    expect(data.strategies.map((s) => s.order.join('→'))).toEqual([
      'S→S→M', 'S→M→S', 'M→S→S', 'S→S→M→S', 'S→M→S→S', 'S→S→H',
    ]);
    expect(data.strategies.map((s) => s.timeS)).toEqual([
      72.7, 72.7, 72.7, 82.6, 82.6, 113.9,
    ]);
    expect(data.strategies.map((s) => s.wearS)).toEqual([
      -2.8, -2.8, -2.8, -2.4, -2.4, -6.6,
    ]);
    expect(data.strategies.map((s) => s.vsBestS)).toEqual([0, 0, 0, 9.9, 9.9, 41.2]);
  });

  it('game plan S→S→M pit 13,26 · 73.4s · wear −2.5 (priced on car 1 stock)', () => {
    const gp = data.gamePlan!;
    expect(gp.compounds.join('→')).toBe('S→S→M');
    expect(gp.pitLaps).toEqual([13, 26]);
    expect(gp.stintLaps).toEqual([12, 13, 25]);
    expect(gp.totalTimeS).toBe(73.4);
    expect(gp.wearS).toBe(-2.5);
  });

  it('no tie note: lead–trail gap 3.5s ≥ 2.0 on EXECUTION prices', () => {
    expect(data.carPlans!.tie).toBe(false);
    expect(lab.assumptions.some((a) => a.text.includes('hòa nhau về tổng thời gian'))).toBe(false);
  });

  it('carries both v0.9.4 assumptions (seat order + lead re-price)', () => {
    expect(lab.assumptions.some((a) =>
      a.text.startsWith('Ghế lái chưa xác minh — plan Xe 1 / Xe 2 theo thứ tự xe trong kho'),
    )).toBe(true);
    expect(lab.assumptions.some((a) =>
      a.text.startsWith('Plan của xe lead tính lại giá trên kho lốp đúng xe đó'),
    )).toBe(true);
  });

  it('no setUsed anywhere still carries the removed `spare` flag', () => {
    const all = [
      ...data.strategies.flatMap((s) => s.stints),
      data.carPlans!.lead.plan.stints,
      data.carPlans!.trail?.plan.stints ?? [],
    ].flat();
    for (const st of all) {
      if (st.setUsed) expect(Object.keys(st.setUsed)).not.toContain('spare');
    }
  });
});

/* ── wearCorrection — the wear→price law (prompt bước 1b) ────────────────── */

describe('wearCorrection — pace from EstimatedLapTime, deg from the assigned life', () => {
  const allocPace: AllocationPace = {
    lapTime: { S: 97.86, M: 98.24, H: 98.68 },
    deltas: { S: 0, M: 0.38, H: 0.82 },
    samples: { S: 3, M: 3, H: 3 },
  };
  const sets: InventorySet[] = [
    { tyreSetId: 0, compound: 'S', wear: 0.888, lifeRemaining: 18, lapsCompleted: 12, sessionLastUsedIn: 1, available: true, fresh: false, estimatedLapTime: 97.87 },
    { tyreSetId: 2, compound: 'S', wear: 0.778, lifeRemaining: 16, lapsCompleted: 9, sessionLastUsedIn: 1, available: true, fresh: false, estimatedLapTime: 98.05 },
    { tyreSetId: 8, compound: 'M', wear: 1, lifeRemaining: 31, lapsCompleted: 0, sessionLastUsedIn: null, available: true, fresh: true, estimatedLapTime: 98.24 },
  ];

  it('a worn set priced by the game: +0.19s/lap × 13 laps = +2.5s pace', () => {
    const corr = wearCorrection(
      [{ compound: 'S', laps: 13, setUsed: { tyreSetId: 2, life: 18 } }],
      sets,
      allocPace,
      { S: 18, M: 31, H: 47 },
    );
    expect(corr.perStint).toEqual([2.5]);
    expect(corr.totalS).toBe(2.5);
  });

  it('deg correction is negative when the set outlives the priced cap (S13 life 20 vs cap 18 → −1.4)', () => {
    const longLife: InventorySet[] = [
      { ...sets[0]!, tyreSetId: 5, compound: 'S', wear: 1, lifeRemaining: 20, fresh: true, estimatedLapTime: 97.86 },
    ];
    const corr = wearCorrection(
      [{ compound: 'S', laps: 13, setUsed: { tyreSetId: 5, life: 20 } }],
      longLife,
      allocPace,
      { S: 18, M: 31, H: 47 },
    );
    // pace 0 (fresh set = fresh median), deg only
    expect(corr.perStint).toEqual([-1.4]);
    expect(corr.totalS).toBe(-1.4);
  });

  it('per-stint rounding FIRST, total = the rounded sum (+0.13 × 2 → 0.1 + 0.1 = 0.2)', () => {
    const corr = wearCorrection(
      [
        { compound: 'S', laps: 13, setUsed: { tyreSetId: 0, life: 18 } },
        { compound: 'M', laps: 24, setUsed: { tyreSetId: 8, life: 31 } },
        { compound: 'S', laps: 13, setUsed: { tyreSetId: 0, life: 18 } },
      ],
      sets,
      allocPace,
      { S: 18, M: 31, H: 47 },
    );
    // each S stint: (97.87 − 97.86) × 13 = 0.13 → 0.1; the fresh M: 0
    expect(corr.perStint).toEqual([0.1, 0, 0.1]);
    expect(corr.totalS).toBe(0.2);
  });

  it('missing EstimatedLapTime or null allocPace → pace 0; the deg part still prices', () => {
    const noEst: InventorySet[] = [{ ...sets[0]!, estimatedLapTime: null }];
    const withDeg = wearCorrection(
      [{ compound: 'S', laps: 13, setUsed: { tyreSetId: 0, life: 16 } }],
      noEst,
      allocPace,
      { S: 18, M: 31, H: 47 },
    );
    expect(withDeg.perStint).toEqual([2]); // deg(13,16) − deg(13,18) = +2.0, pace 0

    const noPace = wearCorrection(
      [{ compound: 'S', laps: 13, setUsed: { tyreSetId: 0, life: 18 } }],
      sets,
      null,
      { S: 18, M: 31, H: 47 },
    );
    expect(noPace.totalS).toBe(0); // set life = cap → deg 0, pace 0 (no allocPace)
  });

  it('a stint without an assignment contributes 0 (nothing assigned, nothing to correct)', () => {
    const corr = wearCorrection(
      [{ compound: 'S', laps: 13, setUsed: null }],
      sets,
      allocPace,
      { S: 18, M: 31, H: 47 },
    );
    expect(corr.perStint).toEqual([0]);
    expect(corr.totalS).toBe(0);
  });
});

/* ── garageFor — the card-order garage (prompt bước 1d) ──────────────────── */

describe('garageFor — unverified seats brief per CAR; verified seats win', () => {
  it('unverified: the trail card prices on car 2 (card index 1), not car 1', () => {
    const data = buildTyreLab(buildVegasModel(), VEGAS_RACE_ID).data;
    // car 2 owns NO fresh soft — a fresh S set on the trail card would mean
    // the engine is still leaking car 1's stock (the v0.9.1 bug)
    const trail = data.carPlans!.trail!;
    expect(trail.plan.stints.every((s) => s.compound !== 'S' || s.setUsed!.fresh === false)).toBe(true);
    expect(data.carPlans!.lead.plan.stints.every((s) => s.setUsed!.fresh === true)).toBe(true);
  });

  it('verified: the seat mapping wins over the card order (carOfDriver path)', () => {
    const model: SaveModel = buildVegasModel();
    // drop the 10 historical contract rows → the 2-driver correlation runs
    model.drivers = model.drivers.filter((d) => d.staffId < 303 || d.staffId > 312);
    // clean per-session lap signal: car 20 ↔ Ricciardo (302, trail card),
    // car 21 ↔ O'Ward (301, lead card) — CROSSED vs the card order.
    const pair = (carId: number, laps: [number, number]): void => {
      const rows = model.tyres.filter((t) => t.carId === carId);
      rows[0]!.lapsCompleted = laps[0];
      rows[0]!.sessionLastUsedIn = 1;
      rows[1]!.lapsCompleted = laps[1];
      rows[1]!.sessionLastUsedIn = 2;
    };
    pair(20, [19, 17]);
    pair(21, [21, 16]);
    /* the signal laps sit far above every session best so the measured
       deltas (M +0.42 / H +2.79) stay untouched — only LapCount matters */
    model.races[0]!.practice!.push(
      { driverId: RICCIARDO_ID, teamId: 32, session: 1, bestLapMs: 99_500, bestLapTyre: 2, raceFormula: 1, lapCount: 19 },
      { driverId: RICCIARDO_ID, teamId: 32, session: 2, bestLapMs: 99_600, bestLapTyre: 2, raceFormula: 1, lapCount: 17 },
      { driverId: OWARD_ID, teamId: 32, session: 1, bestLapMs: 100_500, bestLapTyre: 1, raceFormula: 1, lapCount: 21 },
      { driverId: OWARD_ID, teamId: 32, session: 2, bestLapMs: 100_600, bestLapTyre: 1, raceFormula: 1, lapCount: 16 },
    );

    const data = buildTyreLab(model, VEGAS_RACE_ID).data;
    expect(data.inventory!.cars.map((c) => [c.carId, c.seatVerified])).toEqual([[20, true], [21, true]]);
    // the TRAIL card (Ricciardo) must price on HIS OWN car 20 — fresh 20-life
    // softs — even though the card sits in position 1 (car 2's slot)
    const trail = data.carPlans!.trail!;
    expect(trail.driverId).toBe(RICCIARDO_ID);
    expect(trail.carLabel).toBe('Ricciardo');
    expect(trail.plan.stints.filter((s) => s.compound === 'S').every((s) => s.setUsed!.fresh && s.setUsed!.life === 20)).toBe(true);
    // the LEAD card (O'Ward) prices on car 21 — the worn 18-life softs
    const lead = data.carPlans!.lead;
    expect(lead.driverId).toBe(OWARD_ID);
    expect(lead.carLabel).toBe("O'Ward");
    expect(lead.plan.stints.filter((s) => s.compound === 'S').every((s) => !s.setUsed!.fresh && s.setUsed!.life === 18)).toBe(true);
  });
});

/* ── the pit-shift fallback carries the trail car's sets + wear (bước 1e) ── */

describe('trail fallback (pit shift) — the shifted plan runs the trail car stock', () => {
  /**
   * An 18-lap synthetic whose ranked list CANNOT clear the lead's pits: the
   * lead S→S→M splits (6,6,6) and pits at 6/12 — and on 18 laps EVERY
   * 2-pit plan is (6,6,6) with the same pits, so every candidate drops on
   * a SHARED lap (the v0.9.6 law bans only gap 0; a 20-lap race would leak
   * an M8/S6/S6 plan through pits 8/14, min gap 2 ≥ 1). The trail car owns
   * no H at all (no H plan can even be priced on it). Every candidate
   * drops on gapOk/feasibility → the engine must fall back to the pit
   * shift — and the shifted plan must CARRY the trail car's real sets
   * (longest-S on the fresh #0, the second S on the worn 6-life #2) and
   * price their wear.
   */
  const buildShiftModel = (): SaveModel => {
    const model: SaveModel = buildVegasModel();
    model.races = [{
      ...model.races[0]!,
      raceId: 999,
      laps: 18,
      trackName: 'Shift Test',
      playerStrategy: undefined,
    } as unknown as Race];
    // playerStrategy removed → no game-plan tie-break noise
    model.playerStrategy = { tablePresent: false, plans: [] };
    // practice: 1 session, 2 S drivers only → no measurable delta → model
    // constants rank; readiness still passes (1 session + quali + allocation)
    model.races[0]!.practice = [
      { driverId: 1, teamId: 20, session: 1, bestLapMs: 90_500, bestLapTyre: 2, raceFormula: 1 },
      { driverId: 2, teamId: 20, session: 1, bestLapMs: 90_600, bestLapTyre: 2, raceFormula: 1 },
    ];
    // quali: 12 drivers, players P1/P2 (order irrelevant here)
    model.races[0]!.qualifying = [
      ...Array.from({ length: 10 }, (_, i) => ({
        driverId: i + 1,
        driverName: `Driver ${i + 1}`,
        teamId: Math.floor(i / 2) + 20,
        finishingPos: i + 3,
        stage: 1,
        raceFormula: 1,
      })),
      { driverId: OWARD_ID, driverName: "O'Ward", teamId: 32, finishingPos: 1, stage: 3, raceFormula: 1 },
      { driverId: RICCIARDO_ID, driverName: 'Ricciardo', teamId: 32, finishingPos: 2, stage: 3, raceFormula: 1 },
    ];
    // the stock: identical S/M lives on both cars (fresh est = the fresh
    // median), xe 2 adds a WORN second soft (life 6, est +0.8s/lap) and
    // owns NO H — H plans can never be priced on the trail car.
    model.tyres = [
      // xe 1 (car 20): S ×2 fresh life 8, M ×1 fresh life 9, H ×1 fresh 11
      { carId: 20, tyreSetId: 0, weekendTyreType: 2, frontLeftWear: 1, availabilityState: 0, estimatedLapLifeRemaining: 8, estimatedLapTimeS: 90.0 },
      { carId: 20, tyreSetId: 1, weekendTyreType: 2, frontLeftWear: 1, availabilityState: 0, estimatedLapLifeRemaining: 8, estimatedLapTimeS: 90.0 },
      { carId: 20, tyreSetId: 2, weekendTyreType: 1, frontLeftWear: 1, availabilityState: 0, estimatedLapLifeRemaining: 9, estimatedLapTimeS: 90.5 },
      { carId: 20, tyreSetId: 3, weekendTyreType: 0, frontLeftWear: 1, availabilityState: 0, estimatedLapLifeRemaining: 11, estimatedLapTimeS: 100.0 },
      // xe 2 (car 21): S #0 fresh 8 + S #2 worn 6 (usable!), M #1 fresh 9 — no H
      { carId: 21, tyreSetId: 0, weekendTyreType: 2, frontLeftWear: 1, availabilityState: 0, estimatedLapLifeRemaining: 8, estimatedLapTimeS: 90.0 },
      { carId: 21, tyreSetId: 1, weekendTyreType: 1, frontLeftWear: 1, availabilityState: 0, estimatedLapLifeRemaining: 9, estimatedLapTimeS: 90.5 },
      { carId: 21, tyreSetId: 2, weekendTyreType: 2, frontLeftWear: 0.6, availabilityState: 0, estimatedLapLifeRemaining: 6, estimatedLapTimeS: 90.8 },
      // AI cars: fresh S 8 / M 12 / H 11 → field medians 8/12/11
      ...Array.from({ length: 10 }, (_, carId) => ([
        { carId, tyreSetId: 100 + carId * 3, weekendTyreType: 2, frontLeftWear: 1, availabilityState: 0, estimatedLapLifeRemaining: 8, estimatedLapTimeS: 90.0 },
        { carId, tyreSetId: 101 + carId * 3, weekendTyreType: 1, frontLeftWear: 1, availabilityState: 0, estimatedLapLifeRemaining: 12, estimatedLapTimeS: 90.5 },
        { carId, tyreSetId: 102 + carId * 3, weekendTyreType: 0, frontLeftWear: 1, availabilityState: 0, estimatedLapLifeRemaining: 11, estimatedLapTimeS: 100.0 },
      ])).flat(),
    ];
    return model;
  };

  it('every candidate drops → the shifted plan carries sets + wear of the trail car', () => {
    const lab = buildTyreLab(buildShiftModel(), 999);
    const data = lab.data;
    const split = data.carPlans!;
    // the lead runs the optimum S→S→M on its own stock, wear 0 (all fresh
    // at cap) — on 18 laps its pits 6/12 ARE the whole 2-pit window
    expect(split.lead.plan.order.join('→')).toBe('S→S→M');
    expect(split.lead.plan.stints.map((s) => [s.compound, s.laps])).toEqual([
      ['S', 6], ['S', 6], ['M', 6],
    ]);
    expect(split.lead.plan.pitLaps).toEqual([6, 12]);
    expect(split.lead.plan.timeS).toBe(53.3);
    expect(split.lead.plan.wearS).toBeUndefined();
    expect(split.lead.reason).toBeNull();
    // the trail could not take any ranked candidate → the pit shift fired
    const trail = split.trail!;
    expect(trail.reason).toBe('shifted');
    expect(trail.shiftedBy).toBe(-3);
    // the shifted plan keeps the lead's compound ORDER but moves the pits
    // out of the shared window (first pit clamps to the lap-5 pit window)
    expect(trail.plan.order.join('→')).toBe('S→S→M');
    expect(trail.plan.stints.map((s) => [s.compound, s.laps])).toEqual([
      ['S', 5], ['S', 4], ['M', 9],
    ]);
    expect(trail.plan.pitLaps).toEqual([5, 9]);
    expect(trail.plan.timeS).toBe(59.6);
    // NO empty setUsed: every stint names a physical set of XE 2
    expect(trail.plan.stints.map((s) => s.setUsed)).toEqual([
      { tyreSetId: 0, fresh: true, life: 8 },
      { tyreSetId: 2, fresh: false, life: 6 },
      { tyreSetId: 1, fresh: true, life: 9 },
    ]);
    // the worn #2 runs 4 laps: pace +0.8s/lap × 4 = +3.2, deg +0.8 → +4.0
    expect(trail.plan.stints.map((s) => s.wearS)).toEqual([undefined, 4, undefined]);
    expect(trail.plan.wearS).toBe(4);
  });
});
