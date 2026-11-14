/**
 * Tyre Engine v1 — Phase 1 flagship (docs/03-ANALYTICS-ENGINES.md §5.3).
 *
 * Question: "Chặng tới chạy lốp nào, mấy pit, pit vòng nào?"
 *
 * Baseline: faithful port of the Gazette v2.2 strategy engine (evidence:
 * constants extracted from the bundled source, A1 §A1.4-§A1.5):
 *   MODEL_STINT_FRACTION  = 0.28                (expected stops ≈ 0.28 × dist)
 *   PHYSICAL_LIFE_FALLBACK = 0.75               (envelope × race distance)
 *   FALLBACK_LIFE_SHAPE   = { S 0.68, M 1.0, H 1.22 }  (vs medium)
 *   FALLBACK_PACE_DELTA   = { S 0, M 0.55, H 1.05 } s/lap vs Soft
 *   FALLBACK_PIT_LANE_LOSS = 18.5 s + 2.2 s stationary
 *   TYRE_DURABILITY       = { S 0.43, M 0.65, H 1.00 } (game ratios)
 *   DEG_FINAL             = { S 3.0, M 2.0, H 1.8 } s/lap at end of life
 *   DEG_EXP = 2 (quadratic wear); MIN_STINT_LAPS = 4; MIN_PACE_SAMPLE = 3
 *
 * Pure functions only: input is the Normalized SaveModel — no React, no DB,
 * no fetch (docs/02 import rules). Output is an EngineResult with
 * confidence + evidence + assumptions; every number is traceable.
 */

import type { Confidence, Evidence, Assumption, Recommendation } from '../domain/provenance';
import type { EngineResult } from '../domain/types';
import type { SaveModel, Race, PlayerStrategySection } from '../domain/types';

/* ── oracle constants (do not change without a changelog entry) ─────────── */

export const MODEL_STINT_FRACTION = 0.28;
export const PHYSICAL_LIFE_FALLBACK = 0.75;
export const FALLBACK_LIFE_SHAPE = { S: 0.68, M: 1.0, H: 1.22 } as const;
export const FALLBACK_PACE_DELTA = { S: 0.0, M: 0.55, H: 1.05 } as const;
export const FALLBACK_PIT_LANE_LOSS = 18.5;
export const PIT_STATIONARY_ESTIMATE = 2.2;
export const MIN_STINT_LAPS = 4;
export const MIN_PACE_SAMPLE = 3;
export const TYRE_DURABILITY = { S: 0.43, M: 0.65, H: 1.0 } as const;
export const DEG_FINAL = { S: 3.0, M: 2.0, H: 1.8 } as const;
export const DEG_EXP = 2.0;

export type Compound = 'S' | 'M' | 'H';
export const DRY: Compound[] = ['S', 'M', 'H'];

/** Allocation WeekendTyreType → compound (oracle-verified encoding). */
export const ALLOC_TYRE: Record<number, Compound | 'I' | 'W'> = {
  2: 'S', 3: 'M', 4: 'H', 1: 'I', 0: 'W',
};

/** Practice BestLapTyre encoding (oracle-verified): 0=H, 1=M, 2=S. */
export const PRACTICE_TYRE: Record<number, Compound> = { 0: 'H', 1: 'M', 2: 'S' };

/* ── math helpers ────────────────────────────────────────────────────────── */

export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Closed form of DEG_FINAL × (laps/life)^EXP summed over a stint (oracle). */
export function stintDegPenalty(
  compound: Compound,
  stintLaps: number,
  life: number,
): number {
  if (!life || life <= 0 || stintLaps <= 0) return 0;
  const frac = Math.min(1, stintLaps / life);
  return DEG_FINAL[compound] * (stintLaps / (DEG_EXP + 1)) * Math.pow(frac, DEG_EXP);
}

/* ── data extraction from the normalized model ──────────────────────────── */

export interface StintFactor {
  factor: number;
  source: 'track' | 'meta' | 'model';
  samples: number;
}

/**
 * Stint fraction (stint laps / race laps) observed from completed races.
 * ratio = 1 / (avgStopsPerDriver + 1) — oracle formula. Track-specific
 * median wins; then save-wide median ("meta"); then the model constant.
 * `excludeRaceId` (v0.5.1 leave-one-out): the race being forecast must
 * never teach the model about itself.
 */
export function getStintFactor(
  model: SaveModel,
  trackId: number,
  excludeRaceId?: number,
): StintFactor {
  const byTrack: Record<number, number[]> = {};
  const all: number[] = [];
  for (const race of model.races) {
    if (race.raceId === excludeRaceId) continue;
    if (race.state !== 2 || race.results.length === 0) continue;
    const stops = race.pitStops?.length ?? 0;
    if (stops === 0) continue;
    const field = race.results.length;
    const avg = stops / field;
    if (avg <= 0) continue;
    const ratio = 1 / (avg + 1);
    (byTrack[race.trackId] ??= []).push(ratio);
    all.push(ratio);
  }
  const trackRatios = byTrack[trackId] ?? [];
  if (trackRatios.length > 0) {
    return {
      factor: median(trackRatios) ?? MODEL_STINT_FRACTION,
      source: 'track',
      samples: trackRatios.length,
    };
  }
  if (all.length > 0) {
    return { factor: median(all) ?? MODEL_STINT_FRACTION, source: 'meta', samples: all.length };
  }
  return { factor: MODEL_STINT_FRACTION, source: 'model', samples: 0 };
}

export interface ObservedStops {
  avgStopsPerDriver: number;
  samples: number; // driver×race observations
}

