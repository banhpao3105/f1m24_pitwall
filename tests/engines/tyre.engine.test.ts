/**
 * Tyre engine unit tests — Phase 1 (docs/05 §9.2: Tyre bắt buộc 100% case chính).
 * Input: hand-built SaveModel (pure engine — no DB, no React).
 * Determinism: same input → same output, always.
 */

import { describe, it, expect } from 'vitest';
import {
  buildTyreLab,
  evaluateStrategy,
  stintDegPenalty,
  getStintFactor,
  getPracticePace,
  getCompoundCaps,
  type TyreLab,
} from '@/engines/tyre.engine';
import type { SaveModel, Race } from '@/domain/types';

/* ── helpers to build a minimal SaveModel ────────────────────────────────── */

let nextRaceId = 1000;

function makeRace(partial: Partial<Race>): Race {
  const id = partial.raceId ?? nextRaceId++;
  return {
    raceId: id,
    seasonId: 2023,
    trackId: 1,
    trackName: 'Test Track',
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
      seasonId: 2023, day: 1, playerTeamId: 1,
      tablesPresent: [], tablesMissing: [], warnings: [],
    },
    player: { teamId: 1, teamName: 'Test Racing', customTeamEnabled: false },
    teams: [],
    drivers: [],
    staff: [],
    seasons: [],
    races,
    standings: { drivers: [], teams: [] },
    tyres: [],
    parts: [],
    regulations: [],
    finance: {},
    availability: [],
    ...overrides,
  };
}

/** Two-team field completing every race (so pit stats normalize). */
function fieldResults(raceId: number, n = 6) {
  return Array.from({ length: n }, (_, i) => ({
    driverId: i + 1,
    driverName: `Driver ${i + 1}`,
    teamId: (i % 2) + 1,
    teamName: i % 2 === 0 ? 'Test Racing' : 'Rival Racing',
    finishingPos: i + 1,
    points: 0,
    dnf: false,
  }));
}

/* ── pure math ───────────────────────────────────────────────────────────── */

describe('stintDegPenalty', () => {
  it('matches the closed form at known points', () => {
    expect(stintDegPenalty('S', 11, 14)).toBeCloseTo(3.0 * (11 / 3) * Math.pow(11 / 14, 2), 6);
    expect(stintDegPenalty('M', 19, 22)).toBeCloseTo(2.0 * (19 / 3) * Math.pow(19 / 22, 2), 6);
    expect(stintDegPenalty('S', 0, 14)).toBe(0);
  });
});

describe('evaluateStrategy', () => {
  it('finds the hand-computed optimum (S→M split 11/19, 1 stop, 47.39s)', () => {
    const result = evaluateStrategy(
      ['S', 'M'],
      30,
      { S: 14, M: 22, H: 30 },
      { S: 0, M: 0.55, H: 1.05 },
      20.7,
    );
    expect(result).not.toBeNull();
    expect(result!.stints[0].laps).toBe(11);
    expect(result!.stints[1].laps).toBe(19);
    expect(result!.timeS).toBeCloseTo(47.39, 1);
  });

  it('rejects single-compound plans (dry rule)', () => {
    expect(evaluateStrategy(['S', 'S'], 30, { S: 14, M: 22, H: 30 }, { S: 0, M: 0.55, H: 1.05 }, 20.7)).toBeNull();
  });

  it('never exceeds tyre life (hard ceiling)', () => {
    const result = evaluateStrategy(['S', 'M'], 30, { S: 14, M: 40, H: 40 }, { S: 0, M: 0.55, H: 1.05 }, 20.7);
    expect(result!.stints.every((s) => (s.compound === 'S' ? s.laps <= 14 : true))).toBe(true);
  });
});

/* ── data extraction ─────────────────────────────────────────────────────── */

describe('getStintFactor', () => {
  it('prefers track samples over meta over the model constant', () => {
    const raceAtTrack = makeRace({
      trackId: 1,
      state: 2,
      results: fieldResults(1),
      pitStops: Array.from({ length: 12 }, (_, i) => ({
        driverId: (i % 6) + 1, teamId: 1, lap: 10 + i, durationMs: 23000, pitStopId: i + 1,
      })),
    });
    const raceElsewhere = makeRace({
      raceId: 2, trackId: 2, day: 5, state: 2,
      results: fieldResults(2),
      pitStops: Array.from({ length: 6 }, (_, i) => ({
        driverId: (i % 6) + 1, teamId: 1, lap: 12, durationMs: 23000, pitStopId: 100 + i,
      })),
    });
    const model = makeModel([raceAtTrack, raceElsewhere]);
    const f = getStintFactor(model, 1);
    expect(f.source).toBe('track');
    expect(f.factor).toBeCloseTo(1 / 3, 6);

    const fOther = getStintFactor(model, 9);
    expect(fOther.source).toBe('meta');
  });

  it('falls back to the model constant without pit data', () => {
    const model = makeModel([makeRace({ trackId: 1, state: 2, results: fieldResults(1) })]);
    expect(getStintFactor(model, 1)).toEqual({ factor: 0.28, source: 'model', samples: 0 });
  });
});

