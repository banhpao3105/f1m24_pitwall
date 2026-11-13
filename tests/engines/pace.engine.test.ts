/**
 * Pace engine unit tests — Phase 1 (docs/05 §9.2: Pace bắt buộc).
 * Hand-computed medians over a synthetic season.
 */

import { describe, it, expect } from 'vitest';
import { buildPaceBoard } from '@/engines/pace.engine';
import type { SaveModel, Race, StandingRow } from '@/domain/types';

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
    parts: [],
    regulations: [],
    finance: {},
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
});
