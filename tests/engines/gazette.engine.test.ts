/**
 * Gazette engine unit tests — Phase 3 (docs/05 §9.2: oracle đối chiếu).
 * Hand-computed expectations over a synthetic season mirroring the
 * Gazette v2.2 oracle formulas (see gazette.engine.ts header references).
 */

import { describe, it, expect } from 'vitest';
import {
  buildGazetteIssue,
  computeOdds,
  pickIndex,
  oleDateToYear,
  ODDS_OVERROUND,
  ODDS_TEAM_BASELINE,
} from '@/engines/gazette.engine';
import type { SaveModel, Race, RaceResult, Team } from '@/domain/types';
import { emptyPhase2Sections } from '../helpers/model';

const SEASON = 2023;

function team(id: number, name: string): Team {
  return { teamId: id, teamName: name, isCustomTeam: false, formula: 0 };
}

function result(
  driverId: number,
  teamId: number,
  finishingPos: number,
  extra: Partial<RaceResult> = {},
): RaceResult {
  return {
    driverId,
    driverName: `D${driverId}`,
    teamId,
    teamName: `T${teamId}`,
    finishingPos,
    points: extra.points ?? Math.max(0, 25 - (finishingPos - 1) * 5),
    dnf: extra.dnf ?? false,
    ...extra,
  };
}

function makeModel(races: Race[]): SaveModel {
  return {
    meta: {
      id: 'test', fileName: 'test.sav', fileSizeBytes: 1,
      gameVersion: 'F1M24', saveGameVersion: 3, parsedAt: '2026-01-01T00:00:00Z',
      seasonId: SEASON, day: 400, playerTeamId: 1,
      tablesPresent: [], tablesMissing: [], warnings: [],
    },
    player: { teamId: 1, teamName: 'T1', customTeamEnabled: false },
    teams: [team(1, 'T1'), team(2, 'T2'), team(3, 'T3'), team(4, 'T4')],
    drivers: [
      { staffId: 11, fullName: 'Alfa', teamId: 1 },
      { staffId: 21, fullName: 'Bravo', teamId: 2 },
      { staffId: 31, fullName: 'Charlie', teamId: 3 },
    ],
    staff: [],
    seasons: [{ seasonId: SEASON }],
    races,
    standings: { drivers: [], teams: [] },
    tyres: [],
    ...emptyPhase2Sections(),
    availability: [],
  };
}

/** Two-team mini-grid with full oracle-mirroring data. */
function race(id: number, day: number, opts: {
  winnerStart?: number;
  winnerTimeS?: number;
  p2TimeS?: number;
  overtakes?: Record<number, number>;
  sc?: number;
  vsc?: number;
  trackType?: number;
  trackRecordMs?: number;
  state?: number;
} = {}): Race {
  const winnerStart = opts.winnerStart ?? 1;
  const r1 = result(11, 1, 1, {
    startingPos: winnerStart,
    totalTimeMs: (opts.winnerTimeS ?? 5400) * 1000,
    fastestLapMs: opts.trackRecordMs != null ? opts.trackRecordMs : 90_000,
    overtakes: opts.overtakes?.[11],
    points: 25,
  });
  const r2 = result(21, 2, 2, {
    totalTimeMs: (opts.p2TimeS ?? 5402) * 1000,
    fastestLapMs: 90_500,
    overtakes: opts.overtakes?.[21],
    points: 18,
  });
  const r3 = result(31, 3, 3, {
    totalTimeMs: (opts.p2TimeS ?? 5402) * 1000 + 3000,
    overtakes: opts.overtakes?.[31],
    points: 15,
  });
  const r4 = result(41, 1, 4, {
    startingPos: 3,
    totalTimeMs: (opts.p2TimeS ?? 5402) * 1000 + 5000,
    overtakes: opts.overtakes?.[41],
    points: 12,
    safetyCarDeployments: opts.sc,
    vscDeployments: opts.vsc,
  });
  return {
    raceId: id, seasonId: SEASON, trackId: id % 2 === 0 ? 20 : 10,
    trackName: `Track${id}`, day, state: opts.state ?? 2, isSprint: false,
    laps: 50,
    trackType: opts.trackType ?? 1,
    trackLengthKm: 5.0,
    trackFirstRaceYear: 2004,
    trackFastestLapMs: opts.trackRecordMs,
    trackFastestLapDriverId: 11,
    trackFastestLapYear: 2023,
    weather: { raceTempC: 28, raceRain: false, practiceRain: false, qualifyingRain: true },
    results: [r1, r2, r3, r4],
  };
}

