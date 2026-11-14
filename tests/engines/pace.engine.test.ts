/**
 * Pace engine unit tests — Phase 1 (docs/05 §9.2: Pace bắt buộc).
 * Hand-computed medians over a synthetic season.
 */

import { describe, it, expect } from 'vitest';
import { buildPaceBoard, buildRacePaceBoard } from '@/engines/pace.engine';
import type { SaveModel, Race, RaceResult, StandingRow } from '@/domain/types';
import { emptyPhase2Sections } from '../helpers/model';

function makeModel(races: Race[], teamStandings: StandingRow[]): SaveModel {
  return {
    meta: {
      id: 'test', fileName: 'test.sav', fileSizeBytes: 1,
      gameVersion: 'F1M24', saveGameVersion: 3, parsedAt: '2026-01-01T00:00:00Z',
      seasonId: 2023, day: 100, playerTeamId: 1,
      tablesPresent: [], tablesMissing: [], warnings: [],
    },
    player: { teamId: 1, teamName: 'Player Racing', customTeamEnabled: false },
    teams: [
      { teamId: 1, teamName: 'Player Racing', isCustomTeam: false, formula: 0 },
      { teamId: 2, teamName: 'Rival Racing', isCustomTeam: false, formula: 0 },
      { teamId: 3, teamName: 'Far Racing', isCustomTeam: false, formula: 0 },
    ],
    drivers: [],
    staff: [],
    seasons: [],
    races,
    standings: { drivers: [], teams: teamStandings },
    tyres: [],
    ...emptyPhase2Sections(),
    availability: [],
  };
}

/** 3 teams, 2 drivers each. Team fastest laps per race (ms):
 *  race leader session-best = 80000.
 *  Team 1 (player): +200ms each race (80.2s)
 *  Team 2 (rival):  +350ms each race (80.35s)
 *  Team 3 (far):    +900ms each race (80.9s)
 */
function raceWithFastestLaps(raceId: number, day: number): Race {
  const laps = { 1: 80200, 2: 80350, 3: 80900 } as Record<number, number>;
  const results = [1, 2, 3].flatMap((teamId) =>
    [1, 2].map((n) => ({
      driverId: teamId * 10 + n,
      driverName: `D${teamId}${n}`,
      teamId,
      teamName: `Team ${teamId}`,
      finishingPos: teamId * 2 + n,
      points: 0,
      dnf: false,
      fastestLapMs: laps[teamId],
    })),
  );
  return {
    raceId, seasonId: 2023, trackId: raceId, trackName: `T${raceId}`,
    day, state: 2, isSprint: false, results,
  };
}

