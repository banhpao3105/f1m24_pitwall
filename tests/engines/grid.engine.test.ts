/**
 * Grid engine tests (v0.7.0 step 2, corrected v0.7.1 step 3) — locked to
 * the owner-verified Monza 2027 pre-race save numbers.
 *
 * v0.7.1 RETRACTION of the v0.7.0 claim: the pre-race save's 9
 * Races_GridPenalties rows are ALL Served=1 — nothing is pending — so the
 * grid derivable from THIS save is the pure qualifying order (Piastri P7,
 * O'Ward P21, Ricciardo P22). The post-race StartingPos (Piastri P22 /
 * O'Ward P20 / Ricciardo P21) comes from a penalty row that only exists in
 * the POST-race save; v0.7.0's "grid matches StartingPos 22/22" claim was
 * verified against a misread and is retracted (prompt v0.7.1 bước 3d).
 * The back-of-grid / place-count engine branches are covered by clearly
 * labelled SYNTHETIC fixtures below — engine behaviour, never a Monza DoD.
 *
 * The seat resolution uses the practice-lap signal (allocation LapsCompleted
 * per SessionLastUsedIn vs Races_PracticeResults.LapCount). Penalty places
 * come from the game's own Races_Enum_PenaltyType (reason 3 = CausingCollision
 * = 3 places, verified).
 */

import { describe, it, expect } from 'vitest';
import { aggregateSets, assessReadiness, buildTyreInventory, deriveGrid, resolveCarDrivers } from '@/engines/grid.engine';
import type { InventorySet } from '@/engines/grid.engine';
import { buildTyreLab, getPracticePace } from '@/engines/tyre.engine';
import { emptyPhase2Sections } from '../helpers/model';
import type { SaveModel, Race, QualifyingResult, PracticeResult, Team, Driver, TyreAllocation, PlayerStrategySection } from '@/domain/types';

const MONZA_RACE_ID = 202;

/** The owner-verified final grid (StartingPos after the race, all 22). */
const MONZA_GRID = [
  2, 376, 144, 10, 23, 15, 95, 12, 11, 3, 280, 14, 120, 17, 83, 142, 76, 8, 255, 285, 13, 102,
];
/** Qualifying classification: 102 qualified P7 and drops to the back. */
const MONZA_QUALI_ORDER = [
  2, 376, 144, 10, 23, 15, 102, 95, 12, 11, 3, 280, 14, 120, 17, 83, 142, 76, 8, 255, 285, 13,
];

const TEAM_OF: Record<number, number> = {
  12: 2, 102: 2, 285: 32, 13: 32,
  2: 1, 376: 3, 144: 4, 10: 5, 23: 6, 15: 7, 95: 8, 11: 9, 3: 10,
  280: 1, 14: 3, 120: 4, 17: 5, 83: 6, 142: 7, 76: 8, 8: 9, 255: 10,
};

/** Races_Enum_PenaltyType verified on real 1.11 saves. */
const REASON_PLACES = { 0: 5, 1: 5, 2: 5, 3: 3, 4: 5, 5: 0 };

function monzaTeams(): Team[] {
  const ids = [...new Set(Object.values(TEAM_OF))];
  return ids.map((teamId) => ({
    teamId,
    teamName: teamId === 32 ? 'CustomTeam' : `Team ${teamId}`,
    isCustomTeam: teamId === 32,
    formula: 1,
  }));
}

function monzaDrivers(): Driver[] {
  return Object.entries(TEAM_OF).map(([d, teamId]) => ({
    staffId: Number(d),
    fullName: `Driver ${d}`,
    teamId,
  }));
}

/** Staged quali: Q3 (stage 3) P1–P10, Q2 (stage 2) P11–P16, Q1 P17–P22. */
function monzaQualifying(): QualifyingResult[] {
  return MONZA_QUALI_ORDER.map((driverId, i) => {
    const pos = i + 1;
    const stage = pos <= 10 ? 3 : pos <= 16 ? 2 : 1;
    return {
      driverId,
      driverName: `Driver ${driverId}`,
      teamId: TEAM_OF[driverId],
      finishingPos: pos,
      stage,
      raceFormula: 1,
    };
  });
}

/** Practice laps: 3 F1 sessions present (the REAL Monza save shape) but
 * only 2 produce a measurable compound gap — the readiness count (3) and
 * the measured count (2) are DIFFERENT numbers by design (v0.7.1 bước 5).
 * Raw M gaps 0.028s/0.029s → median 0.0285 → ranking +0.03s (the prompt's
 * number; the old 0.05 floor would have overwritten it). H gaps 1.32s.
 * Session 1 ALSO carries the F2 + F3 fields (a sample of the real 22+30
 * rows) with M laps FASTER than every F1 — without the F1 filter they
 * would corrupt every measured delta.
 * Team 2's per-session lap totals (car 2 → driver 12, car 3 → driver
 * 102) carry the seat-verification signal. */
function monzaPractice(): PracticeResult[] {
  const rows: PracticeResult[] = [
    { driverId: 12, teamId: 2, session: 1, bestLapMs: 90_000, bestLapTyre: 2, lapCount: 20, raceFormula: 1 },
    { driverId: 12, teamId: 2, session: 2, bestLapMs: 90_500, bestLapTyre: 2, lapCount: 18, raceFormula: 1 },
    { driverId: 102, teamId: 2, session: 1, bestLapMs: 90_100, bestLapTyre: 2, lapCount: 15, raceFormula: 1 },
    { driverId: 102, teamId: 2, session: 2, bestLapMs: 90_600, bestLapTyre: 2, lapCount: 22, raceFormula: 1 },
  ];
  const session = (s: number, sBase: number, mGap: number): void => {
    rows.push(
      { driverId: 201 + s, teamId: 4, session: s, bestLapMs: sBase, bestLapTyre: 2, raceFormula: 1 },
      { driverId: 204 + s, teamId: 5, session: s, bestLapMs: sBase + 100, bestLapTyre: 2, raceFormula: 1 },
      { driverId: 207 + s, teamId: 6, session: s, bestLapMs: sBase + 200, bestLapTyre: 2, raceFormula: 1 },
      { driverId: 211 + s, teamId: 7, session: s, bestLapMs: sBase + mGap, bestLapTyre: 1, raceFormula: 1 },
      { driverId: 214 + s, teamId: 8, session: s, bestLapMs: sBase + mGap + 100, bestLapTyre: 1, raceFormula: 1 },
      { driverId: 217 + s, teamId: 9, session: s, bestLapMs: sBase + mGap + 200, bestLapTyre: 1, raceFormula: 1 },
      { driverId: 221 + s, teamId: 10, session: s, bestLapMs: sBase + 1320, bestLapTyre: 0, raceFormula: 1 },
      { driverId: 224 + s, teamId: 1, session: s, bestLapMs: sBase + 1420, bestLapTyre: 0, raceFormula: 1 },
      { driverId: 227 + s, teamId: 3, session: s, bestLapMs: sBase + 1520, bestLapTyre: 0, raceFormula: 1 },
    );
  };
  session(1, 90_000, 28);
  session(2, 90_500, 29);
  // session 3 — present in the save, no measurable gap: only 2 drivers per
  // compound (< MIN_PACE_SAMPLE = 3)
  rows.push(
    { driverId: 230, teamId: 4, session: 3, bestLapMs: 90_300, bestLapTyre: 2, raceFormula: 1 },
    { driverId: 231, teamId: 5, session: 3, bestLapMs: 90_400, bestLapTyre: 2, raceFormula: 1 },
    { driverId: 232, teamId: 7, session: 3, bestLapMs: 90_330, bestLapTyre: 1, raceFormula: 1 },
    { driverId: 233, teamId: 8, session: 3, bestLapMs: 90_430, bestLapTyre: 1, raceFormula: 1 },
  );
  // the real save's F2 (22) + F3 (30) rows in session 1 — a fast sample
  for (let i = 0; i < 5; i++) {
    rows.push({ driverId: 500 + i, teamId: 100, session: 1, bestLapMs: 89_000 + i * 10, bestLapTyre: 1, raceFormula: 2 });
    rows.push({ driverId: 600 + i, teamId: 200, session: 1, bestLapMs: 89_500 + i * 10, bestLapTyre: 1, raceFormula: 3 });
  }
  return rows;
}