describe('buildGazetteIssue — race report', () => {
  const model = makeModel([
    race(1, 10, { trackType: 1 }),
    race(2, 20, { trackType: 2 }),
    race(3, 30, {
      winnerStart: 5,
      winnerTimeS: 5400,
      p2TimeS: 5401.5, // gap 1.5 s → 'close'
      overtakes: { 11: 3, 21: 1, 31: 0, 41: 7 },
      sc: 1,
      vsc: 0,
    }),
    race(4, 40, { trackType: 1, state: 2 }),
  ]);

  it('computes winner, gap and aggregates exactly like the oracle', () => {
    const out = buildGazetteIssue(model, 3);
    const { data } = out;
    expect(data.winner?.driverId).toBe(11);
    expect(data.wireToWire).toBe(false); // started P5
    expect(data.round).toBe(3);
    expect(data.totalRounds).toBe(4);

    const p2 = data.results.find((r) => r.finishPos === 2);
    expect(p2?.gapS).toBeCloseTo(1.5, 6);

    // totalOvertakes = 3 + 1 + 0 + 7 = 11
    expect(data.aggregates.totalOvertakes).toBe(11);
    expect(data.aggregates.overtakesAvailable).toBe(true);
    expect(data.aggregates.safetyCars).toBe(1);
    expect(data.aggregates.virtualSafetyCars).toBe(0);
    expect(data.aggregates.retirements).toBe(0);
    expect(out.confidence).toBe('HIGH');
  });

  it('marks wire-to-wire only when winner started AND finished P1', () => {
    const fromP1 = buildGazetteIssue(model, 1);
    expect(fromP1.data.wireToWire).toBe(true);
  });

  it('flags a new outright track record within the 0.5 ms tolerance', () => {
    const recordModel = makeModel([
      race(1, 10, { trackType: 1, trackRecordMs: 90_000 }),
    ]);
    const { data } = buildGazetteIssue(recordModel, 1);
    expect(data.fastestLap).not.toBeNull();
    expect(data.fastestLap?.isTrackRecord).toBe(true); // |90000 − 90000| < 0.5ms
    expect(data.fastestLap?.driverId).toBe(11);
  });

  it('finds the comeback only above the oracle gain ≥ 5 threshold', () => {
    const { data } = buildGazetteIssue(model, 3);
    // D41: P3 → P4 (−1), D21 P2→P2, D11 P5→P1 (+4 → below threshold)
    expect(data.comeback).toBeNull();

    const bigGain = makeModel([
      race(1, 10, { winnerStart: 1 }),
      race(2, 20, { winnerStart: 2, trackType: 1 }),
    ]);
    // D41 starts P3 — give him a P7 finish nowhere; instead start him P10.
    bigGain.races[0].results[3].startingPos = 10; // P10 → P4 = +6
    const { data: d2 } = buildGazetteIssue(bigGain, 1);
    expect(d2.comeback?.driverId).toBe(41);
    expect(d2.comeback?.gain).toBe(6);
  });

  it('deterministically selects quote slots (oracle seeds)', () => {
    const { data } = buildGazetteIssue(model, 3);
    // gap 1.5 s → 'close' bank; index = |11 + 3| % 3 = 2
    expect(data.quoteSlots.winner.category).toBe('close');
    expect(data.quoteSlots.winner.index).toBe(2);
    // random driver pool excludes winner: (3 * 7 + 11) % 3 = 32 % 3 = 2
    expect(data.quoteSlots.random).not.toBeNull();
    expect(data.quoteSlots.random?.index).toBe(2);
  });

  it('dominant category when gap > 10 s', () => {
    const dominant = makeModel([
      race(1, 10, { winnerTimeS: 5400, p2TimeS: 5415 }),
    ]);
    const { data } = buildGazetteIssue(dominant, 1);
    expect(data.quoteSlots.winner.category).toBe('dominant');
  });
});

