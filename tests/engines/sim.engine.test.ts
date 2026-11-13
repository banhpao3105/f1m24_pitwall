/**
 * Sim engine unit tests — Phase 2 (docs/05 §9.2).
 * Deterministic SaveModel fixtures; quali sim falls back grid → practice.
 */

import { describe, it, expect } from 'vitest';
import { buildSim, Q3_FRACTION } from '@/engines/sim.engine';
import type { SaveModel, Race } from '@/domain/types';
import { emptyPhase2Sections } from '../helpers/model';

let nextId = 5000;

function makeRace(partial: Partial<Race> = {}): Race {
  const id = partial.raceId ?? nextId++;
  return {
    raceId: id,
    seasonId: 2024,
    trackId: 1,
    trackName: 'Sim Track',
    day: id * 10,
    state: 2,
    isSprint: false,
    laps: 40,
    results: [],
    ...partial,
  };
}

function makeModel(races: Race[], overrides: Partial<SaveModel> = {}): SaveModel {
  return {
    meta: {
      id: 'test', fileName: 'test.sav', fileSizeBytes: 1,
      gameVersion: 'F1M24', saveGameVersion: 3, parsedAt: '2026-01-01T00:00:00Z',
      seasonId: 2024, day: 400, playerTeamId: 1,
      tablesPresent: [], tablesMissing: [], warnings: [],
    },
    player: { teamId: 1, teamName: 'Player Racing', customTeamEnabled: false },
    teams: [
      { teamId: 1, teamName: 'Player Racing', isCustomTeam: false, formula: 1 },
      { teamId: 2, teamName: 'Rival Racing', isCustomTeam: false, formula: 1 },
    ],
    drivers: [],
    staff: [],
    seasons: [],
    races,
    standings: { drivers: [], teams: [] },
    tyres: [],
    ...emptyPhase2Sections(),
    availability: [],
    ...overrides,
  };
}

/** driver 1/2 = team 1 (player), driver 3/4 = team 2. */
function field(race: Race, fastestBase = 90_000): Race {
  const base = fastestBase;
  race.results = [
    { driverId: 1, driverName: 'Alpha One', teamId: 1, teamName: 'Player Racing', finishingPos: 1, points: 25, dnf: false, fastestLapMs: base },
    { driverId: 2, driverName: 'Alpha Two', teamId: 1, teamName: 'Player Racing', finishingPos: 2, points: 18, dnf: false, fastestLapMs: base + 400 },
    { driverId: 3, driverName: 'Beta One', teamId: 2, teamName: 'Rival Racing', finishingPos: 3, points: 15, dnf: false, fastestLapMs: base + 200 },
    { driverId: 4, driverName: 'Beta Two', teamId: 2, teamName: 'Rival Racing', finishingPos: 4, points: 12, dnf: false, fastestLapMs: base + 600 },
  ];
  race.qualifying = [
    { driverId: 1, driverName: 'Alpha One', teamId: 1, finishingPos: 2 },
    { driverId: 2, driverName: 'Alpha Two', teamId: 1, finishingPos: 3 },
    { driverId: 3, driverName: 'Beta One', teamId: 2, finishingPos: 1 },
    { driverId: 4, driverName: 'Beta Two', teamId: 2, finishingPos: 4 },
  ];
  return race;
}

describe('buildSim — quali sim', () => {
  it('predicts grid from median quali positions', () => {
    const races = [
      ...[1, 2, 3].map((i) => field(makeRace({ raceId: i, trackId: 1 }))),
      // upcoming race the sim will target
      makeRace({ raceId: 999, state: 1, results: [] }),
    ];
    const model = makeModel(races);
    const sim = buildSim(model, 999); // upcoming race (not in model)
    expect(sim.warnings).toEqual([]);
    expect(sim.data.quali).toHaveLength(4);
    const p1 = sim.data.quali[0];
    // Beta One has quali median 1 across races → predicted P1
    expect(p1.driverId).toBe(3);
    expect(p1.predictedGridPos).toBe(1);
    expect(p1.source).toBe('quali');
    expect(p1.samples).toBe(3);
  });

  it('assigns Q3/Q2/Q1 bands per model rule', () => {
    const races = [field(makeRace())];
    const model = makeModel(races);
    const sim = buildSim(model, 999);
    const bands = sim.data.quali.map((q) => q.band);
    // 4 drivers → q3Cut = round(4*0.5)=2 → first two rows Q3
    expect(bands[0]).toBe('Q3');
    expect(bands[1]).toBe('Q3');
    expect(bands).toContain('Q2');
    expect(Q3_FRACTION).toBe(0.5);
  });

  it('falls back to grid positions when no quali data', () => {
    const race = field(makeRace());
    race.qualifying = undefined;
    race.results.forEach((r, i) => {
      r.startingPos = i + 1;
    });
    const model = makeModel([race]);
    const sim = buildSim(model, 999);
    expect(sim.data.quali.every((q) => q.source === 'grid')).toBe(true);
  });

  it('falls back to practice laps as LOW source', () => {
    const race = field(makeRace());
    race.qualifying = undefined;
    race.results.forEach((r) => {
      r.startingPos = undefined;
    });
    race.practice = [
      { driverId: 3, teamId: 2, session: 1, bestLapMs: 88_000, bestLapTyre: 2 },
      { driverId: 1, teamId: 1, session: 1, bestLapMs: 89_000, bestLapTyre: 2 },
    ];
    const model = makeModel([race]);
    const sim = buildSim(model, 999);
    const sources = new Set(sim.data.quali.map((q) => q.source));
    expect(sources.has('practice')).toBe(true);
    expect(sim.confidence).toBe('LOW');
    expect(sim.assumptions.some((a) => a.text.includes('quali history'))).toBe(true);
  });
});

describe('buildSim — race sim', () => {
  it('ranks by median pace delta (Beta One fastest lap 2nd → P1)', () => {
    const races = [1, 2].map((i) => field(makeRace({ raceId: i })));
    const model = makeModel(races);
    const sim = buildSim(model, 999);
    expect(sim.data.race[0].driverId).toBe(1); // delta 0
    expect(sim.data.race[0].samples).toBe(2);
    expect(sim.data.race[1].driverId).toBe(3); // delta +0.2 → P2
    expect(sim.data.race[0].isPlayer).toBe(true);
  });

  it('produces a 6-field recommendation against the nearest rival', () => {
    const races = [
      ...[1, 2, 3].map((i) => field(makeRace({ raceId: i }))),
      makeRace({ raceId: 999, state: 1, results: [] }),
    ];
    const model = makeModel(races);
    const sim = buildSim(model, 999);
    const rec = sim.recommendations[0];
    expect(rec.id).toMatch(/^sim-race-|^sim-nodata-/);
    expect(rec.action.length).toBeGreaterThan(0);
    expect(rec.why.length).toBeGreaterThan(0);
    expect(rec.evidence.length).toBeGreaterThan(0);
    expect(['HIGH', 'MEDIUM', 'LOW']).toContain(rec.confidence);
    expect(sim.confidence).toBe('HIGH'); // ≥2 quali samples + ≥2 race samples
  });

  it('warns RACE_NOT_FOUND for unknown race id', () => {
    const sim = buildSim(makeModel([]), 12345);
    expect(sim.warnings).toEqual(['RACE_NOT_FOUND:12345']);
    expect(sim.recommendations).toEqual([]);
  });

  it('flags completed races with RACE_ALREADY_COMPLETED', () => {
    const sim = buildSim(makeModel([field(makeRace({ raceId: 7 }))]), 7);
    expect(sim.warnings).toContain('RACE_ALREADY_COMPLETED');
  });
});
