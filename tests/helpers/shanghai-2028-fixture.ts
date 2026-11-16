/**
 * Shanghai 2028 pre-race fixture (v0.9.7, prompt §1.5 — owner-verified SQL
 * numbers from autosave-5.sav, Day 46831, race 212, 56 laps, pre-race) —
 * the save of the pit-gap question (v0.9.6) and the free-form simulator's
 * dry-side anchor:
 *
 *   · Practice (1 F1 session, 3 drivers per compound, fastest per compound
 *     drives the session gap): S 90.000 · M 91.210 · H 91.250 → measured
 *     deltas M +1.21 / H +1.25, nothing clamped (H > M holds).
 *   · Allocation pace (EstimatedLapTime, fresh sets, whole field):
 *     S 94.24 / M 94.63 / H 95.31 / I 101.57 / W 112.34. The wet deltas
 *     come out I +7.33 / W +18.10 — the §0 measured numbers. The real
 *     save's raw ELTs carry more decimals than this fixture's 2dp storage
 *     (S 94.24 + 18.10 = 112.34); the LOCKED quantity is the delta, not
 *     the raw W elt.
 *   · Field fresh-set medians → model lives S 27 / M 41 / H 60 and wet
 *     lives I 84 / W 109 (player wet stock 82/107 sits BELOW the field
 *     median — priced lives for I/W stay the field medians, per spec).
 *   · Player garage (both cars identical, every set AvailabilityState 0):
 *     S #1 27u (ELT 94.24 — a used set priced exactly at the fresh median,
 *     so its wear-pace part is 0) / #3 28f / #5 28f · M #7 37u (ELT 94.63,
 *     same law) / #9 42f · H #10 59f / #11 59f · I #12–#16 82f ×5 ·
 *     W #17–#19 107f ×3. Per-car cap S 27 / M 41 / H 59.
 *   · Game plan: M→H, pit 27 (stints 27/29) → 104.0s on car 1's stock.
 *   · Track columns: pit 20 / green 18 / SC 13 / chance 1.00 → SC pit cost
 *     20.7 × 0.65 = 13.455, VSC = 20.7 × 0.825 = 17.0775.
 *   · Player seats: O'Ward (101) P10 — the lead car; Ricciardo (102) P19 —
 *     the trail. Seats unverified (no player practice rows) → "Xe 1/Xe 2".
 *
 * Every number above feeds the v0.9.7 DoD locked in tyre.sim.test.ts and
 * tyre.scvsc-multi.test.ts.
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

export const SHANGHAI_RACE_ID = 212;
export const SHANGHAI_TRACK_ID = 8;
export const SHANGHAI_LAPS = 56;
export const SHANGHAI_DAY = 46831;

/** Player team + 10 AI teams; drivers 101/102 are the player's seats. */
function shanghaiTeams(): Team[] {
  return Array.from({ length: 11 }, (_, i) => ({
    teamId: i + 1,
    teamName: i === 0 ? 'Player Racing' : `Team ${i + 1}`,
    isCustomTeam: false,
    formula: 1,
  }));
}

function shanghaiDrivers(): Driver[] {
  const drivers: Driver[] = [
    { staffId: 101, fullName: 'O\u2019Ward', teamId: 1 },
    { staffId: 102, fullName: 'Ricciardo', teamId: 1 },
  ];
  for (let d = 1; d <= 20; d++) {
    drivers.push({ staffId: d, fullName: `Driver ${d}`, teamId: Math.floor((d - 1) / 2) + 2 });
  }
  return drivers;
}

