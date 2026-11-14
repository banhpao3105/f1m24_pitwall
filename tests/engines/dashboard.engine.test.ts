/**
 * Dashboard engine unit tests — v0.6.0 step 1 (prompt §8 verification list).
 *
 * Locked against the project owner's verified Miami 2027 TREND aggregates
 * (autosave-3.sav, Day 46524, 6/21 races done). The trend fixture
 * (../helpers/miami-trend-fixture) reproduces the per-race numbers exactly;
 * every asserted value is COMPUTED by buildSeasonSeries from those rows.
 *
 * §8 locked series (AP/SH/SU/BH/JE/MI chronological):
 *   cumulative  Red Bull 25/47/90/123/166/201 · Mercedes 4/39/66/99/116/149
 *               McLaren 33/60/70/71/85/99 · Ferrari 1/9/15/25/47/54
 *               CustomTeam 20/20/20/34/39/51 · Williams 6/14/26/36/36/36
 *               Alpine 10/11/11/11/11/11
 *   player per-race points [20,0,0,14,5,12]; Alpine [10,1,0,0,0,0]
 *   player gains [+29,−5,+10,+18,+14,+15] = +81; Alpine [+5,−2,+4,−7,−4,0] = −4
 *   player race-pace gaps [0.657,0.911,1.113,0.421,0.493,0.443]
 *     (fixture avg-lap offsets deliberately match §8; median 0.575)
 *   peak gaps are NOT locked from this fixture (lap values synthetic) —
 *   only their race↔delta ALIGNMENT with buildPaceBoard is asserted.
 */

import { describe, it, expect } from 'vitest';
import { buildSeasonSeries } from '@/engines/dashboard.engine';
import { buildPaceBoard, buildRacePaceBoard } from '@/engines/pace.engine';
import { buildMiamiTrendModel, TREND_PLAYER_TEAM_ID } from '../helpers/miami-trend-fixture';
import { buildMiamiModel } from '../helpers/miami-fixture';

describe('buildSeasonSeries — Miami §8 trend (locked numbers)', () => {
  const model = buildMiamiTrendModel();
  const result = buildSeasonSeries(model);
  const { data } = result;

  it('window = 6 chronological races, oldest first', () => {
    expect(data.racesConsidered).toBe(6);
    expect(data.races.map((r) => r.trackName)).toEqual([
      'Albert Park', 'Shanghai', 'Suzuka', 'Bahrain', 'Jeddah', 'Miami',
    ]);
    expect(result.confidence).toBe('HIGH');
  });

  it('cumulative constructors points match §8 per team', () => {
    const cum = (teamId: number): number[] =>
      data.pointsCumulative.find((r) => r.teamId === teamId)?.values ?? [];
    expect(cum(1)).toEqual([25, 47, 90, 123, 166, 201]); // Red Bull
    expect(cum(2)).toEqual([4, 39, 66, 99, 116, 149]); // Mercedes
    expect(cum(3)).toEqual([33, 60, 70, 71, 85, 99]); // McLaren
    expect(cum(4)).toEqual([1, 9, 15, 25, 47, 54]); // Ferrari
    expect(cum(32)).toEqual([20, 20, 20, 34, 39, 51]); // you
    expect(cum(5)).toEqual([6, 14, 26, 36, 36, 36]); // Williams
    expect(cum(6)).toEqual([10, 11, 11, 11, 11, 11]); // Alpine
    // ranking by final cumulative: Red Bull first, player 5th
    expect(data.pointsCumulative[0].teamId).toBe(1);
    expect(data.pointsCumulative[4].isPlayer).toBe(true);
  });

  it('per-race points: player [20,0,0,14,5,12], rival = Ferrari (results rank above)', () => {
    expect(data.pointsPerRace.player).toEqual([20, 0, 0, 14, 5, 12]);
    expect(data.pointsPerRace.rival?.teamId).toBe(4);
    expect(data.pointsPerRace.rival?.teamName).toBe('Ferrari');
    expect(data.pointsPerRace.rival?.values).toEqual([1, 8, 6, 10, 22, 7]);
  });

  it('positions gained per race: you [+29,−5,+10,+18,+14,+15], Alpine [+5,−2,+4,−7,−4,0]', () => {
    expect(data.positionsGainedPerRace).toEqual([29, -5, 10, 18, 14, 15]);
    const alpine = data.gainedPerTeam.find((r) => r.teamId === 6);
    expect(alpine?.values).toEqual([5, -2, 4, -7, -4, 0]);
    // season totals mirror the §8 verdicts
    expect(data.positionsGainedPerRace.reduce((a, b) => a + b, 0)).toBe(81);
    expect(alpine?.values.reduce((a, b) => a + b, 0)).toBe(-4);
  });

  it('race-pace gaps per race match §8 [0.657,0.911,1.113,0.421,0.493,0.443]', () => {
    expect(data.paceGapPerRace.race).toEqual([
      0.657, 0.911, 1.113, 0.421, 0.493, 0.443,
    ]);
    const median =
      [...data.paceGapPerRace.race].sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(((median[2] ?? 0) + (median[3] ?? 0)) / 2).toBeCloseTo(0.575, 9);
  });

  it('peak gaps stay aligned with the pace board (no recomputation)', () => {
    const board = buildPaceBoard(model);
    const player = board.data.rows.find((r) => r.isPlayer);
    expect(player).toBeTruthy();
    expect(data.paceGapPerRace.peak).toEqual([...(player!.raceDeltasS)].reverse());
    expect(result.warnings).not.toContain('PACE_SERIES_MISALIGNED');
    // and the race series must equal the race board's deltas reversed too
    const raceBoard = buildRacePaceBoard(model);
    const racePlayer = raceBoard.data.rows.find((r) => r.isPlayer);
    expect(data.paceGapPerRace.race).toEqual([...(racePlayer!.raceDeltasS)].reverse());
  });

  it('best finish per race is the best classified finish of the player cars', () => {
    expect(data.bestFinishPerRace).toEqual([5, 8, 5, 1, 4, 6]);
  });
});

describe('buildSeasonSeries — degradation + frozen-fixture compatibility', () => {
  it('runs on the frozen v0.5.6 fixture with board-aligned pace series', () => {
    const model = buildMiamiModel();
    const result = buildSeasonSeries(model);
    expect(result.data.racesConsidered).toBe(6);
    expect(result.data.pointsPerRace.player).toHaveLength(6);
    const peakBoard = buildPaceBoard(model);
    const raceBoard = buildRacePaceBoard(model);
    const peakPlayer = peakBoard.data.rows.find((r) => r.isPlayer);
    const racePlayer = raceBoard.data.rows.find((r) => r.isPlayer);
    expect(result.data.paceGapPerRace.peak).toEqual([...(peakPlayer?.raceDeltasS ?? [])].reverse());
    expect(result.data.paceGapPerRace.race).toEqual([...(racePlayer?.raceDeltasS ?? [])].reverse());
    expect(result.warnings).not.toContain('PACE_SERIES_MISALIGNED');
  });

  it('no completed races → LOW confidence, nodata recommendation', () => {
    const model = buildMiamiTrendModel();
    model.races = model.races.map((r) => ({ ...r, state: 1 }));
    const result = buildSeasonSeries(model);
    expect(result.data.races).toHaveLength(0);
    expect(result.confidence).toBe('LOW');
    expect(result.warnings).toContain('NO_COMPLETED_RACES');
    expect(result.recommendations[0].id).toContain('nodata');
  });
});
