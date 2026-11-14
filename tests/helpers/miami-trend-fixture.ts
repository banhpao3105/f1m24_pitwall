/**
 * v0.6.0 step 1 test fixture — row-level reproduction of the owner's verified
 * MIAMI TREND aggregates (autosave-3.sav, Day 46524, 6/21 races done —
 * prompt v0.6.0 §8). Unlike tests/helpers/miami-fixture.ts (which locks the
 * WINDOW TOTALS and is frozen by the v0.5.4/v0.5.6 engine tests), this
 * fixture distributes the SAME final totals across the six races exactly as
 * the owner reported them, so the dashboard engine's per-race series can be
 * locked against the real save numbers:
 *
 *   cumulative points (AP/SH/SU/BH/JE/MI):
 *     Red Bull  25/47/90/123/166/201   Mercedes 4/39/66/99/116/149
 *     McLaren   33/60/70/71/85/99      Ferrari  1/9/15/25/47/54
 *     CustomTeam 20/20/20/34/39/51     Williams 6/14/26/36/36/36
 *     Alpine   10/11/11/11/11/11
 *   player per-race points [20,0,0,14,5,12], Alpine [10,1,0,0,0,0]
 *   player gains [+29,−5,+10,+18,+14,+15], Alpine [+5,−2,+4,−7,−4,0]
 *
 * Row-level liberties (documented in the frozen fixture too): points values
 * are whatever the game stored per row (sprints/fasta can deviate from the
 * standard ladder), so rows sum to the verified aggregates without pretending
 * to be a real classification. fastestLapMs/totalTimeMs are synthetic
 * (plausible constants) — pace NUMBERS are never locked from this fixture;
 * only the race↔delta alignment with the pace boards is asserted.
 */

import type { Race, SaveModel, StandingRow } from '../../src/domain/types';
import { emptyPhase2Sections } from './model';

interface RowSpec {
  teamId: number;
  teamName: string;
  driverId: number;
  driverName: string;
  start: number;
  finish: number;
  points: number;
  /** Synthetic fastest lap in ms (drives the peak board). */
  fastestLapMs: number;
  /** Synthetic average lap in ms (drives the race board via Time/Laps). */
  avgLapMs: number;
}

const AVG_BASE = 90_000;
const FL_BASE = 88_000;

const row = (spec: Omit<RowSpec, 'fastestLapMs' | 'avgLapMs'>, flOffset: number, avgOffset: number): RowSpec => ({
  ...spec,
  fastestLapMs: FL_BASE + flOffset,
  avgLapMs: AVG_BASE + avgOffset,
});

/** Per-race rows, chronological. Deltas keep peak/race boards well-separated. */
const R1: RowSpec[] = [
  // CustomTeam +20 pts / +29 gained
  row({ teamId: 32, teamName: 'CustomTeam', driverId: 321, driverName: 'Ricciardo', start: 20, finish: 5, points: 12 }, 700, 657),
  row({ teamId: 32, teamName: 'CustomTeam', driverId: 322, driverName: "O'Ward", start: 22, finish: 8, points: 8 }, 900, 800),
  // Alpine +10 / +5
  row({ teamId: 6, teamName: 'Alpine', driverId: 61, driverName: 'Gasly', start: 6, finish: 1, points: 10 }, 620, 470),
  row({ teamId: 6, teamName: 'Alpine', driverId: 62, driverName: 'Ocon', start: 14, finish: 14, points: 0 }, 800, 900),
  // Red Bull 25
  row({ teamId: 1, teamName: 'Red Bull Racing', driverId: 11, driverName: 'Verstappen', start: 1, finish: 2, points: 18 }, 0, 0),
  row({ teamId: 1, teamName: 'Red Bull Racing', driverId: 12, driverName: 'Perez', start: 2, finish: 1, points: 7 }, 100, 120),
  // Mercedes 4
  row({ teamId: 2, teamName: 'Mercedes', driverId: 21, driverName: 'Hamilton', start: 3, finish: 3, points: 4 }, 200, 250),
  row({ teamId: 2, teamName: 'Mercedes', driverId: 22, driverName: 'Russell', start: 5, finish: 5, points: 0 }, 300, 350),
  // McLaren 33
  row({ teamId: 3, teamName: 'McLaren', driverId: 31, driverName: 'Norris', start: 4, finish: 4, points: 25 }, 150, 180),
  row({ teamId: 3, teamName: 'McLaren', driverId: 32, driverName: 'Piastri', start: 7, finish: 6, points: 8 }, 250, 300),
  // Ferrari 1
  row({ teamId: 4, teamName: 'Ferrari', driverId: 41, driverName: 'Leclerc', start: 8, finish: 7, points: 1 }, 400, 420),
  row({ teamId: 4, teamName: 'Ferrari', driverId: 42, driverName: 'Sainz', start: 9, finish: 9, points: 0 }, 450, 480),
  // Williams 6
  row({ teamId: 5, teamName: 'Williams Racing', driverId: 51, driverName: 'Albon', start: 10, finish: 10, points: 6 }, 500, 520),
  row({ teamId: 5, teamName: 'Williams Racing', driverId: 52, driverName: 'Sargeant', start: 11, finish: 11, points: 0 }, 550, 560),
];