/** Average stops per driver at this track across completed races. */
export function getObservedStops(
  model: SaveModel,
  trackId: number,
  excludeRaceId?: number,
): ObservedStops | null {
  let totalStops = 0;
  let driverRaces = 0;
  for (const race of model.races) {
    if (race.raceId === excludeRaceId) continue;
    if (race.trackId !== trackId || race.state !== 2) continue;
    const pitStops = race.pitStops ?? [];
    if (pitStops.length === 0 || race.results.length === 0) continue;
    totalStops += pitStops.length;
    driverRaces += race.results.length;
  }
  if (driverRaces === 0) return null;
  return { avgStopsPerDriver: totalStops / driverRaces, samples: driverRaces };
}

export type PaceMeasurement = 'session' | 'cross-session';

export interface PracticePace {
  /** Seconds per lap vs Soft. */
  deltas: { S: 0; M: number | null; H: number | null };
  sessions: number;
  /**
   * How each compound's delta was measured (null = not measured from
   * practice at all — the engine then falls back to model constants).
   * Drives the evidence clock (v0.5.1) and the same-tier ranking rule.
   */
  measured: { M: PaceMeasurement | null; H: PaceMeasurement | null };
}

/**
 * Compound pace deltas from practice best laps at this track (oracle logic):
 * per session, best per compound with ≥ MIN_PACE_SAMPLE drivers; gaps in
 * seconds; median across sessions; sanity-clamped and monotonic.
 *
 * Cross-session rule (v0.5.1 P0, Suzuka 2027 bug): a compound with < 3
 * drivers in EVERY individual session but ≥ MIN_PACE_SAMPLE distinct drivers
 * across all sessions at the track is measured from cross-session bests —
 * the global best lap per compound (fastest vs Soft across all sessions).
 * Oracle-verified on the real save: fastest H 92.214s vs fastest S 90.450s
 * → +1.76s, exactly the owner's hand computation; the previous code dropped
 * H entirely and ranked the model constant (+1.05) against measured M
 * (+1.09), producing the nonsensical S→H / H→S→H plans.
 */
export function getPracticePace(model: SaveModel, trackId: number): PracticePace | null {
  const bySession = new Map<string, Partial<Record<Compound, number>>>();
  /* cross-session accumulators (all sessions, any driver count) */
  const globalBest: Partial<Record<Compound, number>> = {};
  const driversSeen: Partial<Record<Compound, Set<number>>> = {};
  for (const race of model.races) {
    if (race.trackId !== trackId) continue;
    const perSession = new Map<number, Map<Compound, { best: number; drivers: Set<number> }>>();
    for (const p of race.practice ?? []) {
      const compound = PRACTICE_TYRE[p.bestLapTyre];
      if (!compound) continue;
      const laps = p.bestLapMs / 1000; // model ms → seconds
      if (!(laps > 0)) continue;
      (driversSeen[compound] ??= new Set<number>()).add(p.driverId);
      globalBest[compound] = Math.min(globalBest[compound] ?? Infinity, laps);
      const m = perSession.get(p.session) ?? new Map<Compound, { best: number; drivers: Set<number> }>();
      const entry = m.get(compound) ?? { best: Infinity, drivers: new Set<number>() };
      // One best-lap row per driver: keep the fastest.
      if (laps < entry.best) entry.best = laps;
      entry.drivers.add(p.driverId);
      m.set(compound, entry);
      perSession.set(p.session, m);
    }
    for (const [session, m] of perSession) {
      const slot: Partial<Record<Compound, number>> = {};
      for (const c of DRY) {
        const e = m.get(c);
        if (e && e.drivers.size >= MIN_PACE_SAMPLE && e.best < Infinity) {
          slot[c] = e.best;
        }
      }
      if (slot.S != null || slot.M != null || slot.H != null) {
        bySession.set(`${race.raceId}:${session}`, slot);
      }
    }
  }
  if (bySession.size === 0 && Object.keys(globalBest).length === 0) return null;

  const gapsSM: number[] = [];
  const gapsMH: number[] = [];
  const gapsSH: number[] = [];
  let sessionCount = 0;
  for (const s of bySession.values()) {
    let contributed = false;
    if (s.S != null && s.M != null) { gapsSM.push(s.M - s.S); contributed = true; }
    if (s.M != null && s.H != null) { gapsMH.push(s.H - s.M); contributed = true; }
    if (s.S != null && s.H != null) { gapsSH.push(s.H - s.S); contributed = true; }
    if (contributed) sessionCount++;
  }

  const deltas: { S: 0; M: number | null; H: number | null } = { S: 0, M: null, H: null };
  const measured: { M: PaceMeasurement | null; H: PaceMeasurement | null } = {
    M: null, H: null,
  };
  if (sessionCount > 0) {
    const mSM = median(gapsSM);
    const mMH = median(gapsMH);
    const mSH = median(gapsSH);
    if (mSM != null) { deltas.M = mSM; measured.M = 'session'; }
    else if (mSH != null && mMH != null) { deltas.M = mSH - mMH; measured.M = 'session'; }
    if (mSH != null && (gapsSH.length >= 2 || mSM == null)) { deltas.H = mSH; measured.H = 'session'; }
    else if (mSM != null && mMH != null) { deltas.H = mSM + mMH; measured.H = 'session'; }
    else if (mSH != null) { deltas.H = mSH; measured.H = 'session'; }
  }

  /* cross-session fallback — only for compounds still unmeasured (Rule 1) */
  for (const c of ['M', 'H'] as const) {
    if (deltas[c] != null) continue;
    const enoughDrivers = (driversSeen[c]?.size ?? 0) >= MIN_PACE_SAMPLE;
    const refOk = (driversSeen.S?.size ?? 0) >= MIN_PACE_SAMPLE;
    const best = globalBest[c];
    const refBest = globalBest.S;
    if (enoughDrivers && refOk && best != null && refBest != null) {
      deltas[c] = best - refBest;
      measured[c] = 'cross-session';
    }
  }

  if (deltas.M == null && deltas.H == null) return null;
  // Sanity: positive, bounded, monotonic (oracle clamps).
  if (deltas.M != null) deltas.M = clamp(deltas.M, 0.05, 2.5);
  if (deltas.H != null) {
    deltas.H = clamp(deltas.H, 0.1, 3.5);
    if (deltas.M != null && deltas.H <= deltas.M) deltas.H = deltas.M + 0.15;
  }
  return { deltas, sessions: sessionCount, measured };
}

