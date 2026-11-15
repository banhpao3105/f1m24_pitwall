/**
 * Grid engine tests (v0.7.0 step 2) — locked to the owner-verified Monza
 * 2027 pre-race save numbers (spec mục "Dữ liệu đã xác minh"):
 *
 * Grid suy từ quali khớp StartingPos sau race cho cả 22 xe, including the
 * trap cases: driver 102 quali P7 → grid P22 (back-of-grid penalty, team 2
 * row in Races_GridPenalties) and driver 95 quali P8 → grid P7 (everyone
 * behind the penalized car moves up one). The quali order below reconstructs
 * exactly that classification: P1–P6 unchanged, 102 at P7, then 95, 12, 11,
 * 3, 280, 14, 120, 17, 83, 142, 76, 8, 255, 285, 13.
 *
 * The seat resolution uses the practice-lap signal (allocation LapsCompleted
 * per SessionLastUsedIn vs Races_PracticeResults.LapCount) — the signal the
 * owner verified on the real save. Penalty places come from the game's own
 * Races_Enum_PenaltyType (reason 3 = CausingCollision = 3 places, verified).
 */

import { describe, it, expect } from 'vitest';
import { assessReadiness, deriveGrid, resolveCarDrivers } from '@/engines/grid.engine';
import { buildTyreLab } from '@/engines/tyre.engine';
import { emptyPhase2Sections } from '../helpers/model';
import type { SaveModel, Race, QualifyingResult, PracticeResult, Team, Driver, TyreAllocation } from '@/domain/types';

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

/** Practice laps: team 2's two cars get distinct per-session totals that
 * match their drivers (car 2 → driver 12, car 3 → driver 102) — the signal
 * the owner verified. Other drivers get unpaired rows (fallback seats). */
function monzaPractice(): PracticeResult[] {
  const rows: PracticeResult[] = [
    { driverId: 12, teamId: 2, session: 1, bestLapMs: 90_000, bestLapTyre: 2, lapCount: 20 },
    { driverId: 12, teamId: 2, session: 2, bestLapMs: 90_100, bestLapTyre: 2, lapCount: 18 },
    { driverId: 102, teamId: 2, session: 1, bestLapMs: 90_200, bestLapTyre: 2, lapCount: 15 },
    { driverId: 102, teamId: 2, session: 2, bestLapMs: 90_300, bestLapTyre: 2, lapCount: 22 },
  ];
  for (const d of MONZA_QUALI_ORDER) {
    if (d === 12 || d === 102) continue;
    rows.push({ driverId: d, teamId: TEAM_OF[d], session: 1, bestLapMs: 91_000, bestLapTyre: 2 });
  }
  return rows;
}

/** Allocation rows carrying the same per-session lap totals for team 2's
 * cars (SessionLastUsedIn 1/2), fresh filler sets for everyone else. */
function monzaAllocation(): TyreAllocation[] {
  const sets: TyreAllocation[] = [];
  const push = (carId: number, type: number, life: number, laps = 0, session = 11) => {
    sets.push({
      carId, tyreSetId: sets.length + 1, weekendTyreType: type,
      frontLeftWear: 1, availabilityState: 0, estimatedLapLifeRemaining: life,
      ...(laps > 0 ? { lapsCompleted: laps, sessionLastUsedIn: session } : {}),
    });
  };
  // team 2 cars = CarID 2 (seat 1) and 3 (seat 2): car 2 ↔ driver 12
  push(2, 2, 24, 20, 1);
  push(2, 2, 24, 18, 2);
  push(3, 2, 24, 15, 1);
  push(3, 2, 24, 22, 2);
  for (const carId of [2, 3]) {
    push(carId, 1, 36);
    push(carId, 0, 55);
  }
  for (const carId of [0, 1, 4, 5, 20, 21]) {
    push(carId, 2, 24);
    push(carId, 1, 36);
    push(carId, 0, 55);
  }
  return sets;
}

/** The verified pending penalty: team 2, seat 2, engine allocation exceeded
 * → back of the grid (the owner-verified Monza shape: quali P7 → P22). */
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
    availability: [],
  };
}

describe('deriveGrid — Monza 2027 (owner-verified grid)', () => {
  it('reproduces the verified StartingPos for all 22 drivers', () => {
    const derived = deriveGrid(monzaModel(), MONZA_RACE_ID);
    expect(derived).not.toBeNull();
    const grid = derived!.grid;
    expect(grid).toHaveLength(22);
    expect(grid.map((g) => g.driverId)).toEqual(MONZA_GRID);
  });

  it('drops the penalized car to the back and moves everyone behind up one', () => {
    const derived = deriveGrid(monzaModel(), MONZA_RACE_ID)!;
    const p102 = derived.grid.find((g) => g.driverId === 102)!;
    expect(p102.gridPos).toBe(22);
    expect(p102.qualiPos).toBe(7);
    expect(p102.backOfGrid).toBe(true);
    const p95 = derived.grid.find((g) => g.driverId === 95)!;
    expect(p95.qualiPos).toBe(8);
    expect(p95.gridPos).toBe(7); // moved up one
    const p285 = derived.grid.find((g) => g.driverId === 285)!;
    expect(p285.gridPos).toBe(20); // O'Ward
    const p13 = derived.grid.find((g) => g.driverId === 13)!;
    expect(p13.gridPos).toBe(21); // Ricciardo
  });

  it('resolves the penalized seat via the practice-lap signal (verified)', () => {
    const model = monzaModel();
    const carDrivers = resolveCarDrivers(model, MONZA_RACE_ID);
    expect(carDrivers.byCar.get(2)).toEqual({ driverId: 12, verified: true });
    expect(carDrivers.byCar.get(3)).toEqual({ driverId: 102, verified: true });
    const derived = deriveGrid(model, MONZA_RACE_ID)!;
    expect(derived.appliedPenalties).toBe(1);
    expect(derived.seatMappingVerified).toBe(true);
  });

  it('applies place-count penalties from the game enum (reason 3 = 3 places)', () => {
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
    expect(readiness.practiceSessions).toBe(2);
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