const R2: RowSpec[] = [
  // CustomTeam 0 pts / −5
  row({ teamId: 32, teamName: 'CustomTeam', driverId: 321, driverName: 'Ricciardo', start: 3, finish: 8, points: 0 }, 700, 911),
  row({ teamId: 32, teamName: 'CustomTeam', driverId: 322, driverName: "O'Ward", start: 12, finish: 12, points: 0 }, 900, 1000),
  // Alpine 1 / −2
  row({ teamId: 6, teamName: 'Alpine', driverId: 61, driverName: 'Gasly', start: 7, finish: 9, points: 1 }, 620, 470),
  row({ teamId: 6, teamName: 'Alpine', driverId: 62, driverName: 'Ocon', start: 13, finish: 13, points: 0 }, 800, 950),
  // Red Bull 22
  row({ teamId: 1, teamName: 'Red Bull Racing', driverId: 11, driverName: 'Verstappen', start: 1, finish: 1, points: 18 }, 0, 0),
  row({ teamId: 1, teamName: 'Red Bull Racing', driverId: 12, driverName: 'Perez', start: 2, finish: 2, points: 4 }, 100, 120),
  // Mercedes 35
  row({ teamId: 2, teamName: 'Mercedes', driverId: 21, driverName: 'Hamilton', start: 3, finish: 3, points: 25 }, 200, 250),
  row({ teamId: 2, teamName: 'Mercedes', driverId: 22, driverName: 'Russell', start: 4, finish: 4, points: 10 }, 300, 350),
  // McLaren 27
  row({ teamId: 3, teamName: 'McLaren', driverId: 31, driverName: 'Norris', start: 5, finish: 5, points: 15 }, 150, 180),
  row({ teamId: 3, teamName: 'McLaren', driverId: 32, driverName: 'Piastri', start: 6, finish: 6, points: 12 }, 250, 300),
  // Ferrari 8
  row({ teamId: 4, teamName: 'Ferrari', driverId: 41, driverName: 'Leclerc', start: 8, finish: 8, points: 8 }, 400, 420),
  row({ teamId: 4, teamName: 'Ferrari', driverId: 42, driverName: 'Sainz', start: 9, finish: 9, points: 0 }, 450, 480),
  // Williams 8
  row({ teamId: 5, teamName: 'Williams Racing', driverId: 51, driverName: 'Albon', start: 10, finish: 10, points: 8 }, 500, 520),
  row({ teamId: 5, teamName: 'Williams Racing', driverId: 52, driverName: 'Sargeant', start: 11, finish: 11, points: 0 }, 550, 560),
];

