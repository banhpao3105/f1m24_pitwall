/**
 * Las Vegas 2027 pre-race fixture (v0.9.4, prompt §0 — owner-verified SQL
 * numbers from save1.sav, sha 84b85e86…, Day 46712, race 208, 50 laps,
 * pre-race). THE save that caught both v0.9.1 bugs:
 *
 *   · The two cars' stocks DIVERGE — car 20 (Xe 1) owns 3 fresh softs
 *     (life 20) while car 21 (Xe 2) has NO fresh soft at all: usable S
 *     #0/#2/#3 are practice-worn (lives 18/16/18) and S #1 is LOCKED
 *     (AvailabilityState 2). The v0.9.1 view showed car 1's fresh #0/#1 on
 *     the trail card — the wrong garage entirely.
 *   · The game prices each SET via EstimatedLapTime: fresh S 97.86, worn
 *     S (0.888) 97.87 (+0.01/lap), worn S (0.778) 98.05 (+0.19/lap),
 *     M fresh 98.24, H fresh 98.68, worn H (0.504) 100.18 (+1.50/lap),
 *     worn M (0.394) 100.34 (+2.10/lap) — the wear→price law's oracle.
 *   · Practice (1 F1 session, 3 drivers/compound): S 97.000 / M 97.420 /
 *     H 99.790 → measured deltas M +0.42 / H +2.79, nothing clamped.
 *   · Field fresh medians → model lives S 22 / M 33 / H 51; garage cap
 *     S 18 / M 31 / H 47; per-car caps car 20 {S20,M31,H47},
 *     car 21 {S18,M31,H47}.
 *   · Team 32 carries 12 Staff_Contracts rows (2 active + 10 historical,
 *     type-0 rows) → resolveCarDrivers cannot run its 2-driver correlation
 *     → BOTH seats stay unverified → the cards brief per CAR ("Xe 1/2").
 *   · Grid: O'Ward P10 (lead), Ricciardo P19 (trail).
 *   · Game plan: S→S→M, pit 13/26 (stint laps 12/13/25).
 *
 * Every number above feeds the v0.9.4 DoD locked in tyre.vegas.test.ts.
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

export const VEGAS_RACE_ID = 208;
export const VEGAS_TRACK_ID = 4;
export const VEGAS_LAPS = 50;
export const VEGAS_DAY = 46712;
export const OWARD_ID = 301;
export const RICCIARDO_ID = 302;

/** Player team 32 (+ 10 AI teams 20..29); the player's seats are 301/302. */
function vegasTeams(): Team[] {
  return [
    ...Array.from({ length: 10 }, (_, i) => ({
      teamId: i + 20,
      teamName: `Team ${i + 20}`,
      isCustomTeam: false,
      formula: 1,
    })),
    { teamId: 32, teamName: 'Player Racing', isCustomTeam: false, formula: 1 },
  ];
}

function vegasDrivers(): Driver[] {
  const drivers: Driver[] = [];
  for (let d = 1; d <= 20; d++) {
    drivers.push({ staffId: d, fullName: `Driver ${d}`, teamId: Math.floor((d - 1) / 2) + 20 });
  }
  // the player's two ACTIVE seats …
  drivers.push({ staffId: OWARD_ID, fullName: "O'Ward", teamId: 32 });
  drivers.push({ staffId: RICCIARDO_ID, fullName: 'Ricciardo', teamId: 32 });
  // … and 10 HISTORICAL Staff_Contracts rows (type 0) — the real save's
  // team-32 shape that keeps resolveCarDrivers from ever correlating seats.
  for (let d = 303; d <= 312; d++) {
    drivers.push({ staffId: d, fullName: `Former Driver ${d}`, teamId: 32 });
  }
  return drivers;
}

/** Staged quali: Q3 P1–P10, Q2 P11–P16, Q1 P17–P22. O'Ward P10, Ricciardo P19. */
function vegasQualifying(): QualifyingResult[] {
  const aiIds = Array.from({ length: 20 }, (_, i) => i + 1);
  const slots: (number | 'lead' | 'trail')[] = [];
  let ai = 0;
  for (let pos = 1; pos <= 22; pos++) {
    if (pos === 10) slots.push('lead');
    else if (pos === 19) slots.push('trail');
    else slots.push(aiIds[ai++]);
  }
  return slots.map((slot, i) => {
    const pos = i + 1;
    const driverId = slot === 'lead' ? OWARD_ID : slot === 'trail' ? RICCIARDO_ID : (slot as number);
    const stage = pos <= 10 ? 3 : pos <= 16 ? 2 : 1;
    return {
      driverId,
      driverName:
        slot === 'lead' ? "O'Ward" : slot === 'trail' ? 'Ricciardo' : `Driver ${driverId}`,
      teamId: driverId === OWARD_ID || driverId === RICCIARDO_ID ? 32 : Math.floor((driverId - 1) / 2) + 20,
      finishingPos: pos,
      stage,
      raceFormula: 1,
    };
  });
}

