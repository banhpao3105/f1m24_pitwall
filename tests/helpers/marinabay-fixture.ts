/**
 * MarinaBay 2027 pre-race fixture (v0.9.1, prompt §0 — owner-verified SQL
 * numbers from autosave-4.sav, sha 35c075c9…, Day 46663, race 204, 62 laps,
 * post-quali):
 *
 *   · Player allocation per car (both cars IDENTICAL — verified):
 *       S available (AvailabilityState 0) lives [21, 21, 21, 19, 19]
 *       M available: exactly 1 set (fresh, life 31 — tyreSetId 8)
 *       M locked (AvailabilityState 2): lives 18 / 22 (đời 18–19 / 22–23)
 *       H available: exactly 1 set (fresh, life 48)
 *   · Field fresh-set medians → model lives S 22 / M 33 / H 48 (the values
 *     the v0.8.1 lab ranked on: model best S→M→M (16,23,23) @ 90.7s);
 *     garage cap → S 21 / M 31 / H 48 (min(model life, best set life)).
 *   · Practice: 1 F1 session present but M/H under-sampled (< 3 drivers per
 *     compound) → NO measured delta → ranking on the model constants
 *     M +0.55 / H +1.05 (verified: every v0.8.1/v0.9.1 price on this save
 *     reproduces exactly with those constants — 94.0 / 97.1 / 101.9 / 103.7).
 *   · Game plan: S→M→H, pit 19/38 → web-modelled 103.7s on the garage cap.
 *
 * Every number above feeds the v0.9.1 DoD locked in tyre.sets.test.ts.
 */

import type {
  SaveModel,
  Race,
  PracticeResult,
  QualifyingResult,
  Team,
  Driver,
  TyreAllocation,
  PlayerStrategySection,
} from '@/domain/types';
import { emptyPhase2Sections } from './model';

export const MARINA_RACE_ID = 204;
export const MARINA_TRACK_ID = 5;
export const MARINA_LAPS = 62;
export const MARINA_DAY = 46663;

/** Player team + 10 AI teams; drivers 101/102 are the player's seats. */
function marinaTeams(): Team[] {
  return Array.from({ length: 11 }, (_, i) => ({
    teamId: i + 1,
    teamName: i === 0 ? 'Player Racing' : `Team ${i + 1}`,
    isCustomTeam: false,
    formula: 1,
  }));
}

function marinaDrivers(): Driver[] {
  const drivers: Driver[] = [
    { staffId: 101, fullName: 'Player One', teamId: 1 },
    { staffId: 102, fullName: 'Player Two', teamId: 1 },
  ];
  for (let d = 1; d <= 20; d++) {
    drivers.push({ staffId: d, fullName: `Driver ${d}`, teamId: Math.floor((d - 1) / 2) + 2 });
  }
  return drivers;
}

/** Staged quali: Q3 P1–P10, Q2 P11–P16, Q1 P17–P22. Player seats P3 / P5. */
function marinaQualifying(): QualifyingResult[] {
  const aiIds = Array.from({ length: 20 }, (_, i) => i + 1);
  const order: number[] = [];
  // weave the player drivers in at P3 and P5
  const slots: (number | 'P1' | 'P2')[] = [];
  let ai = 0;
  for (let pos = 1; pos <= 22; pos++) {
    if (pos === 3) slots.push('P1');
    else if (pos === 5) slots.push('P2');
    else slots.push(aiIds[ai++]);
  }
  for (const [pos, id] of slots.entries()) {
    order.push(typeof id === 'string' ? (id === 'P1' ? 101 : 102) : id);
    void pos;
  }
  return order.map((driverId, i) => {
    const pos = i + 1;
    const stage = pos <= 10 ? 3 : pos <= 16 ? 2 : 1;
    return {
      driverId,
      driverName: `Driver ${driverId}`,
      teamId: driverId === 101 || driverId === 102 ? 1 : Math.floor((driverId - 1) / 2) + 2,
      finishingPos: pos,
      stage,
      raceFormula: 1,
    };
  });
}

/**
 * 1 F1 practice session, M/H under-sampled: S 3 drivers (≥ MIN_PACE_SAMPLE),
 * M 2, H 2 → no session gap is measurable and the cross-session rule also
 * stays under 3 distinct drivers → practicePace null → the ranking deltas
 * are the model constants (M +0.55 / H +1.05), exactly like the real save.
 * The PLAYER drivers carry no practice rows → seats stay unverified ("Xe
 * 1/2" — the documented fail-safe, prompt v0.9.1 §6).
 */
function marinaPractice(): PracticeResult[] {
  return [
    { driverId: 1, teamId: 2, session: 1, bestLapMs: 90_500, bestLapTyre: 2, raceFormula: 1 },
    { driverId: 2, teamId: 2, session: 1, bestLapMs: 90_620, bestLapTyre: 2, raceFormula: 1 },
    { driverId: 3, teamId: 3, session: 1, bestLapMs: 90_740, bestLapTyre: 2, raceFormula: 1 },
    { driverId: 4, teamId: 3, session: 1, bestLapMs: 91_050, bestLapTyre: 1, raceFormula: 1 },
    { driverId: 5, teamId: 4, session: 1, bestLapMs: 91_170, bestLapTyre: 1, raceFormula: 1 },
    { driverId: 6, teamId: 4, session: 1, bestLapMs: 91_550, bestLapTyre: 0, raceFormula: 1 },
    { driverId: 7, teamId: 5, session: 1, bestLapMs: 91_670, bestLapTyre: 0, raceFormula: 1 },
  ];
}

