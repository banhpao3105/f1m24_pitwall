/**
 * Interlagos 2027 post-quali fixture (v0.9.3, prompt §4 — owner-verified
 * numbers from savegames-marina-post/save2.sav, Day 46698, race 207,
 * 71 laps, post-quali) — the save that caught the tier-mixing bug:
 *
 *   · Practice (1 F1 session, 3 drivers per compound):
 *       S best 90.000 · M best 90.970 (raw +0.97) · H best 90.384
 *       (raw +0.384 — FASTER than M → the v0.6.1 monotonic clamp fires:
 *       deltas.H = M + 0.15 = 1.12, clamped.H = true).
 *     v0.8.1/v0.9.2 ranked M on the practice +0.97 while H fell to the
 *     allocation estimate +0.71 — a mixed-tier ranking that made SSH win
 *     by exactly the practice/allocation gap. v0.9.3: a clamped value is
 *     not a measurement, so BOTH sides rank on the model constants
 *     M +0.55 / H +1.05.
 *   · Allocation pace (EstimatedLapTime, fresh sets): S 70.30 / M 70.58 /
 *     H 71.01 → alloc deltas M +0.28 / H +0.71 — EVIDENCE ONLY (the
 *     consistency pillar fails: |0.28 − 0.97| > 0.2, the §4 reason).
 *   · Field fresh-set medians → lives S 30 / M 45 / H 64; the garage cap →
 *     S 27 / M 42 / H 58 (player fresh stock: S ×4/×3 life 27, M ×1 life
 *     42, H ×2 life 58; exactly one AVAILABLE M set per car).
 *   · Game plan: S→S→H, pit 19/33 (stints 19/14/38).
 *
 * Player seats: O'Ward (101) P14 — the lead car; Ricciardo (102) P18 — the
 * trail. Nguyen ran S→M→S on the lead in-game (P14→P10): the same 93.2s
 * multiset {S20,S20,M31}, order-equivalent to the engine's lead.
 *
 * Every number above feeds the v0.9.3 DoD locked in tyre.interlagos.test.ts.
 */

import type {
  SaveModel,
  Race,
  PracticeResult,
  QualifyingResult,
  Team,
  Driver,
  TyreAllocation,
  PitStop,
  RaceResult,
  PlayerStrategySection,
} from '@/domain/types';
import { emptyPhase2Sections } from './model';

export const INTERLAGOS_RACE_ID = 207;
export const INTERLAGOS_TRACK_ID = 20;
export const INTERLAGOS_LAPS = 71;
export const INTERLAGOS_DAY = 46698;

/** Player team + 10 AI teams; drivers 101/102 are the player's seats. */
function interlagosTeams(): Team[] {
  return Array.from({ length: 11 }, (_, i) => ({
    teamId: i + 1,
    teamName: i === 0 ? 'Player Racing' : `Team ${i + 1}`,
    isCustomTeam: false,
    formula: 1,
  }));
}

function interlagosDrivers(): Driver[] {
  const drivers: Driver[] = [
    { staffId: 101, fullName: 'O\u2019Ward', teamId: 1 },
    { staffId: 102, fullName: 'Ricciardo', teamId: 1 },
  ];
  for (let d = 1; d <= 20; d++) {
    drivers.push({ staffId: d, fullName: `Driver ${d}`, teamId: Math.floor((d - 1) / 2) + 2 });
  }
  return drivers;
}

