/**
 * Tyre engine unit tests — Phase 1 (docs/05 §9.2: Tyre bắt buộc 100% case chính).
 * Input: hand-built SaveModel (pure engine — no DB, no React).
 * Determinism: same input → same output, always.
 */

import { describe, it, expect } from 'vitest';
import {
  buildTyreLab,
  buildWetPlan,
  evaluateStrategy,
  stintDegPenalty,
  getStintFactor,
  getObservedStops,
  getPracticePace,
  getCompoundCaps,
  getAllocationPace,
  type TyreLab,
} from '@/engines/tyre.engine';
import type { SaveModel, Race, PracticeResult, TyreAllocation, QualifyingResult } from '@/domain/types';
import { emptyPhase2Sections } from '../helpers/model';
import {
  buildSilverstoneModel,
  SILVERSTONE_RACE_ID,
  SILVERSTONE_LAPS,
} from '../helpers/silverstone-fixture';

/** Ranking deltas of the Silverstone fixture after step 1 (M practice
 * 0.711, H allocation 0.89) — mirrored here for direct plan evaluation. */
const SILVERSTONE_DELTAS = { S: 0, M: 0.71, H: 0.89 } as const;

/* ── helpers to build a minimal SaveModel ────────────────────────────────── */

let nextRaceId = 1000;

/** v0.7.0 — one S-only practice session (3 drivers): satisfies the strategy
 * data gate's practice condition WITHOUT measuring M/H (MIN_PACE_SAMPLE
 * needs M/H rows) — ranking deltas stay on the model constants, exactly
 * like real saves where practice ran but the off-pace compounds were
 * under-sampled. */
function sOnlyPractice(): PracticeResult[] {
  return [
    prow2(1, 1, 91_500, 2),
    prow2(2, 1, 91_700, 2),
    prow2(3, 1, 91_900, 2),
  ];
}

function prow2(driverId: number, session: number, bestLapMs: number, bestLapTyre: number): PracticeResult {
  return { driverId, teamId: (driverId % 2) + 1, session, bestLapMs, bestLapTyre };
}

/** v0.7.0 — minimal F1 qualifying (one stage, RaceFormula = 1) so the grid
 * derivation reports a real grid and the data gate opens. */
function readyQuali(n = 6): QualifyingResult[] {
  return Array.from({ length: n }, (_, i) => ({
    driverId: i + 1,
    driverName: `Driver ${i + 1}`,
    teamId: (i % 2) + 1,
    finishingPos: i + 1,
    stage: 1,
    raceFormula: 1,
  }));
}

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
  it('matches the base+cliff closed form at known points (v0.6.1 cliff)', () => {
    // base: DEG_FINAL × (laps/3) × frac²; cliff: DEG_CLIFF × overflow²
    // S 11/14: overflow 11 − 0.6×14 = 3.2 → 0.03×3.2² = 0.307
    expect(stintDegPenalty('S', 11, 14)).toBeCloseTo(
      3.0 * (11 / 3) * Math.pow(11 / 14, 2) + 0.03 * Math.pow(11 - 0.6 * 14, 2), 6,
    );
    // M 19/22: overflow 19 − 13.2 = 5.8 → 0.02×5.8² = 0.673
    expect(stintDegPenalty('M', 19, 22)).toBeCloseTo(
      2.0 * (19 / 3) * Math.pow(19 / 22, 2) + 0.02 * Math.pow(19 - 0.6 * 22, 2), 6,
    );
    // H 35/43: overflow 35 − 0.6×43 = 9.2 → 0.55×9.2² = 46.55 (v0.6.3
    // retune: the real save life is 43 — the old life 53 was ratio-derived,
    // which let 5.0×3.2² look sane while the real overflow priced H35 at 446s)
    expect(stintDegPenalty('H', 35, 43)).toBeCloseTo(
      3.0 * (35 / 3) * Math.pow(35 / 43, 2) + 0.55 * Math.pow(35 - 0.6 * 43, 2), 6,
    );
    // under the cliff threshold: base only
    expect(stintDegPenalty('S', 0, 14)).toBe(0);
    expect(stintDegPenalty('M', 20, 35)).toBeCloseTo(2.0 * (20 / 3) * Math.pow(20 / 35, 2), 6);
  });
});