/** Allocation rows carrying the same per-session lap totals for team 2's
 * cars (SessionLastUsedIn 1/2), fresh filler sets for everyone else.
 *
 * v0.7.0 step 3: the FIELD's fresh sets sit at the model lives S26/M39/H60
 * (the spec's verified Monza numbers) while the PLAYER team's own fresh
 * sets (CarID 20/21) are shorter-lived: S 24 / M 36 / H 55 — plus used
 * (state 2) sets that must never raise a cap. This is the exact shape the
 * owner verified: field-median lives {26,39,60}, garage cap {24,36,55}.
 *
 * v0.7.1 step 2: the whole-championship fresh totals match the REAL save
 * exactly — fresh S ×44 / M ×24 / H ×23 across all 22 cars (the wrong
 * numbers the v0.7.0 fallback displayed as the garage) while the player's
 * two cars hold fresh S ×6 / M ×2 / H ×2 and used S ×10 / M ×4 / H ×2
 * (the real allocation counts). The player-scope test below locks that
 * the aggregate can never again show the field numbers. */
function monzaAllocation(): TyreAllocation[] {
  const sets: TyreAllocation[] = [];
  const push = (
    carId: number, type: number, life: number,
    opts: { laps?: number; session?: number; state?: number; wear?: number } = {},
  ) => {
    sets.push({
      carId,
      tyreSetId: sets.length + 1,
      weekendTyreType: type,
      frontLeftWear: opts.wear ?? 1,
      availabilityState: opts.state ?? 0,
      estimatedLapLifeRemaining: life,
      ...(opts.laps != null ? { lapsCompleted: opts.laps, sessionLastUsedIn: opts.session ?? 1 } : {}),
    });
  };
  // team 2 cars = CarID 2 (seat 1) and 3 (seat 2): car 2 ↔ driver 12
  push(2, 2, 26, { laps: 20, session: 1 });
  push(2, 2, 26, { laps: 18, session: 2 });
  push(3, 2, 26, { laps: 15, session: 1 });
  push(3, 2, 26, { laps: 22, session: 2 });
  for (const carId of [2, 3]) {
    push(carId, 1, 39);
    push(carId, 0, 60);
  }
  // AI cars: field-median fresh lives. v0.7.1 real-save totals — the 18 AI
  // cars carry 34 S / 20 M / 19 H fresh (team 2 above adds S4/M2/H2), so
  // the WHOLE FIELD totals fresh S 44 / M 24 / H 23 with the player's 6/2/2.
  const aiCars = [0, 1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
  for (const carId of aiCars) {
    const isShortCar = carId === 18; // 1 fresh S, 2 fresh M
    const isLongCar = carId === 19; // 1 fresh S, 2 fresh M, 2 fresh H
    const sCount = isShortCar || isLongCar ? 1 : 2;
    for (let i = 0; i < sCount; i++) push(carId, 2, 26);
    push(carId, 1, 39);
    if (isShortCar || isLongCar) push(carId, 1, 39);
    push(carId, 0, 60);
    if (isLongCar) push(carId, 0, 60);
  }
  // the player's two cars (CarID 20/21 = TeamID 32) — the REAL per-car
  // allocation of the Monza pre-race save (save4.sav, Day 46635, verified
  // against Save_CarTyreAllocation during the v0.7.2 diagnosis: wear =
  // min 4 wheels, fresh = FrontLeftWear >= 0.99). The used sets DIFFER per
  // car — the v0.7.2 per-car cards must show these exact ranges, and the
  // team aggregate must stay their union (S used wear 54–90%, life 13–22 …).
  // Used (AvailabilityState 2) sets must never lift a cap.
  push(20, 2, 24); push(20, 2, 24); push(20, 2, 24); // S fresh ×3, life 24
  push(20, 2, 22, { state: 2, wear: 0.65 }); // S used: wear 65–90%, life 16–22
  push(20, 2, 20, { state: 2, wear: 0.7 });
  push(20, 2, 19, { state: 2, wear: 0.75 });
  push(20, 2, 17, { state: 2, wear: 0.8 });
  push(20, 2, 16, { state: 2, wear: 0.9 });
  push(20, 1, 36); // M fresh ×1, life 36
  push(20, 1, 29, { state: 2, wear: 0.6 }); // M used: wear 60–82%, life 22–29
  push(20, 1, 22, { state: 2, wear: 0.82 });
  push(20, 0, 55); // H fresh ×1, life 55
  push(20, 0, 41, { state: 2, wear: 0.74 }); // H used: wear 74%, life 41
  push(21, 2, 24); push(21, 2, 24); push(21, 2, 24); // S fresh ×3, life 24
  push(21, 2, 22, { state: 2, wear: 0.54 }); // S used: wear 54–90%, life 13–22
  push(21, 2, 20, { state: 2, wear: 0.6 });
  push(21, 2, 18, { state: 2, wear: 0.7 });
  push(21, 2, 15, { state: 2, wear: 0.8 });
  push(21, 2, 13, { state: 2, wear: 0.9 });
  push(21, 1, 36); // M fresh ×1, life 36
  push(21, 1, 20, { state: 2, wear: 0.55 }); // M used ×2: wear 55–57%, both life 20
  push(21, 1, 20, { state: 2, wear: 0.57 });
  push(21, 0, 55); // H fresh ×1, life 55
  push(21, 0, 41, { state: 2, wear: 0.74 }); // H used: wear 74%, life 41
  return sets;
}

/** SYNTHETIC — test-only pending penalty. This row does NOT exist in the
 * real Monza pre-race save (whose 9 Races_GridPenalties rows are ALL
 * Served=1). It exists purely to exercise the back-of-grid branch of the
 * engine and must NEVER be cited as a Monza DoD (v0.7.1 bước 3a — the
 * v0.7.0 release wrongly used it to claim the grid matched StartingPos). */
function monzaPenaltyRow(): SaveModel['gridPenalties'] extends undefined ? never : NonNullable<SaveModel['gridPenalties']>['rows'][number] {
  return {
    penaltyId: 1,
    teamId: 2,
    carInTeam: 2,
    reasonForPenalty: 0, // ExceededEngineLimit — full grid drop
    sessionReceived: 6,
    served: 0,
    pitLaneStart: 0,
    serveInRace: 1,
    serveInSprint: 0,
  };
}

/** The REAL Races_GridPenalties of the Monza pre-race save (save4.db,
 * verified during the v0.7.1 diagnosis): 9 rows, EVERY one Served=1 —
 * nothing is pending, so the derivable grid is the pure quali order.
 * Only PenaltyID 36 is owner-verified in detail (Team 2, Car 1, reason 3,
 * session 6, Served 1); the other 8 carry real-shaped values (the two
 * first rows match the verified rows of a real 1.11 save). The cú phạt
 * that drops Piastri to P22 (row 40: Team 2 Car 2, reason 5 ParcFerme,
 * PitLaneStart 1) only exists in the POST-race save — row 39 here guards
 * that shape: even a served ParcFerme row must never touch the grid. */
function monzaRealPenaltyRows(): NonNullable<SaveModel['gridPenalties']>['rows'] {
  const row = (
    penaltyId: number, teamId: number, carInTeam: number, reasonForPenalty: number,
    sessionReceived: number, served: number, pitLaneStart = 0,
  ) => ({
    penaltyId, teamId, carInTeam, reasonForPenalty, sessionReceived,
    served, pitLaneStart, serveInRace: 1, serveInSprint: 0,
  });
  return [
    row(31, 4, 1, 3, 6, 1),
    row(32, 5, 2, 3, 6, 1),
    row(33, 6, 1, 0, 6, 1),
    row(34, 7, 2, 1, 6, 1),
    row(35, 3, 1, 2, 6, 1),
    row(36, 2, 1, 3, 6, 1), // the owner-verified row — already served
    row(37, 8, 2, 4, 6, 1),
    row(38, 9, 1, 3, 6, 1),
    row(39, 10, 2, 5, 6, 1, 1), // served ParcFerme + pit-lane shape
  ];
}

/** The in-game strategist plan the owner read off the Monza pre-race save:
 * selected M→H, pit 25 (stints M24 + H29 on the 53-lap race). */
function monzaGamePlan(): PlayerStrategySection {
  return {
    tablePresent: true,
    plans: [
      {
        loadoutId: 0,
        strategyId: 1,
        selected: true,
        stints: [
          {
            stintIndex: 0, compound: 'M',
            pitWindowStart: null, pitWindowEnd: null,
            expectedPitLap: null, optimalPitLap: null,
          },
          {
            stintIndex: 1, compound: 'H',
            pitWindowStart: 23, pitWindowEnd: 27,
            expectedPitLap: 25, optimalPitLap: 25,
          },
        ],
      },
    ],
  };
}

function monzaModel(withPenalty = true): SaveModel {
  const race: Race = {
    raceId: MONZA_RACE_ID,
    seasonId: 2027,
    trackId: 9,
    trackName: 'Monza',
    day: 46635,
    state: 0,
    isSprint: false,
    laps: 53,
    results: [],
    practice: monzaPractice(),
    qualifying: monzaQualifying(),
  };
  return {
    meta: {
      id: 'monza-fixture', fileName: 'save4.sav', fileSizeBytes: 1,
      gameVersion: 'F1M24', saveGameVersion: 11, parsedAt: '2027-01-01T00:00:00Z',
      seasonId: 2027, day: 46635, playerTeamId: 32,
      tablesPresent: [], tablesMissing: [], warnings: [],
    },
    player: { teamId: 32, teamName: 'CustomTeam', customTeamEnabled: true },
    teams: monzaTeams(),
    drivers: monzaDrivers(),
    staff: [],
    seasons: [{ seasonId: 2027 }],
    races: [race],
    standings: { drivers: [], teams: [] },
    tyres: monzaAllocation(),
    gridPenalties: {
      rows: withPenalty ? [monzaPenaltyRow()] : [],
      reasonPlaces: REASON_PLACES,
      /* CarID 0–21 → F1 teams in TeamID order (1..10, 32) — the layout
         verified against the sequential Save_CarConfig index on real saves. */
      carTeams: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 32].flatMap((teamId, i) => [
        { carId: i * 2, teamId },
        { carId: i * 2 + 1, teamId },
      ]),
      carTeamsVerified: true,
    },
    ...emptyPhase2Sections(),
    playerStrategy: monzaGamePlan(),
    availability: [],
  };
}