/**
 * 1 F1 practice session, exactly 3 drivers per compound (≥ MIN_PACE_SAMPLE):
 * session bests S 97.000 / M 97.420 / H 99.790 → deltas M +0.42, H +2.79
 * (gaps SM 0.42, MH 2.37; the SH path hands H = mSM + mMH = 2.79), no clamp
 * fires. The PLAYER drivers carry no practice rows → seats stay unverified.
 */
function vegasPractice(): PracticeResult[] {
  return [
    { driverId: 1, teamId: 20, session: 1, bestLapMs: 97_000, bestLapTyre: 2, raceFormula: 1 },
    { driverId: 2, teamId: 20, session: 1, bestLapMs: 97_050, bestLapTyre: 2, raceFormula: 1 },
    { driverId: 3, teamId: 21, session: 1, bestLapMs: 97_100, bestLapTyre: 2, raceFormula: 1 },
    { driverId: 4, teamId: 21, session: 1, bestLapMs: 97_420, bestLapTyre: 1, raceFormula: 1 },
    { driverId: 5, teamId: 22, session: 1, bestLapMs: 97_470, bestLapTyre: 1, raceFormula: 1 },
    { driverId: 6, teamId: 22, session: 1, bestLapMs: 97_520, bestLapTyre: 1, raceFormula: 1 },
    { driverId: 7, teamId: 23, session: 1, bestLapMs: 99_790, bestLapTyre: 0, raceFormula: 1 },
    { driverId: 8, teamId: 23, session: 1, bestLapMs: 99_840, bestLapTyre: 0, raceFormula: 1 },
    { driverId: 9, teamId: 24, session: 1, bestLapMs: 99_890, bestLapTyre: 0, raceFormula: 1 },
  ];
}

/** tyreSetId helper so the player's sets can use the REAL ids (#0…#12). */
let nextAiSetId = 100;

