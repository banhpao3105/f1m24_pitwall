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
  getObservedStops,
  getPracticePace,
  getCompoundCaps,
  type TyreLab,
} from '@/engines/tyre.engine';
import type { SaveModel, Race, PracticeResult, TyreAllocation } from '@/domain/types';
import { emptyPhase2Sections } from '../helpers/model';

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
    ...emptyPhase2Sections(),
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

/* ── v0.5.1 P0: cross-session pace + same-tier ranking (Suzuka 2027 bug) ── */

/** One practice row = one driver's best lap on that compound/session. */
function prow(
  driverId: number,
  session: number,
  bestLapMs: number,
  bestLapTyre: number,
): PracticeResult {
  return { driverId, teamId: 1, session, bestLapMs, bestLapTyre };
}

/**
 * Practice structure mirroring the REAL Suzuka 2027 weekend (F1M 24 1.11.0
 * save, owner-verified): S sampled heavily; M ≥3 drivers in two sessions;
 * H only 2 drivers per session (4 distinct total) — the shape that used to
 * hide the true +1.76s hard-tyre penalty behind the model constant.
 */
function suzukaPracticeRows(): PracticeResult[] {
  let d = 0;
  const rows: PracticeResult[] = [];
  const push = (n: number, session: number, fastestMs: number, tyre: number) => {
    for (let i = 0; i < n; i++) rows.push(prow(++d, session, fastestMs + i * 50, tyre));
  };
  push(13, 1, 91671, 2); // S session 1
  push(7, 1, 92394, 1); // M session 1 (7 drivers — session-eligible)
  push(2, 1, 92214, 0); // H session 1 (2 drivers — under-sampled)
  push(19, 2, 90450, 2); // S session 2 (fastest overall)
  push(3, 2, 91917, 1); // M session 2 (exactly MIN_PACE_SAMPLE)
  push(18, 3, 90756, 2); // S session 3
  push(2, 3, 92355, 0); // H session 3 (2 drivers)
  push(2, 3, 91095, 1); // M session 3 (2 drivers — under-sampled)
  return rows;
}

/** Fresh allocation whose medians give lives S25/M38/H58 (real save0 shape). */
function allocLives25_38_58(): TyreAllocation[] {
  const sets: TyreAllocation[] = [];
  let id = 0;
  const add = (n: number, type: number, life: number) => {
    for (let i = 0; i < n; i++) {
      sets.push({
        carId: 1,
        tyreSetId: ++id,
        weekendTyreType: type,
        frontLeftWear: 1,
        availabilityState: 0,
        estimatedLapLifeRemaining: life,
      });
    }
  };
  add(4, 2, 25); // S
  add(2, 3, 38); // M
  add(2, 4, 58); // H
  return sets;
}