describe('deriveGrid — the REAL pre-race Monza save (9 rows, all Served=1)', () => {
  it('applies nothing: grid = quali order — Piastri P7, O\'Ward P21, Ricciardo P22', () => {
    const model = monzaModel(false);
    model.gridPenalties!.rows = monzaRealPenaltyRows();
    const derived = deriveGrid(model, MONZA_RACE_ID)!;
    expect(derived.grid.map((g) => g.driverId)).toEqual(MONZA_QUALI_ORDER);
    expect(derived.appliedPenalties).toBe(0);
    expect(derived.unresolvedPenalties).toBe(0);
    expect(derived.unresolvedList).toEqual([]);
    const p102 = derived.grid.find((g) => g.driverId === 102)!; // Piastri
    const p285 = derived.grid.find((g) => g.driverId === 285)!; // O'Ward
    const p13 = derived.grid.find((g) => g.driverId === 13)!; // Ricciardo
    expect(p102.gridPos).toBe(7);
    expect(p285.gridPos).toBe(21);
    expect(p13.gridPos).toBe(22);
    // no entry may differ from its quali slot — every qualiPos === gridPos
    expect(derived.grid.every((g) => g.gridPos === g.qualiPos)).toBe(true);
  });

  it('never forces the post-race grid (P22/P20/P21) out of a save that lacks the penalty', () => {
    // if anyone "fixes" the engine to reproduce the post-race StartingPos
    // from THIS save (applying served rows or inventing the ParcFerme row),
    // Piastri lands P22 / the others move up — this lock fails first
    const model = monzaModel(false);
    model.gridPenalties!.rows = monzaRealPenaltyRows();
    const derived = deriveGrid(model, MONZA_RACE_ID)!;
    expect(derived.grid.find((g) => g.driverId === 102)!.gridPos).not.toBe(22);
    expect(derived.grid.find((g) => g.driverId === 285)!.gridPos).toBe(21);
    expect(derived.grid.find((g) => g.driverId === 13)!.gridPos).toBe(22);
  });
});