describe('buildPaceBoard', () => {
  const standings: StandingRow[] = [
    { position: 1, id: 2, name: 'Rival Racing', points: 100 },
    { position: 2, id: 1, name: 'Player Racing', points: 80 },
    { position: 3, id: 3, name: 'Far Racing', points: 60 },
  ];
  const races = [1, 2, 3, 4, 5].map((i) => raceWithFastestLaps(i, i * 10));
  const model = makeModel(races, standings);

  it('ranks teams by median pace and marks player + rivals', () => {
    const result = buildPaceBoard(model);
    const board = result.data;
    expect(board.rows[0].teamId).toBe(1); // +0.2s — fastest
    expect(board.rows[1].teamId).toBe(2); // +0.35s
    expect(board.rows[2].teamId).toBe(3); // +0.9s
    expect(board.rows[0].isPlayer).toBe(true);

    // Rivals = standings neighbours above AND below (teams 2 & 3); team 2 is
    // also within pace tolerance. rivalRef = nearest by pace = team 2.
    expect(board.rivals.map((r) => r.teamId).sort()).toEqual([2, 3]);

    // 0.4.1: rivalRef is the single team playerVsRivalS is measured against
    // (nearest pace), NOT rivals[0] (the fastest rival).
    expect(board.rivalRef?.teamId).toBe(2);
    expect(board.rivalRef?.teamName).toBe('Rival Racing');
    // the recommendation quotes the same team as rivalRef
    expect(result.recommendations[0].title).toContain('Rival Racing');

    // player − rival per race = 80200 − 80350 = −150ms → −0.15s (player faster)
    expect(board.playerVsRivalS).toBeCloseTo(-0.15, 6);
    expect(result.recommendations[0].title).toContain('nhanh hơn');
    expect(result.recommendations[0].confidence).toBe('HIGH'); // 5 races ≥ 4
  });

  it('degrades to LOW confidence with too few races', () => {
    const result = buildPaceBoard(makeModel([races[0]], standings));
    expect(result.data.racesConsidered).toBe(1);
    expect(result.confidence).toBe('LOW');
    expect(result.assumptions.length).toBeGreaterThan(0);
  });

  it('warns with no completed races and still returns a recommendation', () => {
    const empty = makeModel([], standings);
    const result = buildPaceBoard(empty);
    expect(result.warnings).toContain('NO_COMPLETED_RACES');
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].confidence).toBe('LOW');
  });

  it('is deterministic', () => {
    const a = buildPaceBoard(model);
    const b = buildPaceBoard(model);
    expect(JSON.stringify(a.data.rows)).toBe(JSON.stringify(b.data.rows));
  });

  it('0.4.1 regression: rivalRef follows pace proximity, not list order', () => {
    // Player +1.0s; team 2 far ahead (+0.1s); team 3 just behind (+1.05s).
    // rivals[0] would be team 2 (fastest); rivalRef must be team 3.
    const laps = { 1: 81000, 2: 80100, 3: 81050 } as Record<number, number>;
    const results = [1, 2, 3].flatMap((teamId) =>
      [1, 2].map((n) => ({
        driverId: teamId * 10 + n,
        driverName: `D${teamId}${n}`,
        teamId,
        teamName: `Team ${teamId}`,
        finishingPos: teamId * 2 + n,
        points: 0,
        dnf: false,
        fastestLapMs: laps[teamId],
      })),
    );
    const race: Race = {
      raceId: 9, seasonId: 2023, trackId: 9, trackName: 'T9',
      day: 90, state: 2, isSprint: false, results,
    };
    const result = buildPaceBoard(makeModel([race], standings));
    expect(result.data.rivals.map((r) => r.teamId)).toContain(2);
    expect(result.data.rivalRef?.teamId).toBe(3);
  });
});

/* ── v0.5.4 — race pace board, verified Bahrain Day 46507 numbers ────────
 * Real-save numbers (SQL-checked against Races_Results.Time / Laps, season
 * 2027, 4 races done, Bahrain latest):
 *   race pace  — CustomTeam median 0.468s rank 7/11, per-race latest-first
 *                [1.113, 0.421, 0.493, 0.443]; Red Bull 0.000 #1; Alfa Romeo
 *                0.871 #11.
 *   peak pace  — unchanged by v0.5.4: 2.299s rank 11/11, rival Alfa Romeo,
 *                playerVsRivalS +0.274s.
 * The synthetic 11-team grid below reproduces those exact medians. Peak
 * deltas sit at/below 1.2s except Alfa Romeo (2.025s) so the ±0.5s
 * proximity rule + standings neighbour both select Alfa Romeo for the peak
 * board, matching the real save's reference rival.
 */

const VERIFIED_TEAMS: [number, string][] = [
  [1, 'Red Bull'],
  [2, 'McLaren'],
  [3, 'Mercedes'],
  [4, 'Williams'],
  [5, 'Ferrari'],
  [6, 'Alpine'],
  [7, 'Haas'],
  [8, 'AlphaTauri'],
  [9, 'Aston Martin'],
  [10, 'Alfa Romeo'],
  [32, 'CustomTeam'], // player
];

/** Constant per-race race-pace deltas (ms) for the 10 AI teams. */
const VERIFIED_RACE_DELTA_MS = new Map<number, number>([
  [1, 0], [2, 142], [3, 315], [4, 386], [5, 432],
  [6, 463], [7, 519], [8, 566], [9, 779], [10, 871],
]);
/** Player race-pace delta per race day — Albert Park 10, Shanghai 20,
 * Suzuka 30, Bahrain 40 (latest). Median = (0.443 + 0.493) / 2 = 0.468s. */
const PLAYER_RACE_DELTA_BY_DAY_MS = new Map<number, number>([
  [10, 443], [20, 493], [30, 421], [40, 1113],
]);
/** Constant per-race fastest-lap deltas (ms); Alfa Romeo is the peak rival
 * (2299 − 2025 = 274ms) and everything else is out of the ±0.5s window. */
const VERIFIED_PEAK_DELTA_MS = new Map<number, number>([
  [1, 0], [2, 150], [3, 300], [4, 450], [5, 600],
  [6, 750], [7, 900], [8, 1050], [9, 1200], [10, 2025], [32, 2299],
]);