describe('evaluateStrategy', () => {
  it('finds the hand-computed optimum (S→M split 11/19, 1 stop, 48.26s incl. cliff)', () => {
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
    // v0.6.1: 47.39 pre-cliff + cliffS(11,14) 0.307 + cliffM(19,22) 0.673
    expect(result!.timeS).toBeCloseTo(48.26, 1);
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
    /* v0.6.2 mapping: WeekendTyreType 1 = M, 0 = H (3/4 are Inter/Wet). */
    tyres.push(
      { carId: 1, tyreSetId: 10, weekendTyreType: 1, frontLeftWear: 1, availabilityState: 0, estimatedLapLifeRemaining: 90 },
      { carId: 1, tyreSetId: 11, weekendTyreType: 1, frontLeftWear: 1, availabilityState: 0, estimatedLapLifeRemaining: 90 },
      { carId: 1, tyreSetId: 12, weekendTyreType: 0, frontLeftWear: 1, availabilityState: 0, estimatedLapLifeRemaining: 160 },
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
  const target = makeRace({
    raceId: 50, trackId: 1, state: 0, laps: 30, results: [],
    practice: sOnlyPractice(), qualifying: readyQuali(),
  });
  const model = makeModel(
    [
      makeRace({ trackId: 1, state: 2, results: fieldResults(1) }),
      target,
    ],
    {
      /* v0.7.0 — the gate needs the weekend allocation; the fresh-set
         medians mirror the 30-lap envelope (15/23/27) so the lives
         assertions below keep their model-envelope values. */
      tyres: [
        ...[1, 2, 3].map((i) => ({ carId: 1, tyreSetId: i, weekendTyreType: 2, frontLeftWear: 1, availabilityState: 0, estimatedLapLifeRemaining: 15 })),
        ...[1, 2, 3].map((i) => ({ carId: 1, tyreSetId: 10 + i, weekendTyreType: 1, frontLeftWear: 1, availabilityState: 0, estimatedLapLifeRemaining: 23 })),
        ...[1, 2].map((i) => ({ carId: 1, tyreSetId: 20 + i, weekendTyreType: 0, frontLeftWear: 1, availabilityState: 0, estimatedLapLifeRemaining: 27 })),
      ],
    },
  );

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
    qualifying: readyQuali(),
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

  it('ranks S→S→M best on measured deltas: 81.2s, pits [17,34]; S→H never best', () => {
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
    // v0.6.1: 80.9 pre-cliff + cliffS(17,25)×2 + cliffS... new optimum S17/S17/M19
    expect(best.timeS).toBeCloseTo(81.2, 1);
    expect(best.pitLaps).toEqual([17, 34]);

    // S→H sits far below the best plan — verify the plan time directly; with
    // honest deltas it no longer even makes top 6 (v0.6.1 cliff included).
    const sh = evaluateStrategy(['S', 'H'], 53, { S: 25, M: 38, H: 58 }, { S: 0, M: 1.09, H: 1.76 }, 20.7);
    expect(sh!.timeS).toBeCloseTo(102.6, 1);
    expect(best.order.join('→')).not.toBe('S→H');
  });
});

describe('v0.5.1 same-tier fallback (Rule 2)', () => {
  it('never ranks measured M against model H — S→H stays far behind (best S→S→M 70.4s)', () => {
    // One session: M measured (+0.72 vs S), H has ZERO practice samples.
    // Without Rule 2 the model H constant (+1.05) beats measured M (+0.72)
    // and the plan flips to nonsense S→H — the Suzuka failure mode.
    const rows = [
      prow(1, 1, 91671, 2), prow(2, 1, 91721, 2), prow(3, 1, 91771, 2),
      prow(4, 1, 92394, 1), prow(5, 1, 92444, 1), prow(6, 1, 92494, 1),
    ];
    const target = makeRace({ raceId: 301, trackId: 17, trackName: 'Suzuka', state: 0, laps: 53, practice: rows, qualifying: readyQuali() });
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
    // v0.6.1: the cliff makes the 2-stop S→S→M (S16/S16/M21, 70.4s) beat the
    // 1-stop S→M (71.0s) — the Rule-2 intent is untouched: S→H must NOT win.
    expect(best.order.join('→')).toBe('S→S→M');
    expect(best.timeS).toBeCloseTo(70.4, 1);
    // Owner's direct check: with the SAME-TIER model deltas S→H costs 79.5s
    // (evaluate directly — the ranked top-6 is all faster plans now).
    const sh = evaluateStrategy(['S', 'H'], 53, { S: 25, M: 38, H: 58 }, { S: 0, M: 0.55, H: 1.05 }, 20.7);
    expect(sh!.timeS).toBeCloseTo(79.5, 1);
  });

  it('does not trigger when both compounds are measured (even cross-session)', () => {
    const target = makeRace({
      raceId: 302, trackId: 17, trackName: 'Suzuka', state: 0, laps: 53,
      practice: suzukaPracticeRows(),
      qualifying: readyQuali(),
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
    /* v0.7.0 data gate: a completed race is NEVER ready — its allocation
       rows are wiped post-race, so re-computing a model-only plan and
       presenting it as a recommendation is exactly the Monza bug the spec
       bans. Lives/deltas/evidence stay; the plan does not. */
    expect(data.readiness.ready).toBe(false);
    expect(data.best).toBeNull();
    expect(data.strategies).toHaveLength(0);
    expect(data.gamePlan).toBeNull();
    expect(lab.recommendations).toHaveLength(0);
    expect(lab.confidence).toBe('LOW');
    expect(lab.warnings).toContain('RACE_ALREADY_COMPLETED');
    expect(lab.warnings).toContain('STRATEGY_NOT_READY');
  });
});

describe('v0.5.1 confidence gates', () => {
  const practice = suzukaPracticeRows(); // M + H both measured
  const target = makeRace({
    raceId: 420, trackId: 17, trackName: 'Suzuka', state: 0, laps: 53, practice,
    qualifying: readyQuali(),
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
    // v0.6.1 honest re-grade: 1 track sample (< 3) + plan below field = 2
    // missing pillars → LOW (was MEDIUM); the warning itself is unchanged.
    expect(lab.confidence).toBe('LOW');
  });
});

describe('v0.5.1 track-correction prior (P2, local IndexedDB)', () => {
  const target = makeRace({
    raceId: 450, trackId: 17, trackName: 'Suzuka', state: 0, laps: 53,
    practice: suzukaPracticeRows(),
    qualifying: readyQuali(),
  });

  it('caps at MEDIUM + warns when the plan pits less than the prior field average', () => {
    const lab = buildTyreLab(
      makeModel([target], { tyres: allocLives25_38_58() }),
      450,
      { prior: { predictedStops: 1, fieldAvgStops: 2.5, predictedPitLap: 19 } },
    );
    expect(lab.warnings).toContain('PLAN_BELOW_FIELD_STOPS_PRIOR');
    // v0.6.1 honest re-grade: 0 stint samples + plan below prior = 2 missing
    // pillars → LOW (was MEDIUM); warning + evidence assertions unchanged.
    expect(lab.confidence).toBe('LOW');
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

/* ── v0.6.1 step 1: a forced delta never masquerades as a measurement ──────
 * Silverstone 2027 (race 199, 52 laps): practice noise measured H (+0.606
 * raw, Russell long-run) faster than M (+0.711). The old engine silently
 * forced H to M+0.15 = +0.861 while STILL labelling it "practice" — the
 * evidence lied. Now: paceSource.H becomes 'allocation' (the game's own
 * EstimatedLapTime estimate) or 'clamped' (forced, labelled), and the raw
 * value stays on the record. */

describe('v0.6.1 getAllocationPace (EstimatedLapTime)', () => {
  it('derives game-nominal deltas from fresh sets: S 88.91 / M +0.57 / H +0.89', () => {
    const pace = getAllocationPace(buildSilverstoneModel());
    expect(pace).not.toBeNull();
    expect(pace!.lapTime).toEqual({ S: 88.91, M: 89.48, H: 89.8 });
    expect(pace!.deltas).toEqual({ S: 0, M: 0.57, H: 0.89 });
    expect(pace!.samples).toEqual({ S: 3, M: 3, H: 3 });
  });

  it('returns null when any dry compound lacks a fresh EstimatedLapTime', () => {
    expect(getAllocationPace(buildSilverstoneModel({ withoutEstimatedLapTime: true }))).toBeNull();
  });
});

/* ── v0.6.2: WeekendTyreType mapping 0=H, 1=M, 2=S, 3=I, 4=W ───────────────
 * v0.6.1 ranked H at +16.45s because the engine (and every fixture) read
 * the allocation through the WRONG repo comment "0=W,1=I,2=S,3=M,4=H" —
 * the Silverstone "M" median was Inter 95.32 and "H" was Wet 105.35. The
 * Silverstone fixture now carries the FULL real-save allocation (Inter/Wet
 * beside the dry compounds), so a mapping regression cannot pass silently:
 * with the old mapping M reads 95.32 and this block fails on values. */

describe('v0.6.2 WeekendTyreType mapping (verified on the Silverstone save)', () => {
  it('ranks dry compounds by types 0/1/2 even with Inter/Wet sets present', () => {
    const pace = getAllocationPace(buildSilverstoneModel());
    expect(pace).not.toBeNull();
    expect(pace!.lapTime).toEqual({ S: 88.91, M: 89.48, H: 89.8 });
    expect(pace!.deltas).toEqual({ S: 0, M: 0.57, H: 0.89 });
    expect(pace!.samples).toEqual({ S: 3, M: 3, H: 3 });
  });

  it('reads M/H life caps from types 1/0 — never the Inter/Wet medians', () => {
    const caps = getCompoundCaps(buildSilverstoneModel());
    // v0.6.3: medians of the real save — M 34 / H 43 (53 was ratio-derived)
    expect(caps).toEqual({ S: 23, M: 34, H: 43 });
  });

  it('wet lives come from types 3/4 (I 48 / W 62 medians of the real save)', () => {
    const model = buildSilverstoneModel();
    model.races = model.races.map((r) =>
      r.raceId === SILVERSTONE_RACE_ID ? { ...r, weather: { raceRain: true } } : r,
    );
    const lab = buildTyreLab(model, SILVERSTONE_RACE_ID);
    expect(lab.data.wet).not.toBeNull();
    expect(lab.data.wet!.rainLikely).toBe(true);
    expect(lab.data.wet!.intersLifeLaps).toBe(48);
    expect(lab.data.wet!.wetLifeLaps).toBe(62);
    expect(lab.data.wet!.source).toBe('allocation');
  });

  it('buildWetPlan uses I = median type 3, W = median type 4', () => {
    const model = buildSilverstoneModel();
    const plan = buildWetPlan(model, SILVERSTONE_LAPS);
    expect(plan).not.toBeNull();
    expect(plan!.lives).toEqual({ I: 48, W: 62 });
    expect(plan!.source).toBe('allocation');
  });
});

describe('v0.6.1 getPracticePace raw + clamped flags (Silverstone)', () => {
  it('records the raw +0.606 H delta and flags the monotonic clamp', () => {
    const model = buildSilverstoneModel();
    const pace = getPracticePace(model, 210);
    expect(pace).not.toBeNull();
    expect(pace!.sessions).toBe(1);
    expect(pace!.rawDeltas.M).toBeCloseTo(0.711, 3);
    expect(pace!.rawDeltas.H).toBeCloseTo(0.606, 3);
    expect(pace!.clamped.H).toBe(true);
    // the ranking value is the forced M+0.15 — but no longer labelled raw
    expect(pace!.deltas.H).toBeCloseTo(0.861, 3);
  });

  it('does not flag the clamp when H is honestly slower than M (Suzuka)', () => {
    const model = makeModel([makeRace({ trackId: 17, state: 0, practice: suzukaPracticeRows() })]);
    const pace = getPracticePace(model, 17);
    expect(pace!.clamped.H).toBe(false);
    expect(pace!.clamped.M).toBe(false);
    expect(pace!.rawDeltas.H).toBeCloseTo(pace!.deltas.H as number, 6);
  });
});

describe('v0.6.1 buildTyreLab — Silverstone forced-delta honesty', () => {
  it('ranks H by the allocation estimate and keeps the raw +0.606 on record', () => {
    const lab = buildTyreLab(buildSilverstoneModel(), SILVERSTONE_RACE_ID);
    const data: TyreLab = lab.data;

    // lives straight from the save's allocation (v0.6.3 real medians)
    expect(data.lives).toEqual({ S: 23, M: 34, H: 43 });
    expect(data.lifeSource).toEqual({ S: 'allocation', M: 'allocation', H: 'allocation' });
    expect(data.practiceSessions).toBe(1);

    // M keeps its honest practice measurement
    expect(data.deltas.M).toBeCloseTo(0.71, 2);
    expect(data.paceSource.M).toBe('practice');
    expect(data.paceMeasured.M).toEqual({ delta: expect.closeTo(0.711, 3), source: 'session' });

    // H: the forced value is replaced by the game's own estimate
    expect(data.paceSource.H).toBe('allocation');
    expect(data.deltas.H).toBeGreaterThanOrEqual(0.85);
    expect(data.deltas.H).toBeLessThanOrEqual(0.9);
    expect(data.paceMeasured.H).toEqual({
      delta: expect.closeTo(0.606, 3),
      source: 'session',
      rawDelta: expect.closeTo(0.606, 3),
    });

    // the evidence tells the truth: raw value + forced source, never "(practice)"
    const paceEvidence = lab.evidence.find((e) => e.source === 'Races_PracticeResults');
    expect(paceEvidence).toBeDefined();
    expect(paceEvidence!.label).toContain('+0.606');
    expect(paceEvidence!.label).toContain('allocation');
    expect(paceEvidence!.label).toContain('không dùng được');
    expect(paceEvidence!.label).not.toMatch(/H \+0\.\d+s \(practice\)/);
    expect(lab.assumptions.some((a) => a.text.includes('allocation của game'))).toBe(true);
    // v0.6.2: the assumption quotes the REAL dry-compound estimates
    expect(lab.assumptions.some((a) => a.text.includes('(88.91 / 89.48 / 89.80s)'))).toBe(true);
    expect(lab.warnings).toContain('PACE_DELTA_FORCED');
    expect(lab.confidence).not.toBe('HIGH');
  });

  it("falls back to the labelled 'clamped' value when no allocation estimate exists", () => {
    const lab = buildTyreLab(
      buildSilverstoneModel({ withoutEstimatedLapTime: true }),
      SILVERSTONE_RACE_ID,
    );
    const data: TyreLab = lab.data;
    expect(data.paceSource.H).toBe('clamped');
    expect(data.deltas.H).toBeCloseTo(0.86, 2); // the forced M + 0.15
    expect(data.paceMeasured.H).toEqual({
      delta: expect.closeTo(0.606, 3),
      source: 'session',
      rawDelta: expect.closeTo(0.606, 3),
    });
    const paceEvidence = lab.evidence.find((e) => e.source === 'Races_PracticeResults');
    expect(paceEvidence!.label).toContain('+0.606');
    expect(paceEvidence!.label).toContain('(model —');
    expect(paceEvidence!.label).not.toMatch(/H \+0\.\d+s \(practice\)/);
    expect(lab.warnings).toContain('PACE_DELTA_FORCED');
  });

  it('leaves honest measurements untouched (Suzuka H 1.76 stays practice-ranked)', () => {
    const target = makeRace({
      raceId: 302, trackId: 17, trackName: 'Suzuka', state: 0, laps: 53,
      practice: suzukaPracticeRows(),
      qualifying: readyQuali(),
    });
    const lab = buildTyreLab(makeModel([target], { tyres: allocLives25_38_58() }), 302);
    expect(lab.data.paceSource.H).toBe('cross-session');
    expect(lab.warnings).not.toContain('PACE_DELTA_FORCED');
  });
});

/* ── v0.6.1 step 2: the tyre cliff — long stints past 60% life get expensive
 * Ricciardo's real Silverstone H35 stint ran ~94.5s/lap (≈ +3s vs the
 * winner) while the model priced the whole 35-lap stint at 9.2s of wear.
 * The cliff (DEG_CLIFF × overflow², threshold 0.6×life) plus the retuned
 * DEG_FINAL.H make S→H collapse; the Bahrain ranking must not move. */

import { buildBahrainModel, BAHRAIN_RACE_ID } from '../helpers/bahrain-fixture';

describe('v0.6.1 cliff — Silverstone (race 199, 52 laps, lives 23/34/43)', () => {
  const lab = buildTyreLab(buildSilverstoneModel(), SILVERSTONE_RACE_ID);
  const data: TyreLab = lab.data;

  it('prices the H 35-lap stint in the realistic 50–90s band (v0.6.3: ~70s)', () => {
    // real life 43 → overflow 9.2 laps past the 0.6×43 cliff; the old
    // life 53 (ratio-derived) let 5.0 price this stint at 446s
    const deg = stintDegPenalty('H', 35, 43);
    expect(deg).toBeGreaterThanOrEqual(50);
    expect(deg).toBeLessThanOrEqual(90);
  });

  it('costs Ricciardo\u2019s S(17)→H(35) ≥ 100s in model time', () => {
    const total =
      SILVERSTONE_DELTAS.H * 35 +
      stintDegPenalty('S', 17, 23) +
      stintDegPenalty('H', 35, 43) +
      20.7;
    expect(total).toBeGreaterThanOrEqual(100);
  });

  it('suggests S→M→S (the game\u2019s order) — never S→H — with the lowest model total', () => {
    expect(data.best).not.toBeNull();
    expect(data.best!.order.join('→')).toBe('S→M→S');
    for (const s of data.strategies) {
      expect(s.timeS).toBeGreaterThanOrEqual(data.best!.timeS);
    }
    // the optimizer's best S→H (any split) sits clearly behind: ≥ 83s total
    // and ≥ 7s slower than the suggestion (v0.6.3 audit: S23+H29 = 90.9s)
    const sh = evaluateStrategy(
      ['S', 'H'], SILVERSTONE_LAPS,
      { S: 23, M: 34, H: 43 }, SILVERSTONE_DELTAS, 20.7,
    )!;
    expect(sh.timeS).toBeGreaterThanOrEqual(83);
    expect(sh.timeS).toBeGreaterThan(data.best!.timeS + 7);
  });

  it('keeps the game plan readable and order-matched', () => {
    expect(data.gamePlan).not.toBeNull();
    expect(data.gamePlan!.compounds).toEqual(['S', 'M', 'S']);
    expect(data.gamePlan!.stintLaps).toEqual([15, 20, 17]);
    expect(data.gamePlan!.pitLaps).toEqual([16, 36]);
  });
});

describe('v0.6.3 Bahrain backtest (57 laps, real lives 33/46/59, field 3 stops)', () => {
  const lab = buildTyreLab(buildBahrainModel(), BAHRAIN_RACE_ID);
  const data: TyreLab = lab.data;

  it('keeps S→M best at pit lap 24 (~64.0s with the real lives)', () => {
    expect(data.best!.order.join('→')).toBe('S→M');
    expect(data.best!.pitLaps[0]).toBe(24);
    expect(data.best!.timeS).toBeGreaterThanOrEqual(63);
    expect(data.best!.timeS).toBeLessThan(65);
  });

  it('keeps S→H behind S→M (no cliff needed — H life 59 keeps stints short)', () => {
    const sh = evaluateStrategy(
      ['S', 'H'], 57, { S: 33, M: 46, H: 59 }, { S: 0, M: 0.55, H: 1.05 }, 20.7,
    )!;
    expect(sh.timeS).toBeGreaterThan(data.best!.timeS + 10);
  });

  it('keeps the 2-stop S→S→M alternative behind S→M', () => {
    const ssm = evaluateStrategy(
      ['S', 'S', 'M'], 57, { S: 33, M: 46, H: 59 }, { S: 0, M: 0.55, H: 1.05 }, 20.7,
    )!;
    expect(ssm.timeS).toBeGreaterThan(data.best!.timeS);
  });
});

/* ── v0.6.1 step 3: confidence pillars, the tie rule, game-plan total ──────
 * v0.5.6 rated Silverstone HIGH on four false pillars: a forced delta
 * counted as "measured", the pit check skipped when no observed/prior data
 * existed (expectedStops = 2 was already known!), a 0.0s tie read as a
 * win, and a single practice session passed for depth. */

describe('v0.6.3 confidence + real-save shape (Silverstone)', () => {
  const lab = buildTyreLab(buildSilverstoneModel(), SILVERSTONE_RACE_ID);

  it('drops to LOW and names the real reasons', () => {
    expect(lab.confidence).toBe('LOW');
    const summary = lab.assumptions.find((a) => a.text.startsWith('Confidence LOW:'));
    expect(summary).toBeDefined();
    // 1. the forced delta
    expect(summary!.text).toContain('delta H bị ép');
    // 2. the ranking deltas are not both practice-measured (H = allocation)
    expect(summary!.text).toContain('chưa đủ cả M và H từ practice');
    // 3. a single practice session with an allocation mismatch > 0.2s
    expect(summary!.text).toContain('1 session');
    // v0.6.3: with the REAL lives the first different-multiset plan is
    // S→S→H at +3.3s — pillar (g) passes, so the summary carries no tie
    // reason anymore (the 'hòa' wording lives in the why's alternative
    // tail — asserted below and in the v0.6.2 exact-tie block).
    expect(summary!.text).not.toContain('hòa');
    expect(lab.warnings).not.toContain('PLAN_BELOW_FIELD_STOPS');
  });

  it('why names the tie and the game plan carries its modelled total', () => {
    const rec = lab.recommendations[0];
    expect(rec.why).toContain('hòa');
    // v0.6.2: "chậm hơn 0.0s" must never appear — a 0.0s alternative is a tie
    expect(rec.why).not.toContain('chậm hơn 0.0s');
    const data = lab.data;
    expect(data.gamePlan).not.toBeNull();
    expect(data.gamePlan!.totalTimeS).toBeGreaterThan(0);
    // the why always quotes the game plan's web-modelled cost
    expect(rec.why).toContain(`tốn ${data.gamePlan!.totalTimeS.toFixed(1)}s`);
    // game plan = S→M→S 15/20/17 pit 16/36 — same ORDER as the suggestion
    expect(data.gamePlan!.compounds).toEqual(['S', 'M', 'S']);
    expect(data.best!.order.join('→')).toBe('S→M→S');
  });

  it('keeps the web optimum S(16)→M(21)→S(15) — no tie rule on the real lives', () => {
    /* v0.6.3 real-save shape: the top 3 plans are exact 0.0s permutations
       of the same stint multiset {S16,S15,M21} (not rivals by planKey), and
       the first different multiset is 3.3s behind — isTie is false, so the
       tie-preference note ("ưu tiên plan của game") must NOT appear; the
       web's optimal split stays the recommendation. The game plan itself is
       only 0.2s behind — quoted in the why via the gamePlan total. */
    const rec = lab.recommendations[0];
    expect(rec.title).toContain('S(16) → M(21) → S(15)');
    expect(rec.why).toContain('kế hoạch kế tiếp');
    expect(rec.why).toContain('hòa (cùng tổng thời gian mô hình)');
    expect(rec.why).not.toContain('ưu tiên');
    expect(lab.data.best!.pitLaps).toEqual([16, 37]);
  });
});

/* ── v0.6.2: the alternative sentence never says "chậm hơn 0.0s" ───────────
 * Real-save Silverstone: the ranked #2 is S→S→M — a permutation of the
 * suggested S→M→S with vsBestS exactly 0.0 — so the why read
 * "kế hoạch kế tiếp (S→S→M) chậm hơn 0.0s". isTie stays false there (the
 * first DIFFERENT plan, S→M 1-stop, is 4.2s behind) so the tieNote does
 * not cover it. The fixture itself ties at 1.7s, so this block widens
 * the gap (H allocation estimate 90.00s → H delta +1.09) to reproduce
 * the real-save shape: permutations on top, first different plan ≥ 2s. */

describe('v0.6.2 why wording — exact-tie alternative (real-save shape)', () => {
  const model = buildSilverstoneModel();
  model.tyres = model.tyres.map((t) =>
    t.weekendTyreType === 0 && t.estimatedLapTimeS != null
      ? { ...t, estimatedLapTimeS: 90.0 }
      : t,
  );
  const lab = buildTyreLab(model, SILVERSTONE_RACE_ID);

  it('writes "hòa (cùng tổng thời gian mô hình)" for the 0.0s permutation', () => {
    const rec = lab.recommendations[0];
    const data = lab.data;
    // the scenario really is: permutation at 0.0 on top, different plan ≥ 2s
    expect(data.best!.order.join('→')).toBe('S→M→S');
    expect(data.strategies[1].vsBestS).toBe(0);
    expect(rec.why).toContain('hòa (cùng tổng thời gian mô hình)');
    expect(rec.why).not.toContain('chậm hơn 0.0s');
    expect(rec.why).not.toContain('chậm hơn 0.0');
  });
});

describe('v0.6.3 Bahrain confidence — LOW on the real save (not the old MEDIUM)', () => {
  const lab = buildTyreLab(buildBahrainModel(), BAHRAIN_RACE_ID);

  it('drops to LOW: model deltas (no practice) + 1-pit plan under the 3-stop field', () => {
    /* v0.6.3: the REAL save's meta field reference is 3 stops (the old
       fixture's 1-stop history under-reported it, and the M/H lives were
       ratio-derived 50/77 — both fixed). Ranking unchanged (S→M best),
       but two pillars now fail: (b) no practice measured and (h) the 1-pit
       plan sits below the field's 3. */
    expect(lab.confidence).toBe('LOW');
    const summary = lab.assumptions.find((a) => a.text.startsWith('Confidence LOW:'));
    expect(summary).toBeDefined();
    expect(summary!.text).toContain('chưa đủ cả M và H từ practice');
    expect(summary!.text).toContain('1 pit < mặt bằng 3 pit');
    expect(lab.warnings).toContain('PLAN_BELOW_FIELD_STOPS');
    expect(lab.data.expectedStops).toBe(3);
    expect(lab.data.expectedSource).toBe('meta');
    expect(lab.data.best!.stops).toBe(1);
    expect(lab.data.best!.pitLaps[0]).toBe(24);
  });
});

describe('v0.6.1 pillar (h) — meta expectedStops joins the field-reference chain', () => {
  /* Synthetic 2-stop variant (the real save runs 3 — covered by the default
     fixture above): the engine KNOWS the field reference even with no
     observed/prior data, so the 1-pit best plan is flagged instead of
     silently passing (the Silverstone v0.5.6 hole). */
  const lab = buildTyreLab(buildBahrainModel(2), BAHRAIN_RACE_ID);

  it('warns + drops confidence when the 1-pit plan sits below the meta field reference', () => {
    expect(lab.data.expectedStops).toBe(2);
    expect(lab.data.expectedSource).toBe('meta');
    expect(lab.data.best!.stops).toBe(1);
    expect(lab.warnings).toContain('PLAN_BELOW_FIELD_STOPS');
    expect(lab.assumptions.some((a) => a.text.includes('ít pit hơn mặt bằng'))).toBe(true);
    const summary = lab.assumptions.find((a) => a.text.startsWith('Confidence LOW:'));
    expect(summary!.text).toContain('1 pit < mặt bằng 2 pit');
  });
});