describe('deriveGrid — SYNTHETIC penalty shapes (test-only engine branches; NOT a Monza DoD)', () => {
  it('SYNTHETIC back-of-grid penalty: the penalized car drops to the back and everyone behind moves up one', () => {
    const derived = deriveGrid(monzaModel(), MONZA_RACE_ID);
    expect(derived).not.toBeNull();
    const grid = derived!.grid;
    expect(grid).toHaveLength(22);
    expect(grid.map((g) => g.driverId)).toEqual(MONZA_GRID);
  });

  it('SYNTHETIC: seat resolution via the practice-lap signal (verified) applies the penalty', () => {
    const model = monzaModel();
    const carDrivers = resolveCarDrivers(model, MONZA_RACE_ID);
    expect(carDrivers.byCar.get(2)).toEqual({ driverId: 12, verified: true });
    expect(carDrivers.byCar.get(3)).toEqual({ driverId: 102, verified: true });
    const derived = deriveGrid(model, MONZA_RACE_ID)!;
    expect(derived.appliedPenalties).toBe(1);
    expect(derived.seatMappingVerified).toBe(true);
  });

  it('a pending penalty with a DEAD seat signal is unresolved, never applied (v0.7.1 bước 3b)', () => {
    const model = monzaModel();
    // kill the practice-lap signal: LapsCompleted = 0 everywhere (the real
    // Monza save's state) → seats fall back to StaffID order (unverified)
    for (const t of model.tyres) {
      t.lapsCompleted = 0;
      t.sessionLastUsedIn = undefined;
    }
    const derived = deriveGrid(model, MONZA_RACE_ID)!;
    // the SYNTHETIC pending penalty (team 2, car 2, reason 0) must NOT move
    // anyone — applying a 19-place drop on a seat guess is worse than not
    // applying it
    expect(derived.grid.map((g) => g.driverId)).toEqual(MONZA_QUALI_ORDER);
    expect(derived.appliedPenalties).toBe(0);
    expect(derived.unresolvedPenalties).toBe(1);
    expect(derived.unresolvedList).toEqual([
      { teamId: 2, carInTeam: 2, reason: 0, pitLaneStart: 0 },
    ]);
    expect(derived.seatMappingVerified).toBe(false);
  });

  it('SYNTHETIC place-count penalty from the game enum (reason 3 = 3 places)', () => {
    const model = monzaModel(false);
    model.gridPenalties!.rows = [{
      penaltyId: 2, teamId: 2, carInTeam: 2, reasonForPenalty: 3,
      served: 0, pitLaneStart: 0, serveInRace: 1,
    }];
    const derived = deriveGrid(model, MONZA_RACE_ID)!;
    const p102 = derived.grid.find((g) => g.driverId === 102)!;
    // quali P7 + 3 places → P10; everyone between moves up one
    expect(p102.gridPos).toBe(10);
    expect(p102.penaltyPlaces).toBe(3);
    expect(p102.backOfGrid).toBe(false);
    expect(derived.grid.find((g) => g.driverId === 95)!.gridPos).toBe(7);
  });

  it('keeps the grid penalty-free when no pending row exists', () => {
    const derived = deriveGrid(monzaModel(false), MONZA_RACE_ID)!;
    expect(derived.grid.map((g) => g.driverId)).toEqual(MONZA_QUALI_ORDER);
    expect(derived.appliedPenalties).toBe(0);
  });

  it('returns null before qualifying exists', () => {
    const model = monzaModel(false);
    model.races[0]!.qualifying = undefined;
    expect(deriveGrid(model, MONZA_RACE_ID)).toBeNull();
  });
});

describe('assessReadiness — the strategy data gate (spec bước 2)', () => {
  it('post-race Monza save (next race has no allocation/practice/quali): all 3 missing', () => {
    const model = monzaModel();
    // the empty next weekend: no tyres, no practice, no qualifying
    model.races.push({
      raceId: 203, seasonId: 2027, trackId: 12, trackName: 'Baku',
      day: 46650, state: 0, isSprint: false, laps: 51, results: [],
    });
    model.tyres = [];
    const readiness = assessReadiness(model, 203);
    expect(readiness.ready).toBe(false);
    expect(readiness.allocation).toBe(false);
    expect(readiness.practiceSessions).toBe(0);
    expect(readiness.quali).toBe(false);
    expect(readiness.missing).toEqual(['allocation', 'practice', 'quali']);
  });

  it('mid-practice save: allocation + practice in, quali still missing', () => {
    const model = monzaModel();
    model.races[0]!.qualifying = undefined;
    const readiness = assessReadiness(model, MONZA_RACE_ID);
    expect(readiness.ready).toBe(false);
    expect(readiness.allocation).toBe(true);
    expect(readiness.practiceSessions).toBe(3); // 3 F1 sessions present
    expect(readiness.quali).toBe(false);
    expect(readiness.missing).toEqual(['quali']);
  });

  it('pre-race Monza save (allocation + 2 practice + quali): ready', () => {
    const readiness = assessReadiness(monzaModel(), MONZA_RACE_ID);
    expect(readiness.ready).toBe(true);
    expect(readiness.missing).toEqual([]);
    expect(readiness.grid).toHaveLength(22);
  });

  it('a completed race is never ready (allocation wiped post-race)', () => {
    const model = monzaModel();
    model.races[0]!.state = 2;
    const readiness = assessReadiness(model, MONZA_RACE_ID);
    expect(readiness.ready).toBe(false);
  });
});

describe('buildTyreLab — the gate blocks every plan before quali (spec bước 2)', () => {
  it('fixture lacking quali: no plan anywhere in the result', () => {
    const model = monzaModel();
    model.races[0]!.qualifying = undefined;
    const lab = buildTyreLab(model, MONZA_RACE_ID);
    expect(lab.data.readiness.ready).toBe(false);
    expect(lab.data.readiness.missing).toContain('quali');
    expect(lab.data.best).toBeNull();
    expect(lab.data.strategies).toHaveLength(0);
    expect(lab.data.gamePlan).toBeNull();
    expect(lab.recommendations).toHaveLength(0);
    expect(lab.warnings).toContain('STRATEGY_NOT_READY');
  });

  it('ready save: the plan path works normally', () => {
    const lab = buildTyreLab(monzaModel(), MONZA_RACE_ID);
    expect(lab.data.readiness.ready).toBe(true);
    expect(lab.data.best).not.toBeNull();
    expect(lab.data.strategies.length).toBeGreaterThan(0);
    expect(lab.recommendations.length).toBeGreaterThan(0);
  });
});

/* ── v0.7.0 step 3 — tyre inventory + the feasibility cap (spec bước 3) ── */

