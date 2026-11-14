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

  it('0.5.3: tyre duel skips drivers who never raced for the team — no fabricated gap, no "null" text', () => {
    // Real-save shape (Bahrain Day 46495): roster maps 4 drivers to the
    // player team, but only Ricciardo (#13) and O'Ward (#285) actually
    // raced for it. Zhou (#105) has results but all for team 9 (stale
    // drivers-team mapping); Fittipaldi (#80) never raced at all. The old
    // code took the first two staff-ordered cards and coerced Fittipaldi's
    // null avgStintLaps to 0 → fabricated "57 laps/stint gap" + text
    // "Pietro Fittipaldi null".
    const races: Race[] = [1, 2, 3].map((i) => {
      const race = makeRace({ raceId: i });
      race.results = [
        { driverId: 13, driverName: 'Daniel Ricciardo', teamId: 32, teamName: 'CustomTeam', finishingPos: 11, points: 0, dnf: false, laps: 57 },
        { driverId: 285, driverName: "Pato O'Ward", teamId: 32, teamName: 'CustomTeam', finishingPos: 17, points: 0, dnf: false, laps: 57 },
        { driverId: 105, driverName: 'Guanyu Zhou', teamId: 9, teamName: 'Other Team', finishingPos: 14, points: 0, dnf: false, laps: 57 },
      ];
      race.pitStops = [
        { driverId: 285, teamId: 32, lap: 20, durationMs: 22_000 },
        { driverId: 105, teamId: 9, lap: 19, durationMs: 22_000 },
        { driverId: 105, teamId: 9, lap: 38, durationMs: 22_000 },
      ];
      return race;
    });
    const model = makeModel(races, {
      player: { teamId: 32, teamName: 'CustomTeam', customTeamEnabled: true },
      drivers: [
        { staffId: 13, fullName: 'Daniel Ricciardo', teamId: 32 },
        { staffId: 80, fullName: 'Pietro Fittipaldi', teamId: 32 },
        { staffId: 105, fullName: 'Guanyu Zhou', teamId: 32 },
        { staffId: 285, fullName: "Pato O'Ward", teamId: 32 },
      ],
    });
    const p = buildPersonnel(model);

    const duel = p.recommendations.find((r) => r.id === 'personnel-duel-tyre');
    expect(duel).toBeDefined();
    expect(duel?.title).toContain('Daniel Ricciardo');
    expect(duel?.title).toContain("Pato O'Ward");
    for (const r of p.recommendations) {
      const text = `${r.title} ${r.action} ${r.why} ${r.riskIfIgnored ?? ''}`;
      expect(text).not.toContain('null');
      expect(text).not.toContain('Fittipaldi');
      expect(text).not.toContain('Guanyu Zhou');
    }
  });

  it('0.5.3: fewer than 2 raced drivers → no tyre duel rec, explicit assumption instead', () => {
    const races: Race[] = [1].map((i) => {
      const race = makeRace({ raceId: i });
      race.results = [
        { driverId: 13, driverName: 'Daniel Ricciardo', teamId: 32, teamName: 'CustomTeam', finishingPos: 11, points: 0, dnf: false, laps: 57 },
      ];
      return race;
    });
    const model = makeModel(races, {
      player: { teamId: 32, teamName: 'CustomTeam', customTeamEnabled: true },
      drivers: [
        { staffId: 13, fullName: 'Daniel Ricciardo', teamId: 32 },
        { staffId: 80, fullName: 'Pietro Fittipaldi', teamId: 32 },
      ],
    });
    const p = buildPersonnel(model);
    expect(p.recommendations.find((r) => r.id === 'personnel-duel-tyre')).toBeUndefined();
    expect(p.assumptions.some((a) => a.text.includes('Chưa đủ dữ liệu giữ lốp'))).toBe(true);
    for (const r of p.recommendations) {
      const text = `${r.title} ${r.action} ${r.why} ${r.riskIfIgnored ?? ''}`;
      expect(text).not.toContain('null');
    }
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

  it('0.4.1: dedupes contract history to one row per staff (latest started wins)', () => {
    // Real-save shape: renewals leave 2+ rows per staff. Contract history:
    // staff 1 → old row (StartDay 100, EndSeason 2026) + renewal (StartDay 350
    // ≤ current day 400, EndSeason 2028) — the renewal must win.
    const model = makeModel(duelRaces(), {
      personnel: {
        contracts: [
          { staffId: 1, teamId: 1, contractType: 0, salary: 1_000_000, startDay: 100, endSeason: 2026 },
          { staffId: 1, teamId: 1, contractType: 0, salary: 2_000_000, startDay: 350, endSeason: 2028 },
          { staffId: 2, teamId: 1, contractType: 0, salary: 500_000, startDay: 100, endSeason: 2026 },
          { staffId: 2, teamId: 1, contractType: 0, salary: 800_000, startDay: 100, endSeason: 2027 },
        ],
        performance: [],
        patience: [],
        tablesPresent: { contracts: true, performance: false, patience: false },
      },
    });
    const p = buildPersonnel(model);
    const ids = p.data.contracts.map((c) => c.staffId).sort();
    expect(ids).toEqual([1, 2]); // one row per staff — no duplicates
    const ace = p.data.contracts.find((c) => c.staffId === 1)!;
    expect(ace.salary).toBe(2_000_000); // latest started contract
    // same StartDay → higher EndSeason wins
    const backup = p.data.contracts.find((c) => c.staffId === 2)!;
    expect(backup.salary).toBe(800_000);
  });

  it('0.4.1: patience keeps only the player-team row per staff', () => {
    // F1M24 stores one patience row per (staff, team) — 11 rows per staff.
    const model = makeModel(duelRaces(), {
      personnel: {
        contracts: [],
        performance: [],
        patience: [
          { staffId: 7, teamId: 2, suitability: 0.1, opinion: 0.2, threshold: 0.9 },
          { staffId: 7, teamId: 1, suitability: 0.8, opinion: 0.6, threshold: 0.2 },
          { staffId: 8, teamId: 3, suitability: 0.3, opinion: 0.4, threshold: 0.7 },
        ],
        tablesPresent: { contracts: false, performance: false, patience: true },
      },
    });
    const p = buildPersonnel(model);
    const rows = p.data.patience;
    expect(rows.map((r) => r.staffId).sort()).toEqual([7]); // staff 8: no player-team row
    expect(rows[0].threshold).toBe(0.2);
    expect(rows[0].suitability).toBe(0.8);
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