const FIXTURE_LAPS = 50;
const AVG_BASE_MS = 90000;
const FL_BASE_MS = 88000;

function verifiedRace(day: number): Race {
  const results: RaceResult[] = VERIFIED_TEAMS.flatMap(([teamId, teamName]) =>
    [0, 1].map((n) => {
      const raceDelta = teamId === 32
        ? PLAYER_RACE_DELTA_BY_DAY_MS.get(day)!
        : VERIFIED_RACE_DELTA_MS.get(teamId)!;
      const avgMs = AVG_BASE_MS + raceDelta + n * 400;
      const flMs = FL_BASE_MS + VERIFIED_PEAK_DELTA_MS.get(teamId)! + n * 300;
      const driverId = teamId * 10 + (n + 1);
      return {
        driverId,
        driverName: teamId === 32 ? (n === 0 ? 'Ricciardo' : "O'Ward") : `D${driverId}`,
        teamId,
        teamName,
        finishingPos: teamId + n * 11,
        points: 0,
        dnf: false,
        laps: FIXTURE_LAPS,
        totalTimeMs: FIXTURE_LAPS * avgMs,
        fastestLapMs: flMs,
      } satisfies RaceResult;
    }),
  );
  // Bahrain (latest, day 40) — verified real result: Ricciardo P9→P4 (+5,
  // 12 pts), O'Ward P22→P9 (+13, 2 pts). Positions don't feed the pace
  // boards; they feed the v0.5.4 recommendation counter-evidence.
  if (day === 40) {
    const ric = results.find((r) => r.driverId === 321)!;
    const ow = results.find((r) => r.driverId === 322)!;
    ric.finishingPos = 4;
    ric.startingPos = 9;
    ric.points = 12;
    ow.finishingPos = 9;
    ow.startingPos = 22;
    ow.points = 2;
  }
  return {
    raceId: day, seasonId: 2023, trackId: day,
    trackName: day === 40 ? 'Bahrain' : `T${day}`,
    day, state: 2, isSprint: false, results,
  };
}

function verifiedModel(races?: Race[]): SaveModel {
  const standings: StandingRow[] = VERIFIED_TEAMS.map(([id, name], i) => ({
    position: i + 1, id, name, points: 500 - i * 10,
  }));
  return {
    meta: {
      id: 'test', fileName: 'test.sav', fileSizeBytes: 1,
      gameVersion: 'F1M24', saveGameVersion: 3, parsedAt: '2026-01-01T00:00:00Z',
      seasonId: 2023, day: 50, playerTeamId: 32,
      tablesPresent: [], tablesMissing: [], warnings: [],
    },
    player: { teamId: 32, teamName: 'CustomTeam', customTeamEnabled: true },
    teams: VERIFIED_TEAMS.map(([teamId, teamName]) => ({
      teamId, teamName, isCustomTeam: teamId === 32, formula: 0,
    })),
    drivers: [],
    staff: [],
    seasons: [],
    races: races ?? ([10, 20, 30, 40] as const).map(verifiedRace),
    standings: { drivers: [], teams: standings },
    tyres: [],
    ...emptyPhase2Sections(),
    availability: [],
  };
}