describe('buildGazetteIssue — degradation (traceable > clever)', () => {
  it('degrades to MEDIUM without Time/overtakes and says what is missing', () => {
    const thin = makeModel([race(1, 10)]);
    thin.races[0].results.forEach((r) => {
      delete r.totalTimeMs;
      delete r.overtakes;
      delete r.safetyCarDeployments;
      delete r.vscDeployments;
    });
    const out = buildGazetteIssue(thin, 1);
    expect(out.confidence).toBe('MEDIUM');
    expect(out.data.aggregates.gapsAvailable).toBe(false);
    expect(out.data.aggregates.overtakesAvailable).toBe(false);
    expect(out.data.results.find((r) => r.finishPos === 2)?.gapS).toBeUndefined();
    expect(out.assumptions.length).toBeGreaterThanOrEqual(2);
  });

  it('warns and stays LOW for a race that has not run', () => {
    const upcoming = makeModel([race(1, 10, { state: 1 })]);
    upcoming.races[0].results = [];
    const out = buildGazetteIssue(upcoming, 1);
    expect(out.warnings).toContain('RACE_NOT_COMPLETED');
    expect(out.confidence).toBe('LOW');
    expect(out.recommendations).toEqual([]); // narrative: no recommendations
  });

  it('returns RACE_NOT_FOUND for an unknown raceId without throwing', () => {
    const out = buildGazetteIssue(makeModel([race(1, 10)]), 999);
    expect(out.warnings).toContain('RACE_NOT_FOUND');
    expect(out.confidence).toBe('LOW');
    expect(out.data.results).toEqual([]);
  });
});

describe('buildGazetteIssue — transfers (oracle getTransfers)', () => {
  it('derives future contracts, filters same-team and non-F1 moves', () => {
    const model = makeModel([race(1, 10)]);
    model.personnel.tablesPresent.contracts = true;
    model.personnel.contracts = [
      { staffId: 21, teamId: 3, contractType: 3, startDay: 46000, endSeason: 2024 },
      { staffId: 11, teamId: 1, contractType: 3, startDay: 46000 }, // same team → filtered
      { staffId: 51, teamId: 99, contractType: 3, startDay: 46000 }, // non-F1 both sides → filtered
      { staffId: 31, teamId: 2, contractType: 3, startDay: 46000 },
    ];
    // D51 has no race row and no primary contract → curTeam null + fut non-F1 → filtered.
    const { data } = buildGazetteIssue(model, 1);
    expect(data.transfers.map((t) => t.driverId).sort()).toEqual([21, 31]);
    const t21 = data.transfers.find((t) => t.driverId === 21)!;
    expect(t21.curTeamId).toBe(2);
    expect(t21.futTeamId).toBe(3);
    expect(t21.effectiveSeason).toBe(oleDateToYear(46000));
    // Quote seed: driverId + futTeamId = 21 + 3 = 24 → 24 % 3 = 0
    expect(t21.quoteIndex).toBe(0);
  });

  it('returns no transfers when Staff_Contracts is absent', () => {
    const model = makeModel([race(1, 10)]);
    model.personnel.tablesPresent.contracts = false;
    expect(buildGazetteIssue(model, 1).data.transfers).toEqual([]);
  });
});

