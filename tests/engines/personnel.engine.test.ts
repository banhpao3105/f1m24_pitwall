/**
 * Personnel engine unit tests — Phase 2 (form, duel, tyre preservation,
 * contract expiry alerts, patience intel, degradation).
 */

import { describe, it, expect } from 'vitest';
import {
  buildPersonnel,
  buildDriverDuel,
  CONTRACT_ALERT_DAYS,
  FORM_RACES,
} from '@/engines/personnel.engine';
import type { SaveModel, Race } from '@/domain/types';
import { emptyPhase2Sections } from '../helpers/model';

let nextId = 7000;

function makeRace(partial: Partial<Race>): Race {
  const id = partial.raceId ?? nextId++;
  return {
    raceId: id,
    seasonId: 2024,
    trackId: 1,
    trackName: 'P Track',
    day: id * 10,
    state: 2,
    isSprint: false,
    laps: 30,
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
    teams: [{ teamId: 1, teamName: 'Player Racing', isCustomTeam: false, formula: 1 }],
    drivers: [
      { staffId: 1, fullName: 'Ace Driver', teamId: 1 },
      { staffId: 2, fullName: 'Backup Driver', teamId: 1 },
    ],
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

/** Driver 1 (player) beats driver 2; both team 1. Driver 1 = tyre whisperer. */
function duelRaces(): Race[] {
  return [1, 2, 3, 4].map((i) => {
    const race = makeRace({ raceId: i });
    race.results = [
      { driverId: 1, driverName: 'Ace Driver', teamId: 1, teamName: 'Player Racing', finishingPos: 1, points: 25, dnf: false, laps: 30 },
      { driverId: 2, driverName: 'Backup Driver', teamId: 1, teamName: 'Player Racing', finishingPos: 2, points: 18, dnf: false, laps: 30 },
    ];
    race.qualifying = [
      { driverId: 1, driverName: 'Ace Driver', teamId: 1, finishingPos: 1 },
      { driverId: 2, driverName: 'Backup Driver', teamId: 1, finishingPos: 2 },
    ];
    if (i % 2 === 0) {
      race.pitStops = [
        { driverId: 2, teamId: 1, lap: 10, durationMs: 22_000 },
        { driverId: 2, teamId: 1, lap: 20, durationMs: 22_000 },
      ]; // driver 2: 3 stints of 10; driver 1: no stop → 30-lap stint
    }
    return race;
  });
}

describe('buildPersonnel', () => {
  it('builds driver cards with form chips and tyre preservation', () => {
    const model = makeModel(duelRaces());
    const p = buildPersonnel(model);
    expect(p.data.drivers).toHaveLength(2);
    const ace = p.data.drivers.find((d) => d.staffId === 1)!;
    const backup = p.data.drivers.find((d) => d.staffId === 2)!;
    expect(ace.form.map((f) => f.label)).toEqual(['W', 'W', 'W', 'W']);
    expect(ace.isPlayer).toBe(true);
    expect(ace.raceMedian).toBe(1);
    expect(ace.avgStintLaps).toBe(30);
    expect(backup.avgStintLaps).toBe(20); // median of [30,10,30,10]
    expect(FORM_RACES).toBe(5);
  });

  it('emits tyre-preservation duel recommendation (JTBD #8)', () => {
    const p = buildPersonnel(makeModel(duelRaces()));
    const rec = p.recommendations.find((r) => r.id === 'personnel-duel-tyre');
    expect(rec).toBeDefined();
    expect(rec?.action).toContain('Ace Driver');
    expect(rec?.confidence).toBe('MEDIUM');
  });

  it('flags expiring contracts inside the alert window', () => {
    const model = makeModel(duelRaces(), {
      personnel: {
        contracts: [
          { staffId: 1, teamId: 1, contractType: 0, salary: 2_000_000, endDay: 430 },
          { staffId: 9, teamId: 1, contractType: 3, salary: 300_000, endDay: 900 },
        ],
        performance: [{ staffId: 1, rating: 88, morale: 41 }],
        patience: [{ staffId: 2, suitability: 0.7, opinion: 0.5, threshold: 0.15 }],
        tablesPresent: { contracts: true, performance: true, patience: true },
      },
    });
    const p = buildPersonnel(model);
    expect(CONTRACT_ALERT_DAYS).toBe(60);
    const expiring = p.data.contracts.find((c) => c.staffId === 1);
    expect(expiring?.expiring).toBe(true);
    expect(expiring?.daysLeft).toBe(30);
    expect(expiring?.role).toBe('driver');
    expect(expiring?.morale).toBe(41);
    const rec = p.recommendations.find((r) => r.id === 'personnel-contract-expiry');
    expect(rec?.title).toContain('Ace Driver');
    expect(p.data.patience[0].threshold).toBe(0.15);
    expect(p.data.hasPatienceData).toBe(true);
  });

  it('degrades contracts to empty + warning when table missing', () => {
    const p = buildPersonnel(makeModel(duelRaces()));
    expect(p.data.hasContractData).toBe(false);
    expect(p.warnings).toContain('CONTRACT_DATA_UNAVAILABLE');
    expect(p.assumptions.some((a) => a.text.includes('Staff_Contracts'))).toBe(true);
  });
});

describe('buildDriverDuel', () => {
  it('computes head-to-head quali + race + tyre edge', () => {
    const model = makeModel(duelRaces());
    const duel = buildDriverDuel(model, 1, 2);
    expect(duel.data.h2h).toEqual({ qualiA: 4, qualiB: 0, raceA: 4, raceB: 0, races: 4 });
    expect(duel.data.a.avgStintLaps).toBe(30);
    // median of per-race laps/stint [30,10,30,10] = 20
    expect(duel.data.b.avgStintLaps).toBe(20);
    expect(duel.data.a.points).toBe(100);
    expect(duel.confidence).toBe('HIGH'); // 4 h2h races
    const rec = duel.recommendations.find((r) => r.id === 'duel-verdict');
    expect(rec?.title).toContain('Ace Driver');
  });

  it('returns a LOW nodata rec when the drivers never raced', () => {
    const duel = buildDriverDuel(makeModel([]), 1, 2);
    expect(duel.confidence).toBe('LOW');
    expect(duel.recommendations[0].id).toBe('duel-nodata');
  });
});