const R3: RowSpec[] = [
  // CustomTeam 0 / +10
  row({ teamId: 32, teamName: 'CustomTeam', driverId: 321, driverName: 'Ricciardo', start: 15, finish: 5, points: 0 }, 700, 1113),
  row({ teamId: 32, teamName: 'CustomTeam', driverId: 322, driverName: "O'Ward", start: 16, finish: 16, points: 0 }, 900, 1200),
  // Alpine 0 / +4
  row({ teamId: 6, teamName: 'Alpine', driverId: 61, driverName: 'Gasly', start: 8, finish: 4, points: 0 }, 620, 470),
  row({ teamId: 6, teamName: 'Alpine', driverId: 62, driverName: 'Ocon', start: 17, finish: 17, points: 0 }, 800, 980),
  // Red Bull 43
  row({ teamId: 1, teamName: 'Red Bull Racing', driverId: 11, driverName: 'Verstappen', start: 1, finish: 1, points: 25 }, 0, 0),
  row({ teamId: 1, teamName: 'Red Bull Racing', driverId: 12, driverName: 'Perez', start: 2, finish: 2, points: 18 }, 100, 120),
  // Mercedes 27
  row({ teamId: 2, teamName: 'Mercedes', driverId: 21, driverName: 'Hamilton', start: 3, finish: 3, points: 15 }, 200, 250),
  row({ teamId: 2, teamName: 'Mercedes', driverId: 22, driverName: 'Russell', start: 4, finish: 4, points: 12 }, 300, 350),
  // McLaren 10
  row({ teamId: 3, teamName: 'McLaren', driverId: 31, driverName: 'Norris', start: 5, finish: 5, points: 10 }, 150, 180),
  row({ teamId: 3, teamName: 'McLaren', driverId: 32, driverName: 'Piastri', start: 6, finish: 6, points: 0 }, 250, 300),
  // Ferrari 6
  row({ teamId: 4, teamName: 'Ferrari', driverId: 41, driverName: 'Leclerc', start: 7, finish: 7, points: 6 }, 400, 420),
  row({ teamId: 4, teamName: 'Ferrari', driverId: 42, driverName: 'Sainz', start: 9, finish: 9, points: 0 }, 450, 480),
  // Williams 12
  row({ teamId: 5, teamName: 'Williams Racing', driverId: 51, driverName: 'Albon', start: 10, finish: 10, points: 12 }, 500, 520),
  row({ teamId: 5, teamName: 'Williams Racing', driverId: 52, driverName: 'Sargeant', start: 11, finish: 11, points: 0 }, 550, 560),
];

const R4: RowSpec[] = [
  // CustomTeam 14 / +18
  row({ teamId: 32, teamName: 'CustomTeam', driverId: 321, driverName: 'Ricciardo', start: 14, finish: 1, points: 8 }, 700, 421),
  row({ teamId: 32, teamName: 'CustomTeam', driverId: 322, driverName: "O'Ward", start: 11, finish: 6, points: 6 }, 900, 700),
  // Alpine 0 / −7
  row({ teamId: 6, teamName: 'Alpine', driverId: 61, driverName: 'Gasly', start: 5, finish: 12, points: 0 }, 620, 470),
  row({ teamId: 6, teamName: 'Alpine', driverId: 62, driverName: 'Ocon', start: 18, finish: 18, points: 0 }, 800, 990),
  // Red Bull 33
  row({ teamId: 1, teamName: 'Red Bull Racing', driverId: 11, driverName: 'Verstappen', start: 1, finish: 2, points: 18 }, 0, 0),
  row({ teamId: 1, teamName: 'Red Bull Racing', driverId: 12, driverName: 'Perez', start: 2, finish: 1, points: 15 }, 100, 120),
  // Mercedes 33
  row({ teamId: 2, teamName: 'Mercedes', driverId: 21, driverName: 'Hamilton', start: 3, finish: 3, points: 18 }, 200, 250),
  row({ teamId: 2, teamName: 'Mercedes', driverId: 22, driverName: 'Russell', start: 4, finish: 4, points: 15 }, 300, 350),
  // McLaren 1
  row({ teamId: 3, teamName: 'McLaren', driverId: 31, driverName: 'Norris', start: 6, finish: 6, points: 1 }, 150, 180),
  row({ teamId: 3, teamName: 'McLaren', driverId: 32, driverName: 'Piastri', start: 7, finish: 7, points: 0 }, 250, 300),
  // Ferrari 10
  row({ teamId: 4, teamName: 'Ferrari', driverId: 41, driverName: 'Leclerc', start: 8, finish: 8, points: 10 }, 400, 420),
  row({ teamId: 4, teamName: 'Ferrari', driverId: 42, driverName: 'Sainz', start: 9, finish: 9, points: 0 }, 450, 480),
  // Williams 10
  row({ teamId: 5, teamName: 'Williams Racing', driverId: 51, driverName: 'Albon', start: 10, finish: 10, points: 10 }, 500, 520),
  row({ teamId: 5, teamName: 'Williams Racing', driverId: 52, driverName: 'Sargeant', start: 15, finish: 15, points: 0 }, 550, 560),
];