describe('buildGazetteIssue — favorites / odds / dark horse / trivia', () => {
  // 6+ rounds so the dark-horse gate opens; next race (id 7) is trackType 1.
  function seasonModel(): SaveModel {
    const races: Race[] = [];
    for (let i = 1; i <= 6; i++) {
      races.push(race(i, i * 10, { trackType: i % 2 === 0 ? 2 : 1 }));
    }
    races.push(race(7, 70, { trackType: 1, state: 1 })); // next race, not run
    races[6].results = [];
    return makeModel(races);
  }

  it('uses trackType form when ≥ 2 matching races exist, odds formula matches oracle', () => {
    const model = seasonModel();
    const { data } = buildGazetteIssue(model, 6);
    expect(data.nextRace?.raceId).toBe(7);
    expect(data.nextRace?.trackName).toBe('Track7');
    expect(data.nextRace?.isCompleted).toBe(false);
    expect(data.favorites?.basis).toBe('trackType');
    expect(data.favorites?.sampleRaces).toBe(3); // races 1,3,5 are trackType 1

    // Hand-check odds for a team averaging 25 + 25 + 25 = 37 pts/race (T1
    // wins every race with D11) against T2/T3 avg 18/15.
    const t1 = data.favorites?.teams.find((t) => t.id === 1);
    const t2 = data.favorites?.teams.find((t) => t.id === 2);
    const t3 = data.favorites?.teams.find((t) => t.id === 3);
    expect(t1).toBeDefined();
    expect(t2).toBeDefined();
    expect(t3).toBeDefined();
    const s1 = 37 + ODDS_TEAM_BASELINE;
    const s2 = 18 + ODDS_TEAM_BASELINE;
    const s3 = 15 + ODDS_TEAM_BASELINE;
    const total = s1 + s2 + s3;
    const expectedOdds = (s: number) =>
      Math.round(Math.max(1.05, Math.min(67, 1 / Math.min((s / total) * ODDS_OVERROUND, 0.95))) * 100) / 100;
    expect(t1?.odds).toBe(expectedOdds(s1));
    expect(t2?.odds).toBe(expectedOdds(s2));
    expect(t3?.odds).toBe(expectedOdds(s3));
    expect(data.favorites?.teams[0].id).toBe(1); // lowest odds first
  });

  it('falls back to season-wide form with < 2 same-type races', () => {
    const model = makeModel([
      race(1, 10, { trackType: 1 }),
      race(2, 20, { trackType: 2 }),
      race(3, 30, { trackType: 1, state: 1 }), // next race, not yet run
    ]);
    model.races[2].results = [];
    const { data } = buildGazetteIssue(model, 2);
    expect(data.favorites?.basis).toBe('season');
    expect(data.favorites?.sampleRaces).toBe(2);
  });

  it('flags the dark horse once 6 rounds exist and form jumped ≥ thresholds', () => {
    const model = seasonModel();
    // Make T4 (drivers 41) improve: no early points, big recent points.
    for (let i = 1; i <= 3; i++) {
      const r4 = model.races[i - 1].results[3];
      r4.points = 0;
      r4.finishingPos = 10;
      r4.dnf = true; // excluded from wins/podiums, points 0
    }
    for (let i = 4; i <= 6; i++) {
      const r4 = model.races[i - 1].results[3];
      r4.points = 25;
      r4.finishingPos = 1;
      r4.dnf = false;
      // Give T4 the win; demote T1 driver to P4 so order stays consistent.
      const r1 = model.races[i - 1].results[0];
      r1.finishingPos = 4;
      r1.points = 12;
    }
    const { data } = buildGazetteIssue(model, 6);
    // Favourite = T1 (odds #1) → excluded; no other team improves ≥ 1.5.
    expect(data.darkHorse).not.toBeNull();
    expect(data.darkHorse?.team).toBeNull();
    // Driver: D41 recent 25, early 0 (DNF) → delta 25 ≥ 1.0
    expect(data.darkHorse?.driver?.driverId).toBe(41);
    expect(data.darkHorse?.driver?.delta).toBe(25);
  });

  it('computes trivia for the next track from completed history', () => {
    const model = seasonModel();
    model.races[6].trackId = 99; // next race runs on a brand-new track
    const { data } = buildGazetteIssue(model, 6);
    // Track99 has no completed history → trivia null (never invent one).
    expect(data.trivia).toBeNull();

    const revisited = makeModel([
      race(1, 10, { trackType: 1 }),
      race(2, 20, { trackType: 2 }),
      race(3, 30, { trackType: 1 }),
      race(4, 40, { trackType: 1, trackRecordMs: 90_000 }), // next race, shares trackId 20 with race 2
    ]);
    // force track ids: races 2 & 4 share trackId 20
    revisited.races[3].trackId = 20;
    revisited.races[3].trackName = 'Track2';
    const { data: d2 } = buildGazetteIssue(revisited, 3);
    expect(d2.trivia?.timesRaced).toBe(1);
    expect(d2.trivia?.lastWinner?.driverName).toBe('D11');
    expect(d2.trivia?.lapRecord?.lapMs).toBe(90_000);
  });
});

describe('computeOdds + helpers', () => {
  it('orders rows by odds ascending and clamps to the oracle bounds', () => {
    const rows = [
      { id: 1, name: 'A', teamName: 'A', avgPoints: 50, wins: 3, podiums: 4, history: [] },
      { id: 2, name: 'B', teamName: 'B', avgPoints: 1, wins: 0, podiums: 0, history: [] },
    ];
    const out = computeOdds(rows, ODDS_TEAM_BASELINE);
    expect(out[0].id).toBe(1);
    expect(out[0].odds).toBeLessThan(out[1].odds);
    for (const r of out) {
      expect(r.odds).toBeGreaterThanOrEqual(1.05);
      expect(r.odds).toBeLessThanOrEqual(67);
    }
  });

  it('pickIndex and oleDateToYear match the oracle math', () => {
    expect(pickIndex(7, 3)).toBe(1);
    expect(pickIndex(-7, 3)).toBe(1);
    expect(pickIndex(0, 3)).toBe(0);
    expect(pickIndex(5, 0)).toBe(0);
    // OLE 44927 = 2023-01-01 UTC
    expect(oleDateToYear(44927)).toBe(2023);
  });
});