/** Staged quali: player seats P14 (lead car) and P18 (trail car). */
function interlagosQualifying(): QualifyingResult[] {
  const aiIds = Array.from({ length: 20 }, (_, i) => i + 1);
  const slots: (number | 101 | 102)[] = [];
  let ai = 0;
  for (let pos = 1; pos <= 22; pos++) {
    if (pos === 14) slots.push(101);
    else if (pos === 18) slots.push(102);
    else slots.push(aiIds[ai++]);
  }
  return slots.map((driverId, i) => {
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
 * 1 F1 practice session, 3 drivers per compound (≥ MIN_PACE_SAMPLE):
 * S 90.000 / M 90.970 / H 90.384 → M raw +0.97 usable, H raw +0.384
 * clamped by the monotonic rule. The PLAYER drivers carry no practice rows
 * (seats unverified — the documented fail-safe).
 */
function interlagosPractice(): PracticeResult[] {
  return [
    { driverId: 1, teamId: 2, session: 1, bestLapMs: 90_000, bestLapTyre: 2, raceFormula: 1 },
    { driverId: 2, teamId: 2, session: 1, bestLapMs: 90_120, bestLapTyre: 2, raceFormula: 1 },
    { driverId: 3, teamId: 3, session: 1, bestLapMs: 90_240, bestLapTyre: 2, raceFormula: 1 },
    { driverId: 4, teamId: 3, session: 1, bestLapMs: 90_970, bestLapTyre: 1, raceFormula: 1 },
    { driverId: 5, teamId: 4, session: 1, bestLapMs: 91_090, bestLapTyre: 1, raceFormula: 1 },
    { driverId: 6, teamId: 4, session: 1, bestLapMs: 91_210, bestLapTyre: 1, raceFormula: 1 },
    { driverId: 7, teamId: 5, session: 1, bestLapMs: 90_384, bestLapTyre: 0, raceFormula: 1 },
    { driverId: 8, teamId: 5, session: 1, bestLapMs: 90_504, bestLapTyre: 0, raceFormula: 1 },
    { driverId: 9, teamId: 6, session: 1, bestLapMs: 90_624, bestLapTyre: 0, raceFormula: 1 },
  ];
}

/**
 * The owner-verified allocation. Player cars = CarID 0/1 (team 1):
 * S fresh ×4/×3 (life 27 — the rows list #0 before #2 so the greedy's
 * stable sort hands the two S20 stints sets #0 and #2, exactly the §4
 * assignment), M fresh ×1 (#9, life 42) + M locked state 2 (#8, life 18),
 * H fresh ×2 (#4/#5, life 58). AI cars carry uniform fresh lives so the
 * field medians (getCompoundCaps) come out S 30 / M 45 / H 64 — the model
 * lives — while the garage cap is min(life, best own set) = 27/42/58.
 * EstimatedLapTime on every fresh set: S 70.30 / M 70.58 / H 71.01.
 */
export function interlagosAllocation(): TyreAllocation[] {
  const sets: TyreAllocation[] = [];
  const push = (
    carId: number,
    type: number,
    life: number,
    tyreSetId: number,
    opts: { state?: number; wear?: number; laps?: number; session?: number; lapTime?: number } = {},
  ) => {
    sets.push({
      carId,
      tyreSetId,
      weekendTyreType: type,
      frontLeftWear: opts.wear ?? 1,
      availabilityState: opts.state ?? 0,
      estimatedLapLifeRemaining: life,
      estimatedLapTimeS: opts.lapTime,
      ...(opts.laps != null
        ? { lapsCompleted: opts.laps, sessionLastUsedIn: opts.session ?? 1 }
        : {}),
    });
  };
  const S_LAP = 70.3;
  const M_LAP = 70.58;
  const H_LAP = 71.01;
  for (const carId of [0, 1]) {
    // S fresh: ALL fresh softs are life 27 on the real save (save2.sav audit,
    // Nguyen's decision (a) 2026-11-16) and car 1's set ids are #0/#2/#3/#4 —
    // the ids the §4 assignment names (S20 = #0, S20 = #2). The old fixture's
    // 26-life sets were fixture-only; with real ids + real lives the greedy
    // still hands the two S20 stints #0/#2 and every plan prices wear 0.
    const sSets = carId === 0 ? [[0, 27], [2, 27], [3, 27], [4, 27]] : [[0, 27], [1, 27], [2, 27]];
    for (const [id, life] of sSets) push(carId, 2, life, id, { lapTime: S_LAP });
    // H — fresh ×2 (life 58). Ids #6/#7: the real save's S stock occupies
    // #0–#4, so the H pairs cannot sit on #4/#5 like the pre-audit fixture
    // had it (a duplicate id within a car would break the wear lookup).
    push(carId, 0, 58, 6, { lapTime: H_LAP });
    push(carId, 0, 58, 7, { lapTime: H_LAP });
    // M — locked state 2 (#8) + exactly 1 fresh usable (#9, life 42)
    push(carId, 1, 18, 8, { state: 2, wear: 0.62, laps: 22, session: 2 });
    push(carId, 1, 42, 9, { lapTime: M_LAP });
  }
  // AI cars 2..21: uniform fresh S 30 / M 45 / H 64 → field medians 30/45/64
  for (let carId = 2; carId <= 21; carId++) {
    push(carId, 2, 30, carId * 100 + 1, { lapTime: S_LAP });
    push(carId, 1, 45, carId * 100 + 2, { lapTime: M_LAP });
    push(carId, 0, 64, carId * 100 + 3, { lapTime: H_LAP });
  }
  return sets;
}

/** The in-game strategist plan on the save: S→S→H, pit 19/33. */
function interlagosGamePlan(): PlayerStrategySection {
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
            compound: 'S',
            pitWindowStart: 17,
            pitWindowEnd: 21,
            expectedPitLap: 19,
            optimalPitLap: 19,
          },
          {
            stintIndex: 2,
            compound: 'H',
            pitWindowStart: 31,
            pitWindowEnd: 35,
            expectedPitLap: 33,
            optimalPitLap: 33,
          },
        ],
      },
    ],
  };
}