describe('buildTyreInventory — Monza garage (owner-verified numbers)', () => {
  it('caps the plan at the garage sets: maxStint {S 24, M 36, H 55}, not {26, 39, 60}', () => {
    const inventory = buildTyreInventory(monzaModel(), { S: 26, M: 39, H: 60 }, MONZA_RACE_ID);
    expect(inventory).not.toBeNull();
    expect(inventory!.maxStint).toEqual({ S: 24, M: 36, H: 55 });
  });

  it('never lets a used (state 2) set raise a cap — the best used S (22-life) stays out', () => {
    const model = monzaModel();
    const inventory = buildTyreInventory(model, { S: 26, M: 39, H: 60 }, MONZA_RACE_ID)!;
    const playerCar = inventory.cars.find((c) => c.carId === 20)!;
    const usedS = playerCar.sets.filter((s) => s.compound === 'S' && !s.available);
    expect(usedS.length).toBeGreaterThanOrEqual(2);
    expect(usedS.every((s) => (s.lifeRemaining ?? 0) < 24)).toBe(true);
    // the cap is untouched by the used sets (real save: best used S = 22 < 24)
    expect(inventory.maxStint.S).toBe(24);
  });

  it('labels the player cars per spec: driver names only when the seat is verified', () => {
    const inventory = buildTyreInventory(monzaModel(), { S: 26, M: 39, H: 60 }, MONZA_RACE_ID)!;
    expect(inventory.cars.map((c) => c.carId)).toEqual([20, 21]);
    // the fixture carries no practice-lap pairing for team 32 → Xe 1 / Xe 2
    expect(inventory.cars.map((c) => c.label)).toEqual(['Xe 1', 'Xe 2']);
    expect(inventory.cars.every((c) => !c.seatVerified)).toBe(true);
  });
});

/* ── v0.7.1 bước 2 — the garage is the PLAYER's two cars, never the field ──
 * The v0.7.0 fallback aggregated model.tyres (440 sets, 22 cars) whenever
 * the map was unverified: the Monza save then displayed fresh S×44 / M×24 /
 * H×23 (the whole championship) as the garage and built a cap from max
 * field life that could never bind. The fixture carries the REAL save's
 * numbers on both sides so this test is the direct lock. */
describe('buildTyreInventory v0.7.1 — player scope + per-car caps', () => {
  it('teamAggregate stays the PLAYER cars even with perCar forced false: 6/2/2 fresh (24/36/55), 10/4/2 used — never 44/24/23', () => {
    const model = monzaModel();
    model.gridPenalties!.carTeamsVerified = false; // force the old fallback path
    const inventory = buildTyreInventory(model, { S: 26, M: 39, H: 60 }, MONZA_RACE_ID)!;
    expect(inventory.perCar).toBe(false); // the flag really flipped
    const agg = (c: 'S' | 'M' | 'H') => inventory.teamAggregate.find((a) => a.compound === c)!;
    expect(agg('S').fresh).toBe(6);
    expect(agg('S').freshLife).toBe(24);
    expect(agg('M').fresh).toBe(2);
    expect(agg('M').freshLife).toBe(36);
    expect(agg('H').fresh).toBe(2);
    expect(agg('H').freshLife).toBe(55);
    expect(agg('S').used).toBe(10);
    expect(agg('M').used).toBe(4);
    expect(agg('H').used).toBe(2);
  });

  it('exposes per-car caps; the team maxStint is the min across cars (both paths locked)', () => {
    const inventory = buildTyreInventory(monzaModel(), { S: 26, M: 39, H: 60 }, MONZA_RACE_ID)!;
    expect(inventory.perCarMaxStint[20]).toEqual({ S: 24, M: 36, H: 55 });
    expect(inventory.perCarMaxStint[21]).toEqual({ S: 24, M: 36, H: 55 });
    expect(inventory.maxStint).toEqual({ S: 24, M: 36, H: 55 });
  });

  it('returns null when no CarID→team mapping exists — honest absence, no field-wide guess', () => {
    const model = monzaModel();
    model.gridPenalties!.carTeams = [];
    expect(buildTyreInventory(model, { S: 26, M: 39, H: 60 }, MONZA_RACE_ID)).toBeNull();
  });

  it('prices the LEAD plan on the LEAD car own cap when seats are verified and the garages diverge', () => {
    const model = monzaModel();
    // seat signal: car 20 ↔ driver 13, car 21 ↔ driver 285 (StaffID order).
    // The best laps sit WELL below every session best so the pace deltas
    // (M +0.03 / H +1.32) stay untouched — only LapCount matters here.
    model.races[0]!.practice!.push(
      { driverId: 13, teamId: 32, session: 1, bestLapMs: 91_500, bestLapTyre: 2, lapCount: 19 },
      { driverId: 13, teamId: 32, session: 2, bestLapMs: 91_500, bestLapTyre: 2, lapCount: 17 },
      { driverId: 285, teamId: 32, session: 1, bestLapMs: 91_600, bestLapTyre: 2, lapCount: 21 },
      { driverId: 285, teamId: 32, session: 2, bestLapMs: 91_600, bestLapTyre: 2, lapCount: 16 },
    );
    const pair = (carId: number, laps: [number, number]) => {
      const rows = model.tyres.filter((t) => t.carId === carId);
      rows[0]!.lapsCompleted = laps[0];
      rows[0]!.sessionLastUsedIn = 1;
      rows[1]!.lapsCompleted = laps[1];
      rows[1]!.sessionLastUsedIn = 2;
    };
    pair(20, [19, 17]);
    pair(21, [21, 16]);
    // divergent garage: car 20 — the TRAIL's car (13, grid P21) — has a
    // shorter-lived M set: 30 laps instead of the team's 36. The team cap
    // (min) follows car 20; the LEAD's own cap stays M 36, so the split
    // must NOT price the lead's plan on the trail's shorter garage.
    for (const t of model.tyres) {
      if (t.carId === 20 && t.weekendTyreType === 1 && t.availabilityState === 0) {
        t.estimatedLapLifeRemaining = 30;
      }
    }
    const inventory = buildTyreInventory(model, { S: 26, M: 39, H: 60 }, MONZA_RACE_ID)!;
    expect(inventory.perCarMaxStint[20]).toEqual({ S: 24, M: 30, H: 55 });
    expect(inventory.perCarMaxStint[21]).toEqual({ S: 24, M: 36, H: 55 });
    expect(inventory.maxStint).toEqual({ S: 24, M: 30, H: 55 }); // team min

    const lab = buildTyreLab(model, MONZA_RACE_ID);
    const split = lab.data.carPlans!;
    expect(split.lead.driverId).toBe(285);
    // the lead (car 21) runs the optimum on ITS OWN cap: S(19)→M(34) 57.6s —
    // not the team-min (M 30) re-split the ranked list carries
    expect(split.lead.plan.stints.map((s) => `${s.compound}(${s.laps})`)).toEqual(['S(19)', 'M(34)']);
    expect(split.lead.plan.timeS).toBeCloseTo(57.6, 1);
    expect(lab.assumptions.some((a) => a.text.includes('cap xe khác cap đội'))).toBe(true);
    // the trail (13, car 20) is priced on its own shorter garage: the M
    // stint can never exceed 30 laps
    expect(split.trail!.driverId).toBe(13);
    expect(split.trail!.plan.stints.map((s) => s.compound)).toEqual(['M', 'S']);
    expect(split.trail!.plan.stints[0]!.laps).toBeLessThanOrEqual(30);
    // every trail pit stays ≥ 3 laps clear of the lead's pits
    const leadPits = split.lead.plan.pitLaps;
    expect(split.trail!.plan.pitLaps.every((p) => leadPits.every((l) => Math.abs(p - l) >= 3))).toBe(true);
  });

  it('prices the game plan on the garage cap: M→H pit 25 = 75.0s, not the model-lives 72.5s', () => {
    const lab = buildTyreLab(monzaModel(), MONZA_RACE_ID);
    const game = lab.data.gamePlan;
    expect(game).not.toBeNull();
    expect(game!.compounds.join('→')).toBe('M→H');
    expect(game!.stintLaps).toEqual([24, 29]);
    expect(game!.pitLaps).toEqual([25]);
    expect(game!.totalTimeS).toBeCloseTo(75.0, 1);
  });
});