export interface TrackHistory {
  races: number;
  rainRatio: number | null;
  avgTempC: number | null;
}

export function getTrackHistory(model: SaveModel, trackId: number): TrackHistory {
  const races = model.races.filter((r) => r.trackId === trackId && r.state === 2);
  const rainRaces = races.filter((r) => r.weather?.raceRain === true).length;
  return {
    races: races.length,
    rainRatio: races.length > 0 ? rainRaces / races.length : null,
    avgTempC:
      races.length > 0
        ? races.reduce((s, r) => s + (r.weather?.raceTempC ?? 0), 0) / races.length
        : null,
  };
}

/**
 * Compound life caps from Save_CarTyreAllocation fresh sets (oracle):
 * soft median = the game's own life estimate; M/H anchored on S via
 * durability ratios, capped by raw medians, physical order enforced.
 * Returns null without a sane soft anchor (allocation may be empty
 * between weekends — verified on a real save).
 */
export function getCompoundCaps(model: SaveModel): Record<Compound, number> | null {
  const byType: Record<number, number[]> = {};
  for (const set of model.tyres) {
    if (set.frontLeftWear >= 0.99 && set.estimatedLapLifeRemaining != null) {
      (byType[set.weekendTyreType] ??= []).push(set.estimatedLapLifeRemaining);
    }
  }
  const raw: Partial<Record<Compound, number>> = {};
  for (const [type, c] of [[2, 'S'], [3, 'M'], [4, 'H']] as const) {
    const m = median(byType[type] ?? []);
    if (m != null) raw[c as Compound] = Math.round(m);
  }
  if (raw.S == null) return null;
  const derived = (c: Compound) =>
    Math.round(raw.S! * (TYRE_DURABILITY[c] / TYRE_DURABILITY.S));
  const caps: Record<Compound, number> = { S: raw.S, M: derived('M'), H: derived('H') };
  if (raw.M != null) caps.M = Math.min(raw.M, caps.M);
  if (raw.H != null) caps.H = Math.min(raw.H, caps.H);
  caps.M = Math.max(caps.M, caps.S);
  caps.H = Math.max(caps.H, caps.M);
  return caps;
}

/* ── strategy optimizer (oracle port) ───────────────────────────────────── */

export interface PlannedStint {
  compound: Compound;
  laps: number;
  fromLap: number;
  toLap: number;
  /** Fresh-pace delta s/lap vs Soft. */
  deltaS: number;
  /** Total wear-induced seconds lost across the stint. */
  degS: number;
}

export interface StrategyResult {
  order: Compound[];
  stops: number;
  /** Modelled total time in seconds (pace + wear + pit costs). */
  timeS: number;
  stints: PlannedStint[];
  pitLaps: number[];
  /** Seconds slower than the best plan in the candidate set. */
  vsBestS: number | null;
}

/**
 * Brute-force lap splitter minimising (delta × laps) + wear + pits × cost.
 * Two distinct dry compounds required (dry rule); stint length is a HARD
 * ceiling at tyre life — the game's tyre graph kills a set at its life
 * estimate even at full conserve (user-verified, oracle comment).
 */
export function evaluateStrategy(
  stintCompounds: Compound[],
  laps: number,
  maxStint: Record<Compound, number>,
  deltas: Record<Compound, number>,
  pitCostS: number,
): { timeS: number; stints: PlannedStint[] } | null {
  const n = stintCompounds.length;
  if (n < 1) return null;
  if (new Set(stintCompounds).size < 2) return null; // dry rule
  let best: { timeS: number; stints: PlannedStint[] } | null = null;

  const rec = (from: number, soFar: PlannedStint[]): void => {
    const remaining = n - soFar.length;
    if (remaining === 0) {
      if (from !== laps) return;
      const time =
        soFar.reduce((s, st) => s + st.deltaS * st.laps + st.degS, 0) + (n - 1) * pitCostS;
      if (!best || time < best.timeS) best = { timeS: time, stints: soFar.map((s) => ({ ...s })) };
      return;
    }
    for (
      let l = MIN_STINT_LAPS;
      l <= laps - from - MIN_STINT_LAPS * (remaining - 1);
      l++
    ) {
      const c = stintCompounds[soFar.length];
      const life = maxStint[c];
      if (l > life) break;
      soFar.push({
        compound: c,
        laps: l,
        fromLap: 0,
        toLap: 0,
        deltaS: deltas[c],
        degS: stintDegPenalty(c, l, life),
      });
      rec(from + l, soFar);
      soFar.pop();
    }
  };
  rec(0, []);
  return best;
}

/* ── what-if (Phase 2, docs/03 §5.3: slider pit sớm/muộn + toggle mưa) ──── */

export interface WhatIfPitShiftResult {
  baseline: StrategyResult;
  shifted: StrategyResult | null;
  /** shifted.timeS − baseline.timeS (positive = slower). */
  deltaS: number | null;
  /** True when a boundary had to be clamped to stint limits / tyre life. */
  clamped: boolean;
}

/**
 * Shifts every pit lap of a plan by `shift` laps, clamps each stint to
 * [MIN_STINT_LAPS, tyre life] (the game kills a set at its life estimate),
 * lets the final stint absorb the remainder, and recomputes deg + time
 * with the same deltas/pit cost. Returns null when no feasible split
 * exists for the requested shift.
 */