describe('buildRacePaceBoard — verified Bahrain Day 46507 numbers', () => {
  const model = verifiedModel();

  it('race pace board reproduces the verified medians/ranks', () => {
    const result = buildRacePaceBoard(model);
    const board = result.data;

    expect(board.rows).toHaveLength(11);
    // Red Bull 0.000 → #1; Alfa Romeo 0.871 → #11
    expect(board.rows[0].teamId).toBe(1);
    expect(board.rows[0].paceDeltaS).toBeCloseTo(0.0, 9);
    expect(board.rows[10].teamId).toBe(10);
    expect(board.rows[10].paceDeltaS).toBeCloseTo(0.871, 9);

    const player = board.rows.find((r) => r.isPlayer)!;
    expect(player.teamName).toBe('CustomTeam');
    expect(player.paceDeltaS).toBeCloseTo(0.468, 9);
    expect(player.rank).toBe(7);
    // latest first: Bahrain, Suzuka, Shanghai, Albert Park
    expect(player.raceDeltasS).toEqual([1.113, 0.421, 0.493, 0.443]);

    // closest median to the player = Alpine (0.463, |Δ| = 0.005)
    expect(board.rivalRef?.teamId).toBe(6);
    // median of per-race (player − Alpine) = (−0.020 + 0.030)/2
    expect(board.playerVsRivalS).toBeCloseTo(0.005, 9);

    // ≥3 races → MEDIUM cap for the avg-lap proxy
    expect(result.confidence).toBe('MEDIUM');
    expect(board.racesConsidered).toBe(4);
    expect(result.assumptions.some((a) => a.text.includes('vòng vào/ra pit'))).toBe(true);
    expect(result.evidence.every((e) => e.source === 'Races_Results.Time / Laps')).toBe(true);
    expect(result.recommendations[0].title).toContain('Pace đua (vòng trung bình)');
  });

  it('locks the peak pace board — unchanged by v0.5.4', () => {
    const result = buildPaceBoard(model);
    const board = result.data;

    expect(board.rows).toHaveLength(11);
    const player = board.rows.find((r) => r.isPlayer)!;
    expect(player.paceDeltaS).toBeCloseTo(2.299, 9);
    expect(player.rank).toBe(11);

    expect(board.rivalRef?.teamId).toBe(10); // Alfa Romeo, same as real save
    expect(board.playerVsRivalS).toBeCloseTo(0.274, 9);
    expect(result.confidence).toBe('HIGH'); // 4 races ≥ 4, peak rule intact
  });

  it('excludes DNF and non-positive laps/times from the average', () => {
    const race = verifiedRace(40);
    // Poison rows whose removal does NOT remove the session benchmark
    // (Red Bull's 90000ms stays): if either row were counted anyway, its
    // tiny avg would collapse raceBest and explode every delta.
    const poison = race.results.find((r) => r.driverId === 31)!; // Mercedes A
    poison.dnf = true;
    poison.totalTimeMs = 1000; // avg 20ms — must be ignored via dnf flag
    const zeroLaps = race.results.find((r) => r.driverId === 41)!; // Williams A
    zeroLaps.dnf = false;
    zeroLaps.laps = 0; // must be ignored via laps <= 0
    const result = buildRacePaceBoard(verifiedModel([race]));
    expect(result.data.rows[0].teamId).toBe(1);
    expect(result.data.rows[0].paceDeltaS).toBeCloseTo(0.0, 9);
    const player = result.data.rows.find((r) => r.isPlayer)!;
    expect(player.paceDeltaS).toBeCloseTo(1.113, 9);
  });

  it('degrades to LOW confidence without completed races', () => {
    const result = buildRacePaceBoard(verifiedModel([]));
    expect(result.warnings).toContain('NO_COMPLETED_RACES');
    expect(result.confidence).toBe('LOW');
    expect(result.data.rows).toHaveLength(0);
    expect(result.recommendations[0].title).toContain('pace đua');
  });
});

describe('v0.5.4 peak-pace recommendation carries counter-evidence', () => {
  const model = verifiedModel();
  const result = buildPaceBoard(model);
  const rec = result.recommendations[0];

  it('title says peak pace (fastest lap), never a bare pace verdict', () => {
    expect(rec.title).toContain('Pace đỉnh');
    expect(rec.title).toContain('(fastest lap)');
    expect(rec.title).toContain('Alfa Romeo');
    expect(rec.title).toContain('0.274');
    expect(rec.title).toContain('chậm hơn');
  });

  it('why carries all 3 pieces: race-pace rank + gains + points (Bahrain)', () => {
    expect(rec.why).toContain('pace đua (vòng trung bình) hạng 7/11');
    expect(rec.why).toContain('+18 vị trí ở Bahrain');
    expect(rec.why).toContain('Ricciardo +5');
    expect(rec.why).toContain("O'Ward +13");
    expect(rec.why).toContain('14 điểm');
    expect(rec.why).toContain('xe đua đường dài tốt hơn một vòng nhanh nhất');
  });

  it('evidence includes the race-pace counter source', () => {
    expect(result.evidence.some((e) => e.source === 'Races_Results.Time / Laps')).toBe(true);
    expect(result.assumptions.some((a) => a.text.includes('vòng vào/ra pit'))).toBe(true);
  });

  it('peak numbers on the board stay untouched by the enrichment', () => {
    const player = result.data.rows.find((r) => r.isPlayer)!;
    expect(player.paceDeltaS).toBeCloseTo(2.299, 9);
    expect(player.rank).toBe(11);
    expect(result.data.playerVsRivalS).toBeCloseTo(0.274, 9);
  });
});