/* ── v0.7.2 — per-car aggregates: the card must show the CAR's numbers ──
 * The v0.7.1 view rendered `teamAggregate` inside every car card, so both
 * cards displayed the TEAM totals (S fresh ×6 / used ×10) where the save
 * carries ×3 / ×5 per car. The engine always had the per-car data
 * (`InventoryCar.sets`); v0.7.2 exposes it as `InventoryCar.aggregate`,
 * built by the SAME helper as the team union (aggregateSets). Every number
 * below is the owner-verified per-car allocation of the Monza pre-race
 * save (save4.sav, Save_CarTyreAllocation) — the two cars MUST differ. */
describe('aggregateSets — the one aggregation formula (v0.7.2)', () => {
  const set = (o: Partial<InventorySet> & { compound: InventorySet['compound'] }): InventorySet => ({
    tyreSetId: 1, wear: 1, lifeRemaining: 24, lapsCompleted: 0, sessionLastUsedIn: null,
    available: true, fresh: true, ...o,
  });

  it('fresh count + avg life, used ranges; life-0 used sets stay out of the ranges (unchanged rule)', () => {
    const rows = aggregateSets([
      set({ compound: 'S' }),
      set({ tyreSetId: 2, compound: 'S', wear: 0.65, lifeRemaining: 22, lapsCompleted: 20, sessionLastUsedIn: 1, available: false, fresh: false }),
      set({ tyreSetId: 3, compound: 'S', wear: 0.9, lifeRemaining: 16, lapsCompleted: 30, sessionLastUsedIn: 1, available: false, fresh: false }),
      set({ tyreSetId: 4, compound: 'M', wear: 0.5, lifeRemaining: 0, lapsCompleted: 40, sessionLastUsedIn: 1, available: false, fresh: false }),
    ]);
    const s = rows.find((r) => r.compound === 'S')!;
    expect(s.fresh).toBe(1);
    expect(s.freshLife).toBe(24);
    expect(s.used).toBe(2);
    expect(s.usedWear).toEqual([0.65, 0.9]);
    expect(s.usedLife).toEqual([16, 22]);
    // the only used M has life 0 — excluded, exactly like the old inline formula
    const m = rows.find((r) => r.compound === 'M')!;
    expect(m.used).toBe(1);
    expect(m.usedLife).toBeNull();
  });

  it('fresh life averages to 1 decimal', () => {
    const rows = aggregateSets([
      set({ compound: 'H', lifeRemaining: 55.24 }),
      set({ tyreSetId: 2, compound: 'H', lifeRemaining: 55.35 }),
    ]);
    expect(rows.find((r) => r.compound === 'H')!.freshLife).toBe(55.3);
  });
});

describe('buildTyreInventory v0.7.2 — per-car aggregate on the REAL Monza allocation', () => {
  const aggOf = (carId: number, c: 'S' | 'M' | 'H') =>
    buildTyreInventory(monzaModel(), { S: 26, M: 39, H: 60 }, MONZA_RACE_ID)!
      .cars.find((x) => x.carId === carId)!
      .aggregate.find((a) => a.compound === c)!;

  it('car 20: S fresh ×3 (24) / used ×5 (wear 65–90%, life 16–22); M used ×2 (60–82%, 22–29); H used ×1 (74%, 41)', () => {
    expect(aggOf(20, 'S').fresh).toBe(3);
    expect(aggOf(20, 'S').freshLife).toBe(24);
    expect(aggOf(20, 'S').used).toBe(5);
    expect(aggOf(20, 'S').usedWear).toEqual([0.65, 0.9]);
    expect(aggOf(20, 'S').usedLife).toEqual([16, 22]);
    expect(aggOf(20, 'M').fresh).toBe(1);
    expect(aggOf(20, 'M').freshLife).toBe(36);
    expect(aggOf(20, 'M').used).toBe(2);
    expect(aggOf(20, 'M').usedWear).toEqual([0.6, 0.82]);
    expect(aggOf(20, 'M').usedLife).toEqual([22, 29]);
    expect(aggOf(20, 'H').fresh).toBe(1);
    expect(aggOf(20, 'H').freshLife).toBe(55);
    expect(aggOf(20, 'H').used).toBe(1);
    expect(aggOf(20, 'H').usedWear).toEqual([0.74, 0.74]);
    expect(aggOf(20, 'H').usedLife).toEqual([41, 41]);
  });

  it('car 21: S used (wear 54–90%, life 13–22); M used ×2 (55–57%, BOTH life 20) — the cars differ', () => {
    expect(aggOf(21, 'S').fresh).toBe(3);
    expect(aggOf(21, 'S').used).toBe(5);
    expect(aggOf(21, 'S').usedWear).toEqual([0.54, 0.9]);
    expect(aggOf(21, 'S').usedLife).toEqual([13, 22]);
    expect(aggOf(21, 'M').fresh).toBe(1);
    expect(aggOf(21, 'M').used).toBe(2);
    expect(aggOf(21, 'M').usedWear).toEqual([0.55, 0.57]);
    expect(aggOf(21, 'M').usedLife).toEqual([20, 20]);
    expect(aggOf(21, 'H').usedWear).toEqual([0.74, 0.74]);
    expect(aggOf(21, 'H').usedLife).toEqual([41, 41]);
    // the discriminators between the two cards really differ
    expect(aggOf(20, 'S').usedWear).not.toEqual(aggOf(21, 'S').usedWear);
    expect(aggOf(20, 'M').usedLife).not.toEqual(aggOf(21, 'M').usedLife);
  });

  it('teamAggregate stays the union: S ×6/×10 (54–90%, 13–22); M ×2/×4 (55–82%, 20–29); H ×2/×2', () => {
    const inv = buildTyreInventory(monzaModel(), { S: 26, M: 39, H: 60 }, MONZA_RACE_ID)!;
    const agg = (c: 'S' | 'M' | 'H') => inv.teamAggregate.find((a) => a.compound === c)!;
    expect(agg('S').fresh).toBe(6);
    expect(agg('S').freshLife).toBe(24);
    expect(agg('S').used).toBe(10);
    expect(agg('S').usedWear).toEqual([0.54, 0.9]);
    expect(agg('S').usedLife).toEqual([13, 22]);
    expect(agg('M').fresh).toBe(2);
    expect(agg('M').freshLife).toBe(36);
    expect(agg('M').used).toBe(4);
    expect(agg('M').usedWear).toEqual([0.55, 0.82]);
    expect(agg('M').usedLife).toEqual([20, 29]);
    expect(agg('H').fresh).toBe(2);
    expect(agg('H').freshLife).toBe(55);
    expect(agg('H').used).toBe(2);
    expect(agg('H').usedWear).toEqual([0.74, 0.74]);
    expect(agg('H').usedLife).toEqual([41, 41]);
  });

  it('the fixture rework moves NO engine number: caps stay {S 24, M 36, H 55} per car and team-wide', () => {
    const inv = buildTyreInventory(monzaModel(), { S: 26, M: 39, H: 60 }, MONZA_RACE_ID)!;
    expect(inv.maxStint).toEqual({ S: 24, M: 36, H: 55 });
    expect(inv.perCarMaxStint[20]).toEqual({ S: 24, M: 36, H: 55 });
    expect(inv.perCarMaxStint[21]).toEqual({ S: 24, M: 36, H: 55 });
  });
});