export function whatIfPitShift(
  best: StrategyResult,
  laps: number,
  maxStint: Record<Compound, number>,
  deltas: Record<Compound, number>,
  pitCostS: number,
  shift: number,
): WhatIfPitShiftResult {
  const n = best.stints.length;
  if (n === 0 || shift === 0) {
    return { baseline: best, shifted: best, deltaS: 0, clamped: false };
  }

  /* rebuild boundaries */
  const boundaries = best.pitLaps.map((lap) => lap + shift);
  let clamped = false;
  let lo = MIN_STINT_LAPS;
  for (let i = 0; i < boundaries.length; i++) {
    const hi = laps - MIN_STINT_LAPS * (boundaries.length - 1 - i);
    const lifeCap =
      i === 0
        ? laps
        : Math.min(laps, best.stints.slice(0, i + 1).reduce((s, st) => s + maxStint[st.compound], 0));
    const min = Math.max(lo + 1, MIN_STINT_LAPS);
    const max = Math.min(hi, lifeCap);
    if (max < min) return { baseline: best, shifted: null, deltaS: null, clamped: true };
    if (boundaries[i] < min) {
      boundaries[i] = min;
      clamped = true;
    } else if (boundaries[i] > max) {
      boundaries[i] = max;
      clamped = true;
    }
    lo = boundaries[i];
  }

  /* stints from boundaries; hard life ceiling per compound */
  const stints: PlannedStint[] = [];
  let from = 0;
  for (let i = 0; i < n; i++) {
    const compound = best.stints[i].compound;
    const life = maxStint[compound];
    let stintLaps =
      (i < n - 1 ? boundaries[i] : laps) - from;
    if (stintLaps > life) {
      stintLaps = life;
      clamped = true;
    }
    if (stintLaps < MIN_STINT_LAPS) {
      return { baseline: best, shifted: null, deltaS: null, clamped: true };
    }
    stints.push({
      compound,
      laps: stintLaps,
      fromLap: from + 1,
      toLap: from + stintLaps,
      deltaS: deltas[compound],
      degS: stintDegPenalty(compound, stintLaps, life),
    });
    from += stintLaps;
  }
  if (from !== laps) {
    // life clamp shortened the plan — extend the last stint if legal
    const last = stints[stints.length - 1];
    const life = maxStint[last.compound];
    const extra = laps - from;
    if (extra > 0) {
      if (last.laps + extra > life) {
        return { baseline: best, shifted: null, deltaS: null, clamped: true };
      }
      last.laps += extra;
      last.toLap = laps;
      last.degS = stintDegPenalty(last.compound, last.laps, life);
      clamped = true;
    }
  }

  const stops = n - 1;
  const timeS =
    stints.reduce((s, st) => s + st.deltaS * st.laps + st.degS, 0) + stops * pitCostS;
  const shifted: StrategyResult = {
    order: best.order,
    stops,
    timeS: Math.round(timeS * 10) / 10,
    stints,
    pitLaps: stints.slice(0, -1).map((st) => st.toLap),
    vsBestS: null,
  };
  return {
    baseline: best,
    shifted,
    deltaS: Math.round((shifted.timeS - best.timeS) * 10) / 10,
    clamped,
  };
}

export interface WetPlanStint {
  compound: 'I' | 'W';
  laps: number;
}

export interface WetPlanResult {
  stints: WetPlanStint[];
  pitLaps: number[];
  lives: { I: number | null; W: number | null };
  source: 'allocation' | 'none';
  note?: string;
}

/**
 * Wet plan built ONLY from fresh-set allocation lives (no invented wet
 * constants): start Intermediate, switch to Wet when the track floods if
 * both lives are known. Returns null when the save has no wet allocation —
 * the UI then shows the explicit "thiếu dữ liệu" state.
 */
export function buildWetPlan(model: SaveModel, laps: number): WetPlanResult | null {
  const freshLife = (type: number): number | null => {
    const values = model.tyres
      .filter((t) => t.weekendTyreType === type && t.frontLeftWear >= 0.99 && t.estimatedLapLifeRemaining != null)
      .map((t) => t.estimatedLapLifeRemaining as number);
    const m = median(values);
    return m != null ? Math.max(MIN_STINT_LAPS, Math.round(m)) : null;
  };
  const iLife = freshLife(1);
  const wLife = freshLife(0);
  if (iLife == null && wLife == null) {
    return null;
  }
  const stints: WetPlanStint[] = [];
  let remaining = laps;
  if (iLife != null && (wLife == null || iLife < laps)) {
    const iLaps = Math.min(iLife, laps);
    stints.push({ compound: 'I', laps: iLaps });
    remaining = laps - iLaps;
  }
  if (remaining > 0) {
    if (wLife != null) {
      stints.push({ compound: 'W', laps: remaining });
    } else {
      stints.push({ compound: 'I', laps: remaining });
    }
  }
  return {
    stints,
    pitLaps: stints.length > 1 ? [stints[0].laps] : [],
    lives: { I: iLife, W: wLife },
    source: iLife != null || wLife != null ? 'allocation' : 'none',
    note:
      iLife != null && wLife == null
        ? 'Không có wet-set life trong allocation — phần cuối giả định chạy tiếp Inter, theo dõi điều kiện đường.'
        : undefined,
  };
}

/* ── the engine ──────────────────────────────────────────────────────────── */

/** A practice-measured pace delta, kept visible even when overridden. */
export interface PaceMeasuredEntry {
  delta: number;
  source: PaceMeasurement;
}

/**
 * Decode Save_PlayerStrategyStints into the game's plan for the active
 * weekend. LoadoutID → driver mapping is UNVERIFIED (both cars shared one
 * plan on the audited save) — the plan is reported at team level: loadout
 * 0's selected strategy, with `loadoutsAgree` flagging a split. A plan
 * containing wet/unknown tyre encodings is not modelled here → null.
 */