const R5: RowSpec[] = [
  // CustomTeam 5 / +14
  row({ teamId: 32, teamName: 'CustomTeam', driverId: 321, driverName: 'Ricciardo', start: 12, finish: 4, points: 5 }, 700, 493),
  row({ teamId: 32, teamName: 'CustomTeam', driverId: 322, driverName: "O'Ward", start: 16, finish: 10, points: 0 }, 900, 800),
  // Alpine 0 / −4
  row({ teamId: 6, teamName: 'Alpine', driverId: 61, driverName: 'Gasly', start: 8, finish: 12, points: 0 }, 620, 470),
  row({ teamId: 6, teamName: 'Alpine', driverId: 62, driverName: 'Ocon', start: 17, finish: 17, points: 0 }, 800, 995),
  // Red Bull 43
  row({ teamId: 1, teamName: 'Red Bull Racing', driverId: 11, driverName: 'Verstappen', start: 1, finish: 1, points: 25 }, 0, 0),
  row({ teamId: 1, teamName: 'Red Bull Racing', driverId: 12, driverName: 'Perez', start: 2, finish: 2, points: 18 }, 100, 120),
  // Mercedes 17
  row({ teamId: 2, teamName: 'Mercedes', driverId: 21, driverName: 'Hamilton', start: 3, finish: 3, points: 15 }, 200, 250),
  row({ teamId: 2, teamName: 'Mercedes', driverId: 22, driverName: 'Russell', start: 6, finish: 6, points: 2 }, 300, 350),
  // McLaren 14
  row({ teamId: 3, teamName: 'McLaren', driverId: 31, driverName: 'Norris', start: 4, finish: 4, points: 12 }, 150, 180),
  row({ teamId: 3, teamName: 'McLaren', driverId: 32, driverName: 'Piastri', start: 7, finish: 7, points: 2 }, 250, 300),
  // Ferrari 22
  row({ teamId: 4, teamName: 'Ferrari', driverId: 41, driverName: 'Leclerc', start: 5, finish: 5, points: 15 }, 400, 420),
  row({ teamId: 4, teamName: 'Ferrari', driverId: 42, driverName: 'Sainz', start: 9, finish: 9, points: 7 }, 450, 480),
  // Williams 0
  row({ teamId: 5, teamName: 'Williams Racing', driverId: 51, driverName: 'Albon', start: 10, finish: 13, points: 0 }, 500, 520),
  row({ teamId: 5, teamName: 'Williams Racing', driverId: 52, driverName: 'Sargeant', start: 14, finish: 14, points: 0 }, 550, 560),
];

const R6: RowSpec[] = [
  // CustomTeam 12 / +15
  row({ teamId: 32, teamName: 'CustomTeam', driverId: 321, driverName: 'Ricciardo', start: 15, finish: 6, points: 4 }, 700, 443),
  row({ teamId: 32, teamName: 'CustomTeam', driverId: 322, driverName: "O'Ward", start: 18, finish: 12, points: 8 }, 900, 760),
  // Alpine 0 / 0
  row({ teamId: 6, teamName: 'Alpine', driverId: 61, driverName: 'Gasly', start: 9, finish: 9, points: 0 }, 620, 470),
  row({ teamId: 6, teamName: 'Alpine', driverId: 62, driverName: 'Ocon', start: 16, finish: 16, points: 0 }, 800, 1000),
  // Red Bull 35
  row({ teamId: 1, teamName: 'Red Bull Racing', driverId: 11, driverName: 'Verstappen', start: 1, finish: 1, points: 18 }, 0, 0),
  row({ teamId: 1, teamName: 'Red Bull Racing', driverId: 12, driverName: 'Perez', start: 2, finish: 2, points: 17 }, 100, 120),
  // Mercedes 33
  row({ teamId: 2, teamName: 'Mercedes', driverId: 21, driverName: 'Hamilton', start: 3, finish: 3, points: 15 }, 200, 250),
  row({ teamId: 2, teamName: 'Mercedes', driverId: 22, driverName: 'Russell', start: 4, finish: 4, points: 18 }, 300, 350),
  // McLaren 14
  row({ teamId: 3, teamName: 'McLaren', driverId: 31, driverName: 'Norris', start: 5, finish: 5, points: 12 }, 150, 180),
  row({ teamId: 3, teamName: 'McLaren', driverId: 32, driverName: 'Piastri', start: 7, finish: 7, points: 2 }, 250, 300),
  // Ferrari 7
  row({ teamId: 4, teamName: 'Ferrari', driverId: 41, driverName: 'Leclerc', start: 8, finish: 8, points: 6 }, 400, 420),
  row({ teamId: 4, teamName: 'Ferrari', driverId: 42, driverName: 'Sainz', start: 10, finish: 10, points: 1 }, 450, 480),
  // Williams 0
  row({ teamId: 5, teamName: 'Williams Racing', driverId: 51, driverName: 'Albon', start: 11, finish: 11, points: 0 }, 500, 520),
  row({ teamId: 5, teamName: 'Williams Racing', driverId: 52, driverName: 'Sargeant', start: 13, finish: 13, points: 0 }, 550, 560),
];