describe('getPracticePace', () => {
  it('computes clamped positive deltas with enough drivers', () => {
    const rows: { driverId: number; teamId: number; session: number; bestLapMs: number; bestLapTyre: number }[] = [];
    for (let d = 1; d <= 4; d++) {
      rows.push({ driverId: d, teamId: 1, session: 1, bestLapMs: 80000, bestLapTyre: 2 });
      rows.push({ driverId: d, teamId: 1, session: 1, bestLapMs: 80500, bestLapTyre: 1 });
      rows.push({ driverId: d, teamId: 1, session: 1, bestLapMs: 81200, bestLapTyre: 0 });
    }
    const model = makeModel([makeRace({ trackId: 1, state: 2, practice: rows })]);
    const pace = getPracticePace(model, 1);
    expect(pace).not.toBeNull();
    expect(pace!.deltas.M).toBeCloseTo(0.5, 3);
    expect(pace!.deltas.H).toBeCloseTo(1.2, 3);
    expect(pace!.sessions).toBe(1);
  });

  it('returns null under MIN_PACE_SAMPLE', () => {
    const rows = [
      { driverId: 1, teamId: 1, session: 1, bestLapMs: 80000, bestLapTyre: 2 },
      { driverId: 1, teamId: 1, session: 1, bestLapMs: 80500, bestLapTyre: 1 },
    ];
    const model = makeModel([makeRace({ trackId: 1, state: 2, practice: rows })]);
    expect(getPracticePace(model, 1)).toBeNull();
  });
});

describe('getCompoundCaps', () => {
  it('anchors M/H on the soft median via durability ratios', () => {
    const tyres = Array.from({ length: 4 }, (_, i) => ({
      carId: 1, tyreSetId: i + 1, weekendTyreType: 2, frontLeftWear: 1,
      availabilityState: 0, estimatedLapLifeRemaining: 20,
    }));
    tyres.push(
      { carId: 1, tyreSetId: 10, weekendTyreType: 3, frontLeftWear: 1, availabilityState: 0, estimatedLapLifeRemaining: 90 },
      { carId: 1, tyreSetId: 11, weekendTyreType: 3, frontLeftWear: 1, availabilityState: 0, estimatedLapLifeRemaining: 90 },
      { carId: 1, tyreSetId: 12, weekendTyreType: 4, frontLeftWear: 1, availabilityState: 0, estimatedLapLifeRemaining: 160 },
    );
    const model = makeModel([], { tyres });
    const caps = getCompoundCaps(model);
    expect(caps).not.toBeNull();
    expect(caps!.S).toBe(20);
    expect(caps!.M).toBe(Math.round(20 * (0.65 / 0.43)));
    expect(caps!.H).toBe(Math.round(20 * (1.0 / 0.43)));
    expect(caps!.H).toBeGreaterThanOrEqual(caps!.M);
  });

  it('returns null without fresh soft sets', () => {
    expect(getCompoundCaps(makeModel([], { tyres: [] }))).toBeNull();
  });
});

/* ── the engine end-to-end ───────────────────────────────────────────────── */

describe('buildTyreLab', () => {
  const target = makeRace({ raceId: 50, trackId: 1, state: 0, laps: 30, results: [] });
  const model = makeModel([
    makeRace({ trackId: 1, state: 2, results: fieldResults(1) }),
    target,
  ]);

  it('produces a ranked plan with a 6-field recommendation', () => {
    const result = buildTyreLab(model, 50);
    expect(result.warnings).toHaveLength(0);
    const lab: TyreLab = result.data;
    expect(lab.laps).toBe(30);
    expect(lab.best).not.toBeNull();
    // 30 laps → model envelope: S = round(30 × 0.68 × 0.75) = 15 (min 4)
    expect(lab.lives.S).toBe(Math.max(4, Math.round(30 * 0.68 * 0.75)));
    expect(lab.best!.stints.reduce((s, st) => s + st.laps, 0)).toBe(30);
    expect(lab.best!.pitLaps.length).toBe(lab.best!.stops);
    expect(new Set(lab.best!.order).size).toBeGreaterThanOrEqual(2);

    const rec = result.recommendations[0];
    expect(rec).toBeDefined();
    expect(rec.action.length).toBeGreaterThan(0);
    expect(rec.why.length).toBeGreaterThan(0);
    expect(rec.confidence).toBe('LOW'); // pure model fallback on this fixture
    expect(rec.evidence.length).toBeGreaterThan(0);
    expect(rec.assumptions.length).toBeGreaterThan(0);
    expect(rec.riskIfIgnored).toBeDefined();
  });

  it('ranks alternatives and marks the best plan as vsBest 0', () => {
    const result = buildTyreLab(model, 50);
    const lab = result.data;
    expect(lab.strategies.length).toBeGreaterThan(1);
    expect(lab.strategies[0].vsBestS).toBe(0);
    for (let i = 1; i < lab.strategies.length; i++) {
      expect(lab.strategies[i].timeS).toBeGreaterThanOrEqual(lab.strategies[0].timeS);
    }
  });

  it('is deterministic across calls', () => {
    const a = buildTyreLab(model, 50);
    const b = buildTyreLab(model, 50);
    expect(JSON.stringify(a.data.strategies)).toBe(JSON.stringify(b.data.strategies));
    expect(a.confidence).toBe(b.confidence);
  });

  it('warns on unknown race id', () => {
    const result = buildTyreLab(model, 9999);
    expect(result.warnings[0]).toContain('RACE_NOT_FOUND');
  });
});