describe('v0.5.1 cross-session pace (P0 Suzuka bug)', () => {
  const target = makeRace({
    raceId: 300,
    trackId: 17,
    trackName: 'Suzuka',
    state: 0,
    laps: 53,
    practice: suzukaPracticeRows(),
  });

  it('measures H cross-session when every session is under-sampled (Rule 1)', () => {
    const pace = getPracticePace(makeModel([target]), 17);
    expect(pace).not.toBeNull();
    expect(pace!.deltas.M).toBeCloseTo(1.095, 3); // median of session gaps
    expect(pace!.measured.M).toBe('session');
    expect(pace!.deltas.H).toBeCloseTo(1.764, 3); // 92.214 − 90.450 (owner's number)
    expect(pace!.measured.H).toBe('cross-session');
  });

  it('keeps H unmeasured with only 2 distinct drivers across sessions', () => {
    const rows = [
      prow(1, 1, 91671, 2), prow(2, 1, 91721, 2), prow(3, 1, 91771, 2),
      prow(4, 1, 92394, 1), prow(5, 1, 92444, 1), prow(6, 1, 92494, 1),
      prow(100, 1, 92214, 0), // H — 1st driver
      prow(101, 2, 92355, 0), // H — 2nd distinct driver only
    ];
    const pace = getPracticePace(makeModel([makeRace({ trackId: 17, state: 0, practice: rows })]), 17);
    expect(pace!.deltas.M).not.toBeNull();
    expect(pace!.deltas.H).toBeNull();
    expect(pace!.measured.H).toBeNull();
  });

  it('ranks S→S→M best on measured deltas: 80.9s, pits [18,36]; S→H never best', () => {
    const lab = buildTyreLab(makeModel([target], { tyres: allocLives25_38_58() }), 300);
    const data: TyreLab = lab.data;
    expect(data.lives).toEqual({ S: 25, M: 38, H: 58 });
    expect(data.deltas).toEqual({ S: 0, M: 1.09, H: 1.76 });
    expect(data.paceSource.M).toBe('practice');
    expect(data.paceSource.H).toBe('cross-session');
    expect(data.sameTierFallback).toBe(false);

    const best = data.best!;
    expect(best.order.join('→')).toBe('S→S→M');
    expect(best.stops).toBe(2);
    expect(best.timeS).toBeCloseTo(80.9, 1);
    expect(best.pitLaps).toEqual([18, 36]);

    const byOrder = (o: string) =>
      data.strategies.find((s) => s.order.join('→') === o);
    expect(byOrder('S→M')!.timeS).toBeCloseTo(85.3, 1);
    // S→H sits far below the best plan (owner's number: 97.6s) — verify the
    // plan time directly; with honest deltas it no longer even makes top 6.
    const sh = evaluateStrategy(['S', 'H'], 53, { S: 25, M: 38, H: 58 }, { S: 0, M: 1.09, H: 1.76 }, 20.7);
    expect(sh!.timeS).toBeCloseTo(97.6, 1);
    expect(best.order.join('→')).not.toBe('S→H');
  });
});

describe('v0.5.1 same-tier fallback (Rule 2)', () => {
  it('never ranks measured M against model H — best flips to S→M 68.2s', () => {
    // One session: M measured (+0.72 vs S), H has ZERO practice samples.
    // Without Rule 2 the model H constant (+1.05) beats measured M (+0.72)
    // and the plan flips to nonsense S→H 74.4s — the Suzuka failure mode.
    const rows = [
      prow(1, 1, 91671, 2), prow(2, 1, 91721, 2), prow(3, 1, 91771, 2),
      prow(4, 1, 92394, 1), prow(5, 1, 92444, 1), prow(6, 1, 92494, 1),
    ];
    const target = makeRace({ raceId: 301, trackId: 17, trackName: 'Suzuka', state: 0, laps: 53, practice: rows });
    const lab = buildTyreLab(makeModel([target], { tyres: allocLives25_38_58() }), 301);
    const data = lab.data;

    expect(data.sameTierFallback).toBe(true);
    expect(data.deltas.M).toBe(0.55); // model constants for BOTH (fair ranking)
    expect(data.deltas.H).toBe(1.05);
    expect(data.paceSource.M).toBe('model');
    expect(data.paceSource.H).toBe('model');
    expect(data.paceMeasured.M).toEqual({ delta: expect.closeTo(0.723, 3), source: 'session' });
    expect(data.paceMeasured.H).toBeNull();
    expect(lab.warnings).toContain('SAME_TIER_PACE_FALLBACK');
    // measured value stays visible in the evidence
    expect(lab.evidence.some((e) => e.label.includes('+0.72'))).toBe(true);
    expect(lab.assumptions.some((a) => a.text.includes('chưa được đo'))).toBe(true);

    const best = data.best!;
    expect(best.order.join('→')).toBe('S→M');
    expect(best.timeS).toBeCloseTo(68.2, 1);
    // Owner's direct check: with the SAME-TIER model deltas S→H costs 74.4s
    // (evaluate directly — the ranked top-6 is all faster plans now).
    const sh = evaluateStrategy(['S', 'H'], 53, { S: 25, M: 38, H: 58 }, { S: 0, M: 0.55, H: 1.05 }, 20.7);
    expect(sh!.timeS).toBeCloseTo(74.4, 1);
  });

  it('does not trigger when both compounds are measured (even cross-session)', () => {
    const target = makeRace({
      raceId: 302, trackId: 17, trackName: 'Suzuka', state: 0, laps: 53,
      practice: suzukaPracticeRows(),
    });
    const lab = buildTyreLab(makeModel([target], { tyres: allocLives25_38_58() }), 302);
    expect(lab.data.sameTierFallback).toBe(false);
    expect(lab.warnings).not.toContain('SAME_TIER_PACE_FALLBACK');
  });
});