const RACE_SPECS: { raceId: number; trackName: string; day: number; rows: RowSpec[] }[] = [
  { raceId: 101, trackName: 'Albert Park', day: 10, rows: R1 },
  { raceId: 102, trackName: 'Shanghai', day: 20, rows: R2 },
  { raceId: 103, trackName: 'Suzuka', day: 30, rows: R3 },
  { raceId: 104, trackName: 'Bahrain', day: 40, rows: R4 },
  { raceId: 105, trackName: 'Jeddah', day: 50, rows: R5 },
  { raceId: 106, trackName: 'Miami', day: 60, rows: R6 },
];

export const TREND_SEASON_ID = 2027;
export const TREND_PLAYER_TEAM_ID = 32;

const LAPS = 50;

function buildRaces(): Race[] {
  return RACE_SPECS.map((spec) => ({
    raceId: spec.raceId,
    seasonId: TREND_SEASON_ID,
    trackId: spec.raceId,
    trackName: spec.trackName,
    day: spec.day,
    state: 2,
    isSprint: false,
    laps: LAPS,
    results: spec.rows.map((r) => ({
      driverId: r.driverId,
      driverName: r.driverName,
      teamId: r.teamId,
      teamName: r.teamName,
      finishingPos: r.finish,
      startingPos: r.start,
      points: r.points,
      dnf: false,
      laps: LAPS,
      fastestLapMs: r.fastestLapMs,
      totalTimeMs: LAPS * r.avgLapMs,
    })),
  }));
}

const STANDINGS: StandingRow[] = [
  { position: 1, id: 1, name: 'Red Bull Racing', points: 201 },
  { position: 2, id: 2, name: 'Mercedes', points: 149 },
  { position: 3, id: 3, name: 'McLaren', points: 99 },
  { position: 4, id: 4, name: 'Ferrari', points: 54 },
  { position: 5, id: 32, name: 'CustomTeam', points: 51 },
  { position: 6, id: 5, name: 'Williams Racing', points: 36 },
  { position: 7, id: 6, name: 'Alpine', points: 11 },
];

const TEAMS = STANDINGS.map((s) => ({
  teamId: s.id,
  teamName: s.name,
  isCustomTeam: s.id === TREND_PLAYER_TEAM_ID,
  formula: 0,
}));

/** SaveModel reproducing the owner's verified per-race trend (§8). */
export function buildMiamiTrendModel(): SaveModel {
  return {
    meta: {
      id: 'fixture-miami-trend', fileName: 'autosave-3.sav', fileSizeBytes: 1,
      gameVersion: 'F1M24', saveGameVersion: 3, parsedAt: '2026-01-01T00:00:00Z',
      seasonId: TREND_SEASON_ID, day: 70, playerTeamId: TREND_PLAYER_TEAM_ID,
      tablesPresent: [], tablesMissing: [], warnings: [],
    },
    player: { teamId: TREND_PLAYER_TEAM_ID, teamName: 'CustomTeam', customTeamEnabled: true },
    teams: TEAMS,
    drivers: [],
    staff: [],
    seasons: [{ seasonId: TREND_SEASON_ID }],
    races: buildRaces(),
    standings: { drivers: [], teams: STANDINGS },
    tyres: [],
    ...emptyPhase2Sections(),
    availability: [],
  };
}