/** Staged quali: player seats P10 (lead car) and P19 (trail car). */
function shanghaiQualifying(): QualifyingResult[] {
  const aiIds = Array.from({ length: 20 }, (_, i) => i + 1);
  const slots: (number | 101 | 102)[] = [];
  let ai = 0;
  for (let pos = 1; pos <= 22; pos++) {
    if (pos === 10) slots.push(101);
    else if (pos === 19) slots.push(102);
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
 * 1 F1 practice session, 3 drivers per compound (≥ MIN_PACE_SAMPLE). The
 * session gap reads the FASTEST per compound: S 90.000 / M 91.210 /
 * H 91.250 → M +1.21 (gaps SM) and H = SM + MH = 1.21 + 0.04 = 1.25. The
 * PLAYER drivers carry no practice rows (seats unverified — the documented
 * fail-safe).
 */
function shanghaiPractice(): PracticeResult[] {
  return [
    { driverId: 1, teamId: 2, session: 1, bestLapMs: 90_000, bestLapTyre: 2, raceFormula: 1 },
    { driverId: 2, teamId: 2, session: 1, bestLapMs: 90_060, bestLapTyre: 2, raceFormula: 1 },
    { driverId: 3, teamId: 3, session: 1, bestLapMs: 90_120, bestLapTyre: 2, raceFormula: 1 },
    { driverId: 4, teamId: 3, session: 1, bestLapMs: 91_210, bestLapTyre: 1, raceFormula: 1 },
    { driverId: 5, teamId: 4, session: 1, bestLapMs: 91_270, bestLapTyre: 1, raceFormula: 1 },
    { driverId: 6, teamId: 4, session: 1, bestLapMs: 91_330, bestLapTyre: 1, raceFormula: 1 },
    { driverId: 7, teamId: 5, session: 1, bestLapMs: 91_250, bestLapTyre: 0, raceFormula: 1 },
    { driverId: 8, teamId: 5, session: 1, bestLapMs: 91_310, bestLapTyre: 0, raceFormula: 1 },
    { driverId: 9, teamId: 6, session: 1, bestLapMs: 91_370, bestLapTyre: 0, raceFormula: 1 },
  ];
}

/**
 * The owner-verified allocation (prompt §1.5). Player cars = CarID 0/1
 * (team 1) — identical garages, EVERY set AvailabilityState 0 (the used
 * #1/#7 stay race-available with lower lives than the fresh stock):
 *   S #1 27u (ELT 94.24 = the fresh median → wear-pace part 0) / #3 28f /
 *   #5 28f · M #7 37u (ELT 94.63, same law) / #9 42f · H #10/#11 59f ·
 *   I #12–#16 82f ×5 · W #17–#19 107f ×3.
 * AI cars 2..21: S ×2 27 / M ×2 41 / H ×1 60 / I ×5 84 / W ×3 109 — the
 * field medians come out lives S 27 / M 41 / H 60, wet lives I 84 / W 109
 * (matching autosave-5.sav's n=110 I sets / n=66 W sets across 22 cars),
 * fresh ELT medians S 94.24 / M 94.63 / H 95.31 / I 101.57 / W 112.34.
 */
export function shanghaiAllocation(): TyreAllocation[] {
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
  const S_LAP = 94.24;
  const M_LAP = 94.63;
  const H_LAP = 95.31;
  const I_LAP = 101.57;
  // 112.34 = 94.24 + 18.10: the LOCKED wet W delta (the real save's raw
  // ELTs carry more decimals than this fixture's 2dp storage).
  const W_LAP = 112.34;
  for (const carId of [0, 1]) {
    // S — #1 USED (life 27, ELT still the fresh median) + #3/#5 fresh 28
    push(carId, 2, 27, 1, { wear: 0.9, laps: 3, session: 1, lapTime: S_LAP });
    push(carId, 2, 28, 3, { lapTime: S_LAP });
    push(carId, 2, 28, 5, { lapTime: S_LAP });
    // M — #7 USED (life 37, ELT = fresh median) + #9 fresh 42
    push(carId, 1, 37, 7, { wear: 0.92, laps: 4, session: 1, lapTime: M_LAP });
    push(carId, 1, 42, 9, { lapTime: M_LAP });
    // H — fresh ×2 (life 59)
    push(carId, 0, 59, 10, { lapTime: H_LAP });
    push(carId, 0, 59, 11, { lapTime: H_LAP });
    // I — fresh ×5 (life 82, below the field median 84)
    for (let k = 0; k < 5; k++) push(carId, 3, 82, 12 + k, { lapTime: I_LAP });
    // W — fresh ×3 (life 107, below the field median 109)
    for (let k = 0; k < 3; k++) push(carId, 4, 107, 17 + k, { lapTime: W_LAP });
  }
  // AI cars 2..21: S ×2 27 / M ×2 41 / H ×1 60 / I ×5 84 / W ×3 109
  for (let carId = 2; carId <= 21; carId++) {
    push(carId, 2, 27, carId * 100 + 1, { lapTime: S_LAP });
    push(carId, 2, 27, carId * 100 + 2, { lapTime: S_LAP });
    push(carId, 1, 41, carId * 100 + 3, { lapTime: M_LAP });
    push(carId, 1, 41, carId * 100 + 4, { lapTime: M_LAP });
    push(carId, 0, 60, carId * 100 + 5, { lapTime: H_LAP });
    for (let k = 0; k < 5; k++) push(carId, 3, 84, carId * 100 + 6 + k, { lapTime: I_LAP });
    for (let k = 0; k < 3; k++) push(carId, 4, 109, carId * 100 + 11 + k, { lapTime: W_LAP });
  }
  return sets;
}

/** The in-game strategist plan on the save: M→H, pit 27 (stints 27/29). */
function shanghaiGamePlan(): PlayerStrategySection {
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
            compound: 'M',
            pitWindowStart: null,
            pitWindowEnd: null,
            expectedPitLap: null,
            optimalPitLap: null,
          },
          {
            stintIndex: 1,
            compound: 'H',
            pitWindowStart: 25,
            pitWindowEnd: 29,
            expectedPitLap: 27,
            optimalPitLap: 27,
          },
        ],
      },
    ],
  };
}

export function buildShanghaiModel(): SaveModel {
  const race: Race = {
    raceId: SHANGHAI_RACE_ID,
    seasonId: 2028,
    trackId: SHANGHAI_TRACK_ID,
    trackName: 'Shanghai',
    day: SHANGHAI_DAY,
    state: 1, // pre-race
    isSprint: false,
    laps: SHANGHAI_LAPS,
    results: [],
    practice: shanghaiPractice(),
    qualifying: shanghaiQualifying(),
    /* Races_Tracks columns of the real save: SC pit cost = 20.7 × 13/20,
       VSC = the green↔SC midpoint, chance 1.00. */
    trackPitLaneTimeLossS: 20,
    trackGreenFlagTimeLossS: 18,
    trackSafetyCarTimeLossS: 13,
    trackSafetyCarChance: 1,
  };
  return {
    meta: {
      id: 'shanghai-2028-fixture',
      fileName: 'autosave-5.sav',
      fileSizeBytes: 1,
      gameVersion: 'F1M24',
      saveGameVersion: 11,
      parsedAt: '2026-11-16T00:00:00Z',
      seasonId: 2028,
      day: SHANGHAI_DAY,
      playerTeamId: 1,
      tablesPresent: [],
      tablesMissing: [],
      warnings: [],
    },
    player: { teamId: 1, teamName: 'Player Racing', customTeamEnabled: false },
    teams: shanghaiTeams(),
    drivers: shanghaiDrivers(),
    staff: [],
    seasons: [{ seasonId: 2028 }],
    races: [race],
    standings: { drivers: [], teams: [] },
    tyres: shanghaiAllocation(),
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
    playerStrategy: shanghaiGamePlan(),
    availability: [],
  };
}