function vegasAllocation(): TyreAllocation[] {
  const sets: TyreAllocation[] = [];
  const push = (
    carId: number,
    type: number,
    life: number,
    tyreSetId: number,
    opts: {
      state?: number;
      wear?: number;
      laps?: number;
      session?: number;
      lapTime?: number;
    } = {},
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
  const S_FRESH = 97.86;
  const S_USED = 97.87;
  const M_FRESH = 98.24;
  const H_FRESH = 98.68;
  /* v0.9.7 — the game's own wet pace (prompt §0, measured on save1.sav):
     every fresh Inter/Wet set prices its own EstimatedLapTime on a wet
     track — I 106.49 (life 91 fresh per player car / 99 field median),
     W 118.21 (life 118 per car / 128 field median). No slider, no invented
     constant — wetPace() reads these medians. */
  const I_FRESH = 106.49;
  const W_FRESH = 118.21;
  /* CarID 20 — Xe 1: three FRESH softs (life 20) + two locked used softs. */
  push(20, 2, 20, 0, { lapTime: S_FRESH });
  push(20, 2, 20, 1, { lapTime: S_FRESH });
  push(20, 2, 18, 2, { state: 2, wear: 0.7, laps: 11, lapTime: S_USED });
  push(20, 2, 20, 3, { lapTime: S_FRESH });
  push(20, 2, 18, 7, { state: 2, wear: 0.65, laps: 8, lapTime: S_USED });
  push(20, 1, 31, 8, { lapTime: M_FRESH });
  push(20, 0, 47, 11, { lapTime: H_FRESH });
  /* v0.9.7 — Xe 1 wet stock: I #13–#17 fresh 91 ×5, W #18–#19 fresh 118 ×2. */
  for (let k = 0; k < 5; k++) push(20, 3, 91, 13 + k, { lapTime: I_FRESH });
  for (let k = 0; k < 2; k++) push(20, 4, 118, 18 + k, { lapTime: W_FRESH });
  /* CarID 21 — Xe 2: NO fresh soft. #0/#2/#3 usable but worn; #1 LOCKED.
     The game's own set prices: +0.01s/lap (0.888 / 0.887) and +0.19s/lap
     (0.778). M/H: one fresh set each plus the heavily-worn locked ones. */
  push(21, 2, 18, 0, { wear: 0.888, laps: 12, lapTime: S_USED });
  push(21, 2, 16, 1, { state: 2, wear: 0.781, laps: 10 });
  push(21, 2, 16, 2, { wear: 0.778, laps: 9, lapTime: 98.05 });
  push(21, 2, 18, 3, { wear: 0.887, laps: 12, lapTime: S_USED });
  push(21, 1, 31, 8, { lapTime: M_FRESH });
  push(21, 1, 31, 9, { lapTime: M_FRESH });
  push(21, 1, 12, 10, { state: 2, wear: 0.394, laps: 5, lapTime: 100.34 });
  push(21, 0, 47, 11, { lapTime: H_FRESH });
  push(21, 0, 22, 12, { state: 2, wear: 0.504, laps: 7, lapTime: 100.18 });
  /* v0.9.7 — Xe 2 wet stock: same I/W block as Xe 1 (ids #13–#19 free on
     both cars). */
  for (let k = 0; k < 5; k++) push(21, 3, 91, 13 + k, { lapTime: I_FRESH });
  for (let k = 0; k < 2; k++) push(21, 4, 118, 18 + k, { lapTime: W_FRESH });
  /* AI cars 0..19: uniform fresh S 22 / M 34 / H 55 so the field medians
     (getCompoundCaps) come out S 22 / M 33 / H 51 — the model lives — and
     the fresh EstimatedLapTime medians (getAllocationPace) come out
     S 97.86 / M 98.24 / H 98.68 — the fresh reference of the wear law.
     v0.9.7 — AI wet stock I ×5 life 99 / W ×2 life 128: the wet field
     medians (110 I rows / 44 W rows across 22 cars, exactly the §0 counts)
     and the wet ELT medians 106.49 / 118.21. */
  for (let carId = 0; carId <= 19; carId++) {
    push(carId, 2, 22, nextAiSetId++, { lapTime: S_FRESH });
    push(carId, 2, 22, nextAiSetId++, { lapTime: S_FRESH });
    push(carId, 1, 34, nextAiSetId++, { lapTime: M_FRESH });
    push(carId, 0, 55, nextAiSetId++, { lapTime: H_FRESH });
    for (let k = 0; k < 5; k++) push(carId, 3, 99, nextAiSetId++, { lapTime: I_FRESH });
    for (let k = 0; k < 2; k++) push(carId, 4, 128, nextAiSetId++, { lapTime: W_FRESH });
  }
  return sets;
}

/** The in-game strategist plan on the save: S→S→M, pit 13/26. */
function vegasGamePlan(): PlayerStrategySection {
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
            pitWindowStart: 11,
            pitWindowEnd: 15,
            expectedPitLap: 13,
            optimalPitLap: 13,
          },
          {
            stintIndex: 2,
            compound: 'M',
            pitWindowStart: 24,
            pitWindowEnd: 28,
            expectedPitLap: 26,
            optimalPitLap: 26,
          },
        ],
      },
    ],
  };
}

export function buildVegasModel(): SaveModel {
  const race: Race = {
    raceId: VEGAS_RACE_ID,
    seasonId: 2027,
    trackId: VEGAS_TRACK_ID,
    trackName: 'Las Vegas',
    day: VEGAS_DAY,
    state: 1, // pre-race
    isSprint: false,
    laps: VEGAS_LAPS,
    results: [],
    practice: vegasPractice(),
    qualifying: vegasQualifying(),
  };
  return {
    meta: {
      id: 'vegas-fixture',
      fileName: 'save1.sav',
      fileSizeBytes: 1,
      gameVersion: 'F1M24',
      saveGameVersion: 11,
      parsedAt: '2026-11-15T00:00:00Z',
      seasonId: 2027,
      day: VEGAS_DAY,
      playerTeamId: 32,
      tablesPresent: [],
      tablesMissing: [],
      warnings: [],
    },
    player: { teamId: 32, teamName: 'Player Racing', customTeamEnabled: false },
    teams: vegasTeams(),
    drivers: vegasDrivers(),
    staff: [],
    seasons: [{ seasonId: 2027 }],
    races: [race],
    standings: { drivers: [], teams: [] },
    tyres: vegasAllocation(),
    gridPenalties: {
      rows: [],
      reasonPlaces: { 0: 5, 1: 5, 2: 5, 3: 3, 4: 5, 5: 0 },
      /* CarID 0–19 → AI teams 20..29 in pairs; 20/21 → the player's team 32. */
      carTeams: [
        ...Array.from({ length: 10 }, (_, i) => [
          { carId: i * 2, teamId: i + 20 },
          { carId: i * 2 + 1, teamId: i + 20 },
        ]).flat(),
        { carId: 20, teamId: 32 },
        { carId: 21, teamId: 32 },
      ],
      carTeamsVerified: true,
    },
    ...emptyPhase2Sections(),
    playerStrategy: vegasGamePlan(),
    availability: [],
  };
}