export function buildGamePlan(
  section: PlayerStrategySection | undefined,
  laps: number,
): TyreLab['gamePlan'] {
  // `section` may be undefined for models persisted by pre-0.5.1 builds
  // (IndexedDB auto-restore) — degrade to null, never crash.
  if (!section?.tablePresent) return null;
  const selected = section.plans.filter((p) => p.selected && p.stints.length > 0);
  if (selected.length === 0) return null;
  const plan = selected.find((p) => p.loadoutId === 0) ?? selected[0];
  const stints = [...plan.stints].sort((a, b) => a.stintIndex - b.stintIndex);
  if (stints.some((s) => s.compound == null)) return null;
  const compounds = stints.map((s) => s.compound as Compound);
  const pitLaps: number[] = [];
  const pitWindows: { start: number; end: number }[] = [];
  for (const s of stints.slice(1)) {
    const lap =
      s.optimalPitLap != null && s.optimalPitLap > 0
        ? s.optimalPitLap
        : s.expectedPitLap;
    if (lap == null || lap < 2 || lap > laps) return null;
    pitLaps.push(lap);
    pitWindows.push({
      start: s.pitWindowStart ?? lap,
      end: s.pitWindowEnd ?? lap,
    });
  }
  const stintLaps: number[] = [];
  let prev = 1;
  for (const lap of pitLaps) {
    stintLaps.push(Math.max(1, lap - prev));
    prev = lap;
  }
  stintLaps.push(Math.max(1, laps - prev + 1));
  const shape = (p: (typeof selected)[number]): string =>
    [...p.stints]
      .sort((a, b) => a.stintIndex - b.stintIndex)
      .map((s) => `${s.compound}@${s.optimalPitLap && s.optimalPitLap > 0 ? s.optimalPitLap : s.expectedPitLap}`)
      .join('|');
  const loadoutsAgree = selected.every((p) => shape(p) === shape(plan));
  return { compounds, stintLaps, pitLaps, pitWindows, loadoutsAgree };
}

export interface TyreLab {
  raceId: number;
  trackName: string;
  laps: number;
  pitLaneLossS: number;
  pitCostS: number;
  lives: Record<Compound, number>;
  lifeSource: Record<Compound, 'allocation' | 'model'>;
  deltas: Record<Compound, number>;
  /** Source used for RANKING (after the same-tier rule). */
  paceSource: Record<Compound, 'practice' | 'cross-session' | 'model' | 'baseline'>;
  /** Practice-measured values with their measurement tier (evidence clock). */
  paceMeasured: { M: PaceMeasuredEntry | null; H: PaceMeasuredEntry | null };
  /** True when the same-tier rule ranked model constants for both M and H. */
  sameTierFallback: boolean;
  expectedStops: number | null;
  expectedSource: 'track' | 'meta' | 'model' | null;
  /** Ranked candidate plans (top 6, oracle behaviour). */
  strategies: StrategyResult[];
  best: StrategyResult | null;
  wet: {
    rainLikely: boolean;
    intersLifeLaps: number | null;
    wetLifeLaps: number | null;
    source: 'allocation' | 'model';
  } | null;
  trackHistory: TrackHistory;
  observedStops: ObservedStops | null;
  practiceSessions: number;
  /** The game's own strategist plan for the ACTIVE weekend (null otherwise). */
  gamePlan: {
    compounds: Compound[];
    stintLaps: number[];
    pitLaps: number[];
    /** Pit window per pit (stints 1..n-1) from the game rows. */
    pitWindows: { start: number; end: number }[];
    /** False when the two loadouts' selected plans differ (team-level caveat). */
    loadoutsAgree: boolean;
  } | null;
}

/** Prior from the local per-track correction store (v0.5.1 P2, IndexedDB). */
export interface TyreLabPrior {
  predictedStops: number | null;
  fieldAvgStops: number | null;
  predictedPitLap: number | null;
}

export interface TyreLabOptions {
  /** Exclude one race from history (backtesting); default none. */
  excludeRaceId?: number;
  /** Local per-track correction record (UI loads it from IndexedDB). */
  prior?: TyreLabPrior;
}