/**
 * 3 completed Interlagos races with exactly 2.0 stops/driver (40 stops /
 * 20 classified): the stint factor reads 3 track samples (the §4 confidence
 * quote has NO "samples" reason) and the field reference is 2.0 — the 2-pit
 * lead plan does not trip the fieldStops pillar. NO practice rows (the
 * pace deltas must come only from the active weekend's session).
 */
function interlagosHistory(): Race[] {
  const races: Race[] = [];
  for (const [raceId, day] of [
    [203, 45_500],
    [205, 45_900],
    [206, 46_298],
  ] as const) {
    const results: RaceResult[] = Array.from({ length: 20 }, (_, i) => ({
      driverId: i + 1,
      driverName: `Driver ${i + 1}`,
      teamId: Math.floor(i / 2) + 2,
      teamName: `Team ${Math.floor(i / 2) + 2}`,
      finishingPos: i + 1,
      points: 0,
      dnf: false,
    }));
    const pitStops: PitStop[] = Array.from({ length: 40 }, (_, i) => ({
      driverId: (i % 20) + 1,
      teamId: Math.floor((i % 20) / 2) + 2,
      lap: 15 + Math.floor(i / 20) * 20,
      durationMs: 24_000,
    }));
    races.push({
      raceId,
      seasonId: 2027,
      trackId: INTERLAGOS_TRACK_ID,
      trackName: 'Interlagos',
      day,
      state: 2,
      isSprint: false,
      laps: INTERLAGOS_LAPS,
      results,
      pitStops,
    });
  }
  return races;
}

export function buildInterlagosModel(): SaveModel {
  const race: Race = {
    raceId: INTERLAGOS_RACE_ID,
    seasonId: 2027,
    trackId: INTERLAGOS_TRACK_ID,
    trackName: 'Interlagos',
    day: INTERLAGOS_DAY,
    state: 1, // post-quali, pre-race
    isSprint: false,
    laps: INTERLAGOS_LAPS,
    results: [],
    practice: interlagosPractice(),
    qualifying: interlagosQualifying(),
  };
  return {
    meta: {
      id: 'interlagos-fixture',
      fileName: 'save2.sav',
      fileSizeBytes: 1,
      gameVersion: 'F1M24',
      saveGameVersion: 11,
      parsedAt: '2026-11-15T00:00:00Z',
      seasonId: 2027,
      day: INTERLAGOS_DAY,
      playerTeamId: 1,
      tablesPresent: [],
      tablesMissing: [],
      warnings: [],
    },
    player: { teamId: 1, teamName: 'Player Racing', customTeamEnabled: false },
    teams: interlagosTeams(),
    drivers: interlagosDrivers(),
    staff: [],
    seasons: [{ seasonId: 2027 }],
    races: [race, ...interlagosHistory()],
    standings: { drivers: [], teams: [] },
    tyres: interlagosAllocation(),
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
    playerStrategy: interlagosGamePlan(),
    availability: [],
  };
}