/* ── v0.5.1 P1: honest lives, leave-one-out, strict confidence ──────────── */

describe('v0.5.1 leave-one-out', () => {
  const raceWithStops = makeRace({
    raceId: 400,
    trackId: 17,
    state: 2,
    laps: 53,
    results: fieldResults(400, 22),
    pitStops: Array.from({ length: 44 }, (_, i) => ({
      driverId: (i % 22) + 1,
      teamId: 1,
      lap: 15 + (i % 10),
      durationMs: 23000,
      pitStopId: i + 1,
    })),
  });
  const model = makeModel([raceWithStops]);

  it('getObservedStops can exclude the race being forecast', () => {
    expect(getObservedStops(model, 17)?.avgStopsPerDriver).toBeCloseTo(2.0, 6);
    expect(getObservedStops(model, 17, 400)).toBeNull();
  });

  it('getStintFactor can exclude the race being forecast', () => {
    const self = getStintFactor(model, 17);
    expect(self.source).toBe('track');
    expect(self.samples).toBe(1);
    const excluded = getStintFactor(model, 17, 400);
    expect(excluded.source).toBe('model');
    expect(excluded.samples).toBe(0);
  });
});

describe('v0.5.1 post-race lives (P1 autosave-2 bug)', () => {
  it('envelope lives 27/40/48 on a completed race — no pit-count collapse', () => {
    // The real bug: opening Tyre Lab for the just-completed race shrank
    // lives to S12/M18/H22 (stintFactor 1/(2+1) × envelope). Lives must
    // come from the physical envelope when no weekend allocation applies.
    const completed = makeRace({
      raceId: 410,
      trackId: 17,
      trackName: 'Suzuka',
      state: 2,
      laps: 53,
      practice: [
        // M measured in 2 sessions; H only 2 distinct drivers → unmeasured
        prow(1, 1, 91671, 2), prow(2, 1, 91721, 2), prow(3, 1, 91771, 2),
        prow(4, 1, 92394, 1), prow(5, 1, 92444, 1), prow(6, 1, 92494, 1), prow(7, 1, 92544, 1),
        prow(8, 2, 90450, 2), prow(9, 2, 90500, 2), prow(10, 2, 90550, 2),
        prow(11, 2, 91917, 1), prow(12, 2, 91967, 1), prow(13, 2, 92017, 1),
        prow(100, 1, 92214, 0), prow(101, 3, 92355, 0), // H: 2 distinct total
      ],
      results: fieldResults(410, 22),
      pitStops: Array.from({ length: 44 }, (_, i) => ({
        driverId: (i % 22) + 1,
        teamId: 1,
        lap: 14 + (i % 12),
        durationMs: 23000,
        pitStopId: 500 + i,
      })),
    });
    const lab = buildTyreLab(makeModel([completed]), 410);
    const data = lab.data;

    expect(data.lives).toEqual({ S: 27, M: 40, H: 48 }); // 53 × shape × 0.75
    expect(data.lifeSource).toEqual({ S: 'model', M: 'model', H: 'model' });
    expect(data.sameTierFallback).toBe(true); // M measured, H unmeasured
    expect(data.deltas).toEqual({ S: 0, M: 0.55, H: 1.05 });
    expect(data.expectedStops).toBe(2); // own-race field average = reference
    expect(data.expectedSource).toBe('track');
    expect(data.best!.order.join('→')).toBe('S→M');
    expect(data.best!.timeS).toBeCloseTo(64.7, 1);
    expect(lab.confidence).toBe('MEDIUM'); // never HIGH without allocation
    expect(lab.warnings).toContain('RACE_ALREADY_COMPLETED');
  });
});