export function buildTyreLab(
  model: SaveModel,
  raceId: number,
  options: TyreLabOptions = {},
): EngineResult<TyreLab> {
  const race = model.races.find((r) => r.raceId === raceId) ?? null;
  if (!race) {
    return {
      data: null as unknown as TyreLab,
      confidence: 'LOW',
      evidence: [],
      assumptions: [],
      recommendations: [],
      warnings: [`RACE_NOT_FOUND:${raceId}`],
    };
  }

  const laps = race.laps ?? 50;
  const exclude = options.excludeRaceId;
  const trackRaces = (state: number): Race[] =>
    model.races.filter(
      (r) => r.trackId === race.trackId && r.state === state && r.raceId !== exclude,
    );

  const pitLaneLossS = FALLBACK_PIT_LANE_LOSS; // v1: track PitLaneTimeLoss lives in Races_Tracks (P1 data task)
  const pitCostS = pitLaneLossS + PIT_STATIONARY_ESTIMATE;

  /* life ceilings — evidence priority: allocation caps for the ACTIVE
     weekend, otherwise the physical envelope. v0.5.1 P1 fix: stintFactor
     NO LONGER scales lives — a completed race's pit counts must never
     shrink tyre life (Suzuka post-race: factor 1/(2+1) collapsed lives to
     S12/M18/H22 while the actual soft stint ran 19–20 laps). stintFactor
     now only feeds the expectedStops fallback below. */
  /* Leave-one-out (v0.5.1 P1): the race being forecast must never teach the
     model about itself — stintFactor (the historical lives-shaper) always
     excludes the target race. Observed stops stay IN: they are the field's
     reference average ("cả giải") shown next to the plan, the (c) confidence
     guard, and the per-track correction record — reference data, not
     self-teaching (lives no longer consume it at all). */
  const stintFactor = getStintFactor(model, race.trackId, exclude ?? race.raceId);
  const caps = getCompoundCaps(model);
  const allocationFresh = caps != null && model.tyres.length > 0;
  // Only the active weekend's allocation describes THESE tyres — approximate
  // "active weekend" as the race being planned (state !== 2) in v1.
  const useAllocation = allocationFresh && race.state !== 2;

  const lives: Record<Compound, number> = { S: 0, M: 0, H: 0 };
  const lifeSource: Record<Compound, 'allocation' | 'model'> = {
    S: 'model', M: 'model', H: 'model',
  };
  for (const c of DRY) {
    const envelope = Math.max(
      4,
      Math.round(laps * FALLBACK_LIFE_SHAPE[c] * PHYSICAL_LIFE_FALLBACK),
    );
    let life = envelope;
    let src: 'allocation' | 'model' = 'model';
    if (caps && useAllocation) {
      life = Math.max(4, caps[c]);
      src = 'allocation';
    } else if (caps) {
      // Durability clamp (oracle): the fresh S median caps all paths even
      // when this weekend's allocation is not the plan's basis.
      life = Math.min(life, Math.max(4, caps[c]));
    }
    lives[c] = life;
    lifeSource[c] = src;
  }
  // Physical order S ≤ M ≤ H.
  lives.M = Math.max(lives.M, lives.S);
  lives.H = Math.max(lives.H, lives.M);

  /* expected field stops */
  const observed = getObservedStops(model, race.trackId, exclude);
  let expectedStops: number | null = null;
  let expectedSource: 'track' | 'meta' | 'model' | null = null;
  if (observed && observed.avgStopsPerDriver > 0.4) {
    expectedStops = Math.max(1, Math.round(observed.avgStopsPerDriver));
    expectedSource = 'track';
  } else if (stintFactor.source !== 'model') {
    expectedStops = Math.max(1, Math.round(1 / stintFactor.factor - 1));
    expectedSource = stintFactor.source;
  }

  /* pace deltas per lap (vs soft) */
  const assumptions: Assumption[] = [];
  const practicePace = getPracticePace(model, race.trackId);
  const deltas: Record<Compound, number> = { S: 0, M: FALLBACK_PACE_DELTA.M, H: FALLBACK_PACE_DELTA.H };
  const paceSource: Record<Compound, 'practice' | 'cross-session' | 'model' | 'baseline'> = {
    S: 'baseline', M: 'model', H: 'model',
  };
  /** Measured values kept visible even when the same-tier rule overrides them. */
  const paceMeasured: { M: PaceMeasuredEntry | null; H: PaceMeasuredEntry | null } = {
    M: null, H: null,
  };
  if (practicePace) {
    for (const c of ['M', 'H'] as const) {
      const d = practicePace.deltas[c];
      const src = practicePace.measured[c];
      if (d != null && src != null) {
        paceMeasured[c] = { delta: d, source: src };
      }
    }
  }
  /* Same-tier ranking rule (v0.5.1 P0, Suzuka 2027 bug): never rank a
     practice-measured compound against a model-constant one. Mixed tiers →
     the model constants rank for BOTH (fair comparison), the measured values
     stay visible in the evidence, and the assumption says why. */
  const sameTierFallback = (paceMeasured.M != null) !== (paceMeasured.H != null);
  if (sameTierFallback) {
    const unmeasured = paceMeasured.M == null ? 'M' : 'H';
    assumptions.push({
      text: `Delta ${unmeasured} chưa được đo ở track này — dùng hằng số model cho cả M và H để so sánh công bằng (không trộn nguồn đo được và không đo được)`,
      fallbackValue: `M +${FALLBACK_PACE_DELTA.M}s, H +${FALLBACK_PACE_DELTA.H}s vs Soft`,
    });
  } else {
    if (paceMeasured.M) {
      deltas.M = Math.round(paceMeasured.M.delta * 100) / 100;
      paceSource.M = paceMeasured.M.source === 'cross-session' ? 'cross-session' : 'practice';
    }
    if (paceMeasured.H) {
      deltas.H = Math.round(paceMeasured.H.delta * 100) / 100;
      paceSource.H = paceMeasured.H.source === 'cross-session' ? 'cross-session' : 'practice';
    }
  }

  /* candidate strategies (oracle enumeration) */
  const maxStint: Record<Compound, number> = { ...lives };
  const strategies: (StrategyResult & { timeS: number })[] = [];
  const runOrders = (orders: Compound[][], stops: number): void => {
    for (const order of orders) {
      const r = evaluateStrategy(order, laps, maxStint, deltas, pitCostS);
      if (r) {
        strategies.push({ order, stops, timeS: r.timeS, stints: r.stints, pitLaps: [], vsBestS: null });
      }
    }
  };
  const oneStop: Compound[][] = [];
  for (const a of DRY) for (const b of DRY) if (a !== b) oneStop.push([a, b]);
  const multiStop = (n: 2 | 3 | 4): Compound[][] => {
    const orders: Compound[][] = [];
    for (const a of DRY) for (const b of DRY) for (const c of DRY) {
      if (new Set([a, b, c]).size >= 2) {
        if (n === 2) orders.push([a, b, c]);
        if (n === 3) orders.push([a, b, c, a]);
        if (n === 4) orders.push([a, b, c, a, b]);
      }
    }
    return orders;
  };
  runOrders(oneStop, 1);
  runOrders(multiStop(2), 2);
  runOrders(multiStop(3), 3);
  if (strategies.length === 0) runOrders(multiStop(4), 4);

  /* rank, sanity-filter throwaway stints, mark vsBest (oracle) */
  strategies.sort((a, b) => a.timeS - b.timeS || a.stops - b.stops);
  const minStintLaps = Math.max(MIN_STINT_LAPS + 1, Math.round(laps / 12));
  const sane = strategies.filter((s) => s.stints.every((st) => st.laps >= minStintLaps));
  const ranked = sane.length > 0 ? sane : strategies;
  const bestTime = ranked.length > 0 ? ranked[0].timeS : null;
  for (const s of ranked) {
    s.vsBestS = bestTime != null ? Math.round((s.timeS - bestTime) * 10) / 10 : null;
  }
  for (const s of ranked) {
    let lap = 0;
    for (const st of s.stints) {
      st.fromLap = lap + 1;
      lap += st.laps;
      st.toLap = lap;
    }
    s.pitLaps = s.stints.slice(0, -1).map((st) => st.toLap);
  }
  const top = ranked.slice(0, 6);
  const best = top[0] ?? null;

  /* wet plan */
  const history = getTrackHistory(model, race.trackId);
  const forecastRain = race.state !== 2 && race.weather?.raceRain === true;
  const rainLikely = forecastRain || (history.rainRatio != null && history.rainRatio >= 0.35);
  let wet: TyreLab['wet'] = null;
  if (rainLikely) {
    const inters = model.tyres
      .filter((t) => t.weekendTyreType === 1 && t.frontLeftWear >= 0.99 && t.estimatedLapLifeRemaining != null)
      .map((t) => t.estimatedLapLifeRemaining as number);
    const wets = model.tyres
      .filter((t) => t.weekendTyreType === 0 && t.frontLeftWear >= 0.99 && t.estimatedLapLifeRemaining != null)
      .map((t) => t.estimatedLapLifeRemaining as number);
    wet = {
      rainLikely,
      intersLifeLaps: inters.length > 0 ? Math.round(median(inters) ?? 0) || null : null,
      wetLifeLaps: wets.length > 0 ? Math.round(median(wets) ?? 0) || null : null,
      source: inters.length > 0 || wets.length > 0 ? 'allocation' : 'model',
    };
  }

  /* in-game strategist plan — normalized from Save_PlayerStrategyStints
     (v0.5.1 P2). The table has no race reference; rows exist only for the
     current weekend, so the plan attaches to the first non-completed race
     of the CURRENT season (real saves keep placeholder state-0 calendars
     for future seasons — filtering by season is what anchors the plan to
     the actual weekend). Empty table / completed race → null. */
  const activeRace = model.races
    .filter((r) => r.seasonId === model.meta.seasonId && r.state !== 2)
    .sort((a, b) => a.day - b.day)[0];
  const gamePlan: TyreLab['gamePlan'] =
    race.raceId === activeRace?.raceId
      ? buildGamePlan(model.playerStrategy ?? { tablePresent: false, plans: [] }, laps)
      : null;
  if (gamePlan) {
    assumptions.push({
      text: 'Plan của game đọc từ Save_PlayerStrategyStints, hiển thị ở mức đội — chưa xác minh được LoadoutID (0/1) map sang xe nào',
    });
  }

  /* confidence — honest tiers (v0.5.1 P1). HIGH requires EVERY pillar:
     lives from the weekend allocation, BOTH M and H measured from practice
     (any tier), ≥3 stint-factor samples, and a plan at least as pit-heavy
     as the field average observed at this track. Any shortfall caps at
     MEDIUM — a HIGH badge must never rest on unmeasured numbers. */
  const warnings: string[] = [];
  const livesFromAllocation = lifeSource.S === 'allocation' || lifeSource.M === 'allocation';
  const bothPaceMeasured =
    (paceSource.M === 'practice' || paceSource.M === 'cross-session') &&
    (paceSource.H === 'practice' || paceSource.H === 'cross-session');
  const fewStintSamples = stintFactor.samples < 3;
  // Field reference: the save's own observed stops win; the local per-track
  // correction prior (v0.5.1 P2) fills in when this save has none.
  const priorApplied = observed == null && options.prior?.fieldAvgStops != null;
  const fieldRefStops = observed?.avgStopsPerDriver ?? options.prior?.fieldAvgStops ?? null;
  const fewerPitsThanField = best != null && fieldRefStops != null && best.stops < fieldRefStops;
  const lifeEvidence = livesFromAllocation;
  const paceEvidence = paceMeasured.M != null || paceMeasured.H != null;
  const stopsEvidence = expectedSource === 'track';
  const evidenceCount = [lifeEvidence, paceEvidence, stopsEvidence].filter(Boolean).length;
  const confidence: Confidence =
    livesFromAllocation && bothPaceMeasured && !fewStintSamples && !fewerPitsThanField
      ? 'HIGH'
      : evidenceCount >= 1
        ? 'MEDIUM'
        : 'LOW';
  if (fewerPitsThanField) {
    warnings.push(priorApplied ? 'PLAN_BELOW_FIELD_STOPS_PRIOR' : 'PLAN_BELOW_FIELD_STOPS');
    assumptions.push({
      text: priorApplied
        ? `Lần trước tại ${race.trackName} cả giải chạy ~${fieldRefStops!.toFixed(2)} pit/driver, plan hiện dùng ${best!.stops} pit — độ tin cậy bị hạ xuống MEDIUM`
        : `Plan dùng ít pit hơn mặt bằng cả giải tại track này (plan ${best!.stops} vs ~${fieldRefStops!.toFixed(2)}/driver) — độ tin cậy bị hạ xuống MEDIUM`,
    });
  } else if (confidence === 'MEDIUM' && livesFromAllocation && bothPaceMeasured && fewStintSamples) {
    assumptions.push({
      text: `Mẫu pit-stop lịch sử chỉ ${stintFactor.samples} chặng (< 3) — độ tin cậy bị hạ xuống MEDIUM`,
    });
  }

  /* evidence + assumptions (traceability contract) */
  const evidence: Evidence[] = [];
  evidence.push({
    source: 'Races/tyre model',
    label: `Tyre life S/M/H = ${lives.S}/${lives.M}/${lives.H} vòng (nguồn: ${lifeSource.S === lifeSource.M && lifeSource.M === lifeSource.H ? lifeSource.S : 'mix'})`,
    detail: `stint factor ${(stintFactor.factor * 100).toFixed(0)}% (${stintFactor.source}, ${stintFactor.samples} mẫu)`,
  });
  if (practicePace) {
    const fmt = (v: number): string => `+${v.toFixed(2)}s`;
    let label: string;
    if (sameTierFallback) {
      // Show the MEASURED values with their tiers — the ranking uses model
      // constants for both, but the save's own numbers stay on record.
      const part = (c: 'M' | 'H'): string => {
        const m = paceMeasured[c];
        return m
          ? `${c} đo được ${fmt(m.delta)} (${m.source === 'cross-session' ? 'cross-session' : 'practice'})`
          : `${c} chưa đo được`;
      };
      label = `Practice tại ${race.trackName}: ${part('M')}, ${part('H')} — xếp hạng dùng hằng số model cho cả hai (M ${fmt(FALLBACK_PACE_DELTA.M)} / H ${fmt(FALLBACK_PACE_DELTA.H)})`;
    } else {
      const part = (c: 'M' | 'H'): string => {
        const m = paceMeasured[c];
        const src = !m ? 'model' : m.source === 'cross-session' ? 'cross-session (ít mẫu)' : 'practice';
        return `${c} ${fmt(deltas[c as 'M' | 'H'])} (${src})`;
      };
      label = `Practice deltas vs Soft: ${part('M')}, ${part('H')} (${practicePace.sessions} session tại ${race.trackName})`;
    }
    evidence.push({ source: 'Races_PracticeResults', label });
  }
  if (observed) {
    evidence.push({
      source: 'Races_PitStopTimings',
      label: `Pit stops quan sát được tại ${race.trackName}: ~${observed.avgStopsPerDriver.toFixed(2)}/driver (${observed.samples} driver×chặng)`,
    });
  }
  evidence.push({
    source: 'Races_Tracks + model constant',
    label: `Pit cost ≈ ${pitCostS.toFixed(1)}s (lane ${pitLaneLossS}s + stationary ${PIT_STATIONARY_ESTIMATE}s)`,
  });
  if (priorApplied && options.prior) {
    evidence.push({
      source: 'pitwall:track-corrections (local)',
      label: `Hiệu chỉnh local tại ${race.trackName}: lần trước plan ${options.prior.predictedStops ?? '?'} pit (pit vòng ${options.prior.predictedPitLap ?? '?'}), cả giải chạy ${(options.prior.fieldAvgStops ?? 0).toFixed(2)} pit/driver`,
    });
  }

  if (lifeSource.S === 'model') {
    assumptions.push({
      text: 'Thiếu allocation fresh-set trong save — dùng envelope mô hình (S ≈ 0.51×, M ≈ 0.75×, H ≈ 0.92× quãng đường)',
      fallbackValue: `${lives.S}/${lives.M}/${lives.H} vòng`,
    });
  }
  if (paceSource.M === 'model' && !sameTierFallback) {
    assumptions.push({
      text: 'Không đủ practice sample (≥3 driver/compound/session) — dùng pace delta hằng số mô hình',
      fallbackValue: `M +${FALLBACK_PACE_DELTA.M}s, H +${FALLBACK_PACE_DELTA.H}s vs Soft`,
    });
  }
  assumptions.push({ text: 'Giả định thời tiết khô toàn chặng, không Safety Car' });
  assumptions.push({
    text: 'Chưa tính đặc thù tay đua (smoothness/adaptability) — sẽ bổ sung khi normalize Staff stats',
  });

  /* recommendations — 6-field standard (docs/03 §5.11) */
  const recommendations: Recommendation[] = [];
  if (best) {
    const alt = top[1];
    const pitWindow = (pitLap: number, life: number): string => {
      const lo = Math.max(minStintLaps, pitLap - 2, 2);
      const hi = Math.min(laps - 2, pitLap + 2, Math.max(life, pitLap));
      return hi > lo ? `${lo}–${hi}` : `${pitLap}`;
    };
    const first = best.stints[0];
    const action = best.stops === 0
      ? `Không pit — chạy ${best.order.join('→')} toàn chặng`
      : `Pit ở vòng ${pitWindow(best.pitLaps[0], lives[first.compound])} — chuyển sang ${best.stints[1]?.compound ?? ''}`;
    recommendations.push({
      id: `tyre-plan-${race.raceId}`,
      title: `Chiến thuật đề xuất: ${best.stints.map((s) => `${s.compound}(${s.laps})`).join(' → ')} — ${best.stops} pit`,
      action,
      why: `Tổng thời gian mô hình thấp nhất (${best.timeS.toFixed(1)}s: pace delta + deg + ${best.stops}×pit ${pitCostS.toFixed(1)}s). Lốp ${first.compound} sống ${lives[first.compound]} vòng (nguồn: ${lifeSource[first.compound]})${alt ? `; kế hoạch kế tiếp (${alt.stints.map((s) => s.compound).join('→')}) chậm hơn ${alt.vsBestS?.toFixed(1) ?? '?'}s` : ''}.`,
      confidence,
      evidence,
      assumptions,
      riskIfIgnored: best.stops > 0
        ? `Ở lại ngoài ${lives[first.compound]} vòng: deg cuối đời ${DEG_FINAL[first.compound]}s/vòng + risk undercut từ đối thủ trực tiếp`
        : undefined,
      expectedGain: alt ? `${Math.abs(alt.vsBestS ?? 0).toFixed(1)}s vs ${alt.order.join('→')} (ước lượng mô hình)` : undefined,
    });
  }

  if (race.state === 2) warnings.push('RACE_ALREADY_COMPLETED');
  if (sameTierFallback) warnings.push('SAME_TIER_PACE_FALLBACK');

  return {
    data: {
      raceId: race.raceId,
      trackName: race.trackName,
      laps,
      pitLaneLossS,
      pitCostS,
      lives,
      lifeSource,
      deltas,
      paceSource,
      paceMeasured,
      sameTierFallback,
      expectedStops,
      expectedSource,
      strategies: top,
      best,
      wet,
      trackHistory: history,
      observedStops: observed,
      practiceSessions: practicePace?.sessions ?? 0,
      gamePlan,
    },
    confidence,
    evidence,
    assumptions,
    recommendations,
    warnings,
  };
}