/* ── v0.7.1 bước 5 — ONE practice reporting pipeline ─────────────────────
 * practiceSessions (sessions PRESENT in the save, F1 only) and
 * sessionsMeasured (sessions that produced a gap) are different numbers:
 * Monza 3 vs 2. The M ranking delta is the measured median (0.0285 →
 * +0.03s) — the old 0.05 floor would have overwritten it everywhere. */
describe('practice pipeline — one source for sessions + deltas (spec bước 5)', () => {
  it('readiness says 3 F1 sessions, TyreLab says the same 3, measured says 2', () => {
    const model = monzaModel();
    const readiness = assessReadiness(model, MONZA_RACE_ID);
    const lab = buildTyreLab(model, MONZA_RACE_ID);
    expect(readiness.practiceSessions).toBe(3);
    expect(lab.data.practiceSessions).toBe(readiness.practiceSessions); // same source
    expect(lab.data.practiceSessions).not.toBe(2);
  });

  it('the ranking delta M is the measured +0.03s everywhere — getPracticePace, lab, evidence', () => {
    const model = monzaModel();
    const pace = getPracticePace(model, model.races[0]!.trackId);
    expect(pace).not.toBeNull();
    expect(pace!.sessionsMeasured).toBe(2);
    expect(pace!.rawDeltas.M).toBeCloseTo(0.0285, 6); // the real save's raw value
    expect(pace!.deltas.M).toBe(0.03); // ranking = measured, rounded 2dp
    expect(pace!.clamped.M).toBe(false); // rounding is NOT a clamp
    expect(pace!.deltas.H).toBe(1.32);

    const lab = buildTyreLab(model, MONZA_RACE_ID);
    // buildTyreLab consumes practicePace.deltas directly — same numbers
    expect(lab.data.deltas.M).toBe(pace!.deltas.M);
    expect(lab.data.deltas.H).toBe(pace!.deltas.H);
    expect(lab.data.paceMeasured.M!.delta).toBe(pace!.deltas.M);
    // the evidence carries "+0.03s" and the 2/3 measured/present split —
    // and NEVER the old floor's "+0.05s" for M
    const practiceEvidence = lab.evidence.find((e) => e.source === 'Races_PracticeResults')!;
    expect(practiceEvidence.label).toContain('M +0.03s');
    expect(practiceEvidence.label).toContain('(2/3 session đo được delta');
    expect(practiceEvidence.label).not.toContain('+0.05s');
  });

  it('the F2/F3 fields in session 1 never enter the pace pool (real-save shape)', () => {
    const model = monzaModel();
    // the fixture's F2/F3 rows run 89.0s on M — faster than every F1 lap.
    // If they leaked into the pool, bestM would drop below bestS and the
    // SM gap would go degenerate → the +0.03 median could not survive.
    const pace = getPracticePace(model, model.races[0]!.trackId)!;
    expect(pace.deltas.M).toBe(0.03);
    expect(pace.measured.M).toBe('session');
  });

  it('a degenerate (≤ 0) M measurement still floors to 0.05 — the only remaining M floor', () => {
    // corrupt one session's M to be faster than its S: gaps [−0.05, +0.03]
    const model = monzaModel();
    const rows = model.races[0]!.practice!;
    const mRow = rows.find((r) => r.driverId === 212)!; // session 1 M, 90.028s
    mRow.bestLapMs = 89_900; // faster than session 1's S best (90.000)
    const pace = getPracticePace(model, model.races[0]!.trackId)!;
    // median(−0.100, 0.029) = −0.0355 ≤ 0 → the degenerate floor applies
    expect(pace.rawDeltas.M!).toBeLessThanOrEqual(0);
    expect(pace.deltas.M).toBe(0.05);
    expect(pace.clamped.M).toBe(true);
  });
});

describe('buildTyreLab — inventory re-pricing (Monza 53 laps, spec bước 3)', () => {
  it('re-prices the S(19)→M(34) lead 51.7s → 57.6s on the garage cap', () => {
    const lab = buildTyreLab(monzaModel(), MONZA_RACE_ID);
    const data = lab.data;
    // field-median lives stay on record
    expect(data.lives).toEqual({ S: 26, M: 39, H: 60 });
    // the garage cap re-prices the lead
    expect(data.best).not.toBeNull();
    expect(data.best!.stints.map((s) => `${s.compound}(${s.laps})`)).toEqual(['S(19)', 'M(34)']);
    expect(data.best!.timeS).toBeCloseTo(57.6, 1);
    expect(data.best!.modelTimeS).toBeCloseTo(51.7, 1);
    expect(data.best!.pitLaps).toEqual([19]);
    // deg components move exactly as the owner computed:
    //   deg M34: 19.5s (life 39) → 23.3s (life 36); deg S19: 10.5 → 12.5 (life 24)
    expect(data.best!.stints[0]!.degS).toBeCloseTo(12.5, 1);
    expect(data.best!.stints[1]!.degS).toBeCloseTo(23.3, 1);
    // the why names the inventory basis
    expect(lab.recommendations[0]!.why).toContain('kho lốp');
  });

  it('v0.9.1 filters the 2-pit M plans: 2 M stints but each car owns exactly 1 usable M set', () => {
    const lab = buildTyreLab(monzaModel(), MONZA_RACE_ID);
    // M→S→M was 54.5s on the cap / 52.7s on model lives — cheaper on
    // paper, but no car owns a second M set to run the second M stint
    for (const order of ['S→M→M', 'M→S→M', 'M→M→S']) {
      expect(lab.data.strategies.find((s) => s.order.join('→') === order && s.stops === 2)).toBeUndefined();
    }
    // the why names the first-ranked 2-M plan, its stint laps and the per-car stock
    const note = lab.assumptions.find((a) => a.text.includes('kho không chạy được: S→M→M'));
    expect(note).toBeDefined();
    expect(note!.text).toContain('2 stint M');
    expect(note!.text).toContain('1 bộ M khả dụng');
    expect(note!.text).toContain('đời 36');
  });

  it('an S stint of 25 laps exceeds the garage cap (best fresh S life 24) — infeasible', () => {
    const lab = buildTyreLab(monzaModel(), MONZA_RACE_ID);
    // S25 exceeds the garage's best available S life (24) — no proposed
    // plan may carry a stint past the garage cap of its compound
    for (const plan of lab.data.strategies) {
      for (const st of plan.stints) {
        if (st.compound === 'S') expect(st.laps).toBeLessThanOrEqual(24);
        if (st.compound === 'M') expect(st.laps).toBeLessThanOrEqual(36);
        if (st.compound === 'H') expect(st.laps).toBeLessThanOrEqual(55);
      }
    }
  });

  it('names the fastest infeasible model plan with its set reason', () => {
    const model = monzaModel();
    // shrink the garage's M life below what any 1-stop M stint needs: the
    // model-best S→M (M stint ≥ 29 laps) becomes infeasible and the engine
    // must say why
    for (const t of model.tyres) {
      if (t.weekendTyreType === 1 && t.availabilityState === 0) {
        t.estimatedLapLifeRemaining = 12;
      }
    }
    const lab = buildTyreLab(model, MONZA_RACE_ID);
    // the proposed plans must not contain an M stint longer than 12 laps
    for (const plan of lab.data.strategies) {
      for (const st of plan.stints) {
        if (st.compound === 'M') expect(st.laps).toBeLessThanOrEqual(12);
      }
    }
    expect(lab.assumptions.some((a) => a.text.includes('kho không chạy được') || a.text.includes('kho lốp'))).toBe(true);
  });
});