/**
 * The owner-verified allocation. Player cars = CarID 0/1 (team 1) with the
 * EXACT set shape from prompt §0 (the fresh M is tyreSetId 8 — "bộ #8").
 * AI cars carry uniform fresh lives so the field medians (getCompoundCaps)
 * come out S 22 / M 33 / H 48 — the model lives the v0.8.1 lab ranked on.
 */
export function marinaAllocation(): TyreAllocation[] {
  const sets: TyreAllocation[] = [];
  const push = (
    carId: number,
    type: number,
    life: number,
    tyreSetId: number,
    opts: { state?: number; wear?: number; laps?: number; session?: number } = {},
  ) => {
    sets.push({
      carId,
      tyreSetId,
      weekendTyreType: type,
      frontLeftWear: opts.wear ?? 1,
      availabilityState: opts.state ?? 0,
      estimatedLapLifeRemaining: life,
      ...(opts.laps != null
        ? { lapsCompleted: opts.laps, sessionLastUsedIn: opts.session ?? 1 }
        : {}),
    });
  };
  for (const carId of [0, 1]) {
    // S — 3 fresh @ 21 + 2 used-but-race-available @ 19 (state 0, per SQL)
    push(carId, 2, 21, 1);
    push(carId, 2, 21, 2);
    push(carId, 2, 21, 3);
    push(carId, 2, 19, 4, { wear: 0.45, laps: 14, session: 1 });
    push(carId, 2, 19, 5, { wear: 0.48, laps: 12, session: 1 });
    // M — 2 locked (state 2, đời 18 / 22) + exactly 1 fresh usable @ 31 (#8)
    push(carId, 1, 18, 6, { state: 2, wear: 0.62, laps: 22, session: 2 });
    push(carId, 1, 22, 7, { state: 2, wear: 0.75, laps: 18, session: 1 });
    push(carId, 1, 31, 8);
    // H — exactly 1 fresh usable @ 48
    push(carId, 0, 48, 9);
  }
  // AI cars 2..21: uniform fresh S 22 / M 33 / H 48 → field medians 22/33/48
  for (let carId = 2; carId <= 21; carId++) {
    push(carId, 2, 22, carId * 100 + 1);
    push(carId, 2, 22, carId * 100 + 2);
    push(carId, 1, 33, carId * 100 + 3);
    push(carId, 0, 48, carId * 100 + 4);
  }
  return sets;
}

/** The in-game strategist plan on the save: S→M→H, pit 19/38. */
function marinaGamePlan(): PlayerStrategySection {
  return {
    tablePresent: true,
    plans: [
      {
        loadoutId: 0,
        strategyId: 1,
        selected: true,
        stints: [
          {
            stintIndex: 0,
            compound: 'S',
            pitWindowStart: null,
            pitWindowEnd: null,
            expectedPitLap: null,
            optimalPitLap: null,
          },
          {
            stintIndex: 1,
            compound: 'M',
            pitWindowStart: 17,
            pitWindowEnd: 21,
            expectedPitLap: 19,
            optimalPitLap: 19,
          },
          {
            stintIndex: 2,
            compound: 'H',
            pitWindowStart: 36,
            pitWindowEnd: 40,
            expectedPitLap: 38,
            optimalPitLap: 38,
          },
        ],
      },
    ],
  };
}

export function buildMarinaBayModel(): SaveModel {
  const race: Race = {
    raceId: MARINA_RACE_ID,
    seasonId: 2027,
    trackId: MARINA_TRACK_ID,
    trackName: 'Marina Bay',
    day: MARINA_DAY,
    state: 1, // post-quali, pre-race
    isSprint: false,
    laps: MARINA_LAPS,
    results: [],
    practice: marinaPractice(),
    qualifying: marinaQualifying(),
  };
  return {
    meta: {
      id: 'marinabay-fixture',
      fileName: 'autosave-4.sav',
      fileSizeBytes: 1,
      gameVersion: 'F1M24',
      saveGameVersion: 11,
      parsedAt: '2026-11-15T00:00:00Z',
      seasonId: 2027,
      day: MARINA_DAY,
      playerTeamId: 1,
      tablesPresent: [],
      tablesMissing: [],
      warnings: [],
    },
    player: { teamId: 1, teamName: 'Player Racing', customTeamEnabled: false },
    teams: marinaTeams(),
    drivers: marinaDrivers(),
    staff: [],
    seasons: [{ seasonId: 2027 }],
    races: [race],
    standings: { drivers: [], teams: [] },
    tyres: marinaAllocation(),
    gridPenalties: {
      rows: [],
      reasonPlaces: { 0: 5, 1: 5, 2: 5, 3: 3, 4: 5, 5: 0 },
      /* CarID 0–21 → teams 1..11 in order — player team 1 owns cars 0/1. */
      carTeams: Array.from({ length: 11 }, (_, i) => [
        { carId: i * 2, teamId: i + 1 },
        { carId: i * 2 + 1, teamId: i + 1 },
      ]).flat(),
      carTeamsVerified: true,
    },
    ...emptyPhase2Sections(),
    playerStrategy: marinaGamePlan(),
    availability: [],
  };
}