describe('v0.5.1 confidence gates', () => {
  const practice = suzukaPracticeRows(); // M + H both measured
  const target = makeRace({
    raceId: 420, trackId: 17, trackName: 'Suzuka', state: 0, laps: 53, practice,
  });
  const history = [1, 2, 3].map((i) =>
    makeRace({
      raceId: 430 + i, trackId: 20 + i, day: 100 + i, state: 2, laps: 50,
      results: fieldResults(430 + i, 6),
      pitStops: Array.from({ length: 12 }, (_, k) => ({
        driverId: (k % 6) + 1, teamId: 1, lap: 10 + k, durationMs: 23000, pitStopId: 600 + i * 100 + k,
      })),
    }),
  );

  it('HIGH only when allocation lives + both deltas measured + ≥3 samples', () => {
    const lab = buildTyreLab(
      makeModel([target, ...history], { tyres: allocLives25_38_58() }),
      420,
    );
    expect(lab.data.lifeSource.S).toBe('allocation');
    expect(lab.data.paceSource.M).toBe('practice');
    expect(lab.data.paceSource.H).toBe('cross-session');
    expect(lab.confidence).toBe('HIGH');
  });

  it('caps at MEDIUM when stint-factor history has < 3 samples', () => {
    const lab = buildTyreLab(makeModel([target], { tyres: allocLives25_38_58() }), 420);
    expect(lab.confidence).toBe('MEDIUM');
    expect(lab.assumptions.some((a) => a.text.includes('Mẫu pit-stop lịch sử'))).toBe(true);
  });

  it('warns when the plan pits less than the field average (rule c)', () => {
    const heavyField = makeRace({
      raceId: 440, trackId: 17, day: 90, state: 2, laps: 53,
      results: fieldResults(440, 22),
      pitStops: Array.from({ length: 55 }, (_, i) => ({
        driverId: (i % 22) + 1, teamId: 1, lap: 12 + (i % 15), durationMs: 23000, pitStopId: 700 + i,
      })),
    });
    const lab = buildTyreLab(
      makeModel([target, heavyField], { tyres: allocLives25_38_58() }),
      420,
    );
    expect(lab.warnings).toContain('PLAN_BELOW_FIELD_STOPS');
    expect(lab.assumptions.some((a) => a.text.includes('ít pit hơn mặt bằng'))).toBe(true);
    expect(lab.confidence).toBe('MEDIUM');
  });
});

describe('v0.5.1 track-correction prior (P2, local IndexedDB)', () => {
  const target = makeRace({
    raceId: 450, trackId: 17, trackName: 'Suzuka', state: 0, laps: 53,
    practice: suzukaPracticeRows(),
  });

  it('caps at MEDIUM + warns when the plan pits less than the prior field average', () => {
    const lab = buildTyreLab(
      makeModel([target], { tyres: allocLives25_38_58() }),
      450,
      { prior: { predictedStops: 1, fieldAvgStops: 2.5, predictedPitLap: 19 } },
    );
    expect(lab.warnings).toContain('PLAN_BELOW_FIELD_STOPS_PRIOR');
    expect(lab.confidence).toBe('MEDIUM');
    expect(lab.assumptions.some((a) => a.text.includes('Lần trước tại'))).toBe(true);
    expect(lab.evidence.some((e) => e.source.includes('track-corrections'))).toBe(true);
  });

  it('does not cap when the plan is at least as pit-heavy as the prior', () => {
    const lab = buildTyreLab(
      makeModel([target], { tyres: allocLives25_38_58() }),
      450,
      { prior: { predictedStops: 1, fieldAvgStops: 2.0, predictedPitLap: 19 } },
    );
    expect(lab.warnings).not.toContain('PLAN_BELOW_FIELD_STOPS_PRIOR');
    // the prior is still on the record as evidence
    expect(lab.evidence.some((e) => e.source.includes('track-corrections'))).toBe(true);
  });
});