/* ── v0.7.0 step 4 — the two-car split by grid position (spec bước 4) ──────
 * Owner-verified Monza shape: O'Ward (285) grid P20 leads with the
 * optimizer's S(19)→M(34) pit V19; Ricciardo (13) grid P21 trails with the
 * tied M(34)→S(19) pit V34 — different starting compound, pits 15 laps
 * apart. The 2-pit M→S→M (54.5s on the cap — FASTER on paper) is GONE
 * entirely since v0.9.1: two M stints need two usable M sets per car and
 * each car owns exactly one (before that, the pit-gap rule alone kept it
 * off the trail slot). No invented queue constant — the ≥3-lap offset rule
 * IS the handling. */

describe('buildTyreLab carPlans — lead/trail split on the Monza grid', () => {
  it('REAL pre-race grid: lead O\'Ward P21, trail Ricciardo P22 (quali order — no pending penalty in this save)', () => {
    const model = monzaModel(false);
    model.gridPenalties!.rows = monzaRealPenaltyRows();
    const lab = buildTyreLab(model, MONZA_RACE_ID);
    const split = lab.data.carPlans!;
    expect(split.lead.driverId).toBe(285);
    expect(split.lead.gridPos).toBe(21); // quali order — NOT the post-race P20
    expect(split.trail!.driverId).toBe(13);
    expect(split.trail!.gridPos).toBe(22); // quali order — NOT the post-race P21
    // same plans, same totals: the split logic is grid-position-agnostic
    expect(split.lead.plan.stints.map((s) => `${s.compound}(${s.laps})`)).toEqual(['S(19)', 'M(34)']);
    expect(split.lead.plan.timeS).toBeCloseTo(57.6, 1);
    expect(split.trail!.plan.stints.map((s) => `${s.compound}(${s.laps})`)).toEqual(['M(34)', 'S(19)']);
    expect(split.trail!.plan.timeS).toBeCloseTo(57.6, 1);
  });

  it("SYNTHETIC penalty grid: lead O'Ward P20 S(19)→M(34) V19; trail Ricciardo P21 M(34)→S(19) V34", () => {
    const lab = buildTyreLab(monzaModel(), MONZA_RACE_ID);
    const split = lab.data.carPlans;
    expect(split).not.toBeNull();
    expect(split!.lead.driverId).toBe(285);
    expect(split!.lead.gridPos).toBe(20);
    expect(split!.lead.role).toBe('lead');
    expect(split!.lead.plan.stints.map((s) => `${s.compound}(${s.laps})`)).toEqual(['S(19)', 'M(34)']);
    expect(split!.lead.plan.pitLaps).toEqual([19]);
    expect(split!.lead.plan.timeS).toBeCloseTo(57.6, 1);
    expect(split!.trail).not.toBeNull();
    expect(split!.trail!.driverId).toBe(13);
    expect(split!.trail!.gridPos).toBe(21);
    expect(split!.trail!.plan.stints.map((s) => `${s.compound}(${s.laps})`)).toEqual(['M(34)', 'S(19)']);
    expect(split!.trail!.plan.pitLaps).toEqual([34]);
    expect(split!.trail!.plan.timeS).toBeCloseTo(57.6, 1);
    expect(split!.trail!.reason).toBe('diff-compound');
  });

  it('v0.9.1: the faster 2-pit M→S→M cannot be the trail — it is not even ranked (1 M set/car)', () => {
    const lab = buildTyreLab(monzaModel(), MONZA_RACE_ID);
    const split = lab.data.carPlans!;
    // the 2-pit plan never survives the set-assignment law…
    const two = lab.data.strategies.find((s) => s.order.join('→') === 'M→S→M' && s.stops === 2);
    expect(two).toBeUndefined();
    // …and the trail is still the tied 1-stop on the trail car's own garage
    expect(split.trail!.plan.order.join('→')).toBe('M→S');
    expect(split.trail!.plan.stints.map((s) => `${s.compound}(${s.laps})`)).toEqual(['M(34)', 'S(19)']);
    expect(split.trail!.plan.pitLaps.every((p) => Math.abs(p - 19) >= 3)).toBe(true);
  });

  it('flags the tie: same multiset, hedge not speed — and records the model limitation', () => {
    const lab = buildTyreLab(monzaModel(), MONZA_RACE_ID);
    const split = lab.data.carPlans!;
    expect(split.tie).toBe(true);
    expect(lab.assumptions.some((a) => a.text.includes('hedge, không phải vì nhanh hơn'))).toBe(true);
    expect(lab.assumptions.some((a) => a.text.includes('không phân biệt deg của stint chạy đầu'))).toBe(true);
  });

  it('carPlans null when the grid does not cover both player drivers', () => {
    const model = monzaModel();
    model.drivers = model.drivers.filter((d) => d.teamId !== 32);
    const lab = buildTyreLab(model, MONZA_RACE_ID);
    expect(lab.data.carPlans).toBeNull();
  });

  it('per-plan confidence uses the same v0.6.1 pillars', () => {
    const lab = buildTyreLab(monzaModel(), MONZA_RACE_ID);
    const split = lab.data.carPlans!;
    expect(split.lead.confidence).toBe(lab.confidence);
    expect(split.trail!.confidence).toBe(lab.confidence);
  });
});
