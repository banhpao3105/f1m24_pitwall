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
import { assessReadiness, buildTyreInventory, resolveCarDrivers, type WeekendReadiness, type TyreInventory } from './grid.engine';

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
/**
 * v0.6.1 backtest: DEG_FINAL.H 1.8 → 3.0 (old value 1.8). A cliff alone
 * cannot separate the Silverstone contenders: the optimizer re-splits any
 * H plan to keep the H stint just under 60% of its 53-lap life (20–21 laps
 * S + 31–32 laps H — zero cliff by construction), so the end-of-life deg
 * rate for H must carry the "long H stints are slow on high-energy tracks"
 * reality (Ricciardo's H35 ran ~+3s/lap vs Soft). S/M unchanged; verified
 * on the Bahrain (S→M best, pit 24 — retuned in v0.6.3 for the real lives)
 * and Suzuka (S→S→M best) backtests — scripts/tune-deg-cliff.ts.
 * (v0.6.3: the lives this was tuned on were corrected — H is 43 laps, not
 * the ratio-derived 53 — so the H cliff below was re-tuned, DEG_FINAL.H 3.0
 * itself keeps its backtest value.)
 */
export const DEG_FINAL = { S: 3.0, M: 2.0, H: 3.0 } as const;
export const DEG_EXP = 2.0;
/**
 * Tyre cliff (v0.6.1): a stint longer than DEG_CLIFF_THRESHOLD × life adds
 * a penalty growing with the SQUARE of the overflow laps — the game's
 * "still alive" life estimate says nothing about staying fast (Silverstone
 * 2027: H 35-lap stint ≈ +3s/lap vs Soft at the end, race average 94.5s).
 * Per-compound constants, tuned by backtest (scripts/tune-deg-cliff.ts):
 * a single constant is mathematically incompatible with the two verified
 * saves — Bahrain's short stints must stay ~free (S→M must remain best)
 * while Silverstone's long H stint must cost real seconds. Same mechanism
 * for all three compounds, like DEG_FINAL; the data only punishes the hard
 * compound's cliff.
 *
 * v0.6.3 retune of H (5.0 → 0.55): the old 5.0 was grid-searched against
 * the WRONG H life 53 (derived from a durability ratio — the v0.6.2 mapping
 * audit's lives were never re-checked). The REAL save life is H 43, so the
 * H 35-lap stint overflows the 0.6×43 cliff by 9.2 laps, not 3.2 — the
 * quadratic blow-up priced that stint at 446s of wear. Retuned on the same
 * real-world anchor (Ricciardo's Silverstone H35: ~94.5s/lap average vs
 * fresh H ~91.4s ⇒ ~3.1s/lap × 35 ≈ 108s total, minus the pace delta
 * 0.9 × 35 = 31.5s ⇒ ≈ 77s of wear); 0.55 prices it at 69.7s (target band
 * 50–90s) while every backtest ranking constraint still holds — verified in
 * scripts/tune-deg-cliff.ts (Silverstone degH35 ∈ [50,90], S17→H35 ≥ 100s,
 * S→H best ≥ 83s; Bahrain S→M best @ pit 24 ≈ 64.0s; Suzuka unchanged).
 */
export const DEG_CLIFF_THRESHOLD = 0.6;
export const DEG_CLIFF: Record<Compound, number> = { S: 0.03, M: 0.02, H: 0.55 };

export type Compound = 'S' | 'M' | 'H';
export const DRY: Compound[] = ['S', 'M', 'H'];

/**
 * Allocation WeekendTyreType → compound. Verified on the Silverstone 2027
 * pre-race save (v0.6.2): fresh sets carry exactly one EstimatedLapTime per
 * type — 0=H 89.80s, 1=M 89.48s, 2=S 88.91s, 3=I 95.32s, 4=W 105.35s — and
 * Races_PracticeResults.BestLapTyre on the same dry weekend reads S=2, M=1,
 * H=0. The old "0=W 1=I 2=S 3=M 4=H" comment contradicted every dry row.
 */
export const ALLOC_TYRE: Record<number, Compound | 'I' | 'W'> = {
  2: 'S', 1: 'M', 0: 'H', 3: 'I', 4: 'W',
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

/** Deg-formula constants — injectable so backtests can grid-search. */
export interface DegConstants {
  final: Record<Compound, number>;
  cliff: Record<Compound, number>;
  cliffThreshold: number;
}

export const ORACLE_DEG: DegConstants = {
  final: DEG_FINAL,
  cliff: DEG_CLIFF,
  cliffThreshold: DEG_CLIFF_THRESHOLD,
};

/**
 * Stint wear seconds: base oracle curve (DEG_FINAL × (laps/3) × frac²)
 * plus the v0.6.1 cliff — beyond threshold × life the penalty grows with
 * the square of the overflow laps (see DEG_CLIFF).
 */
export function stintDegPenaltyWith(
  deg: DegConstants,
  compound: Compound,
  stintLaps: number,
  life: number,
): number {
  if (!life || life <= 0 || stintLaps <= 0) return 0;
  const frac = Math.min(1, stintLaps / life);
  const base =
    deg.final[compound] * (stintLaps / (DEG_EXP + 1)) * Math.pow(frac, DEG_EXP);
  const overflow = stintLaps - deg.cliffThreshold * life;
  const cliff = overflow > 0 ? deg.cliff[compound] * overflow * overflow : 0;
  return base + cliff;
}

/** Closed form of DEG_FINAL × (laps/life)^EXP summed over a stint (oracle). */
export function stintDegPenalty(
  compound: Compound,
  stintLaps: number,
  life: number,
): number {
  return stintDegPenaltyWith(ORACLE_DEG, compound, stintLaps, life);
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
  /** Seconds per lap vs Soft (post sanity-clamp — the RANKING values). */
  deltas: { S: 0; M: number | null; H: number | null };
  sessions: number;
  /**
   * How each compound's delta was measured (null = not measured from
   * practice at all — the engine then falls back to model constants).
   * Drives the evidence clock (v0.5.1) and the same-tier ranking rule.
   */
  measured: { M: PaceMeasurement | null; H: PaceMeasurement | null };
  /**
   * v0.6.1: the RAW measured deltas BEFORE the sanity/monotonic clamps.
   * When the monotonic rule forces H above M (practice noise — Silverstone
   * 2027: raw H +0.606 < M +0.711), the forced value must never masquerade
   * as a measurement: the raw value stays visible and the flag records it.
   */
  rawDeltas: { M: number | null; H: number | null };
  /** True when the sanity/monotonic clamp changed that compound's delta. */
  clamped: { M: boolean; H: boolean };
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
  /* v0.6.1: keep the pre-clamp values for the honesty record. */
  const rawDeltas: { M: number | null; H: number | null } = { M: null, H: null };
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
  // Sanity: positive, bounded, monotonic (oracle clamps). v0.6.1: the raw
  // values are recorded first and any clamp is flagged — a forced delta is
  // a MODEL opinion, not a measurement, and must never be labelled one.
  rawDeltas.M = deltas.M;
  rawDeltas.H = deltas.H;
  if (deltas.M != null) deltas.M = clamp(deltas.M, 0.05, 2.5);
  if (deltas.H != null) {
    deltas.H = clamp(deltas.H, 0.1, 3.5);
    if (deltas.M != null && deltas.H <= deltas.M) deltas.H = deltas.M + 0.15;
  }
  const clamped = {
    M: deltas.M != null && rawDeltas.M != null && deltas.M !== rawDeltas.M,
    H: deltas.H != null && rawDeltas.H != null && deltas.H !== rawDeltas.H,
  };
  return { deltas, sessions: sessionCount, measured, rawDeltas, clamped };
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
  /* v0.6.2 mapping fix: WeekendTyreType 1 = M, 0 = H (verified on the
     Silverstone 2027 save — the old 3=M/4=H read Inter/Wet medians as the
     dry compounds' raw life caps on other weekends). */
  for (const [type, c] of [[2, 'S'], [1, 'M'], [0, 'H']] as const) {
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

/* ── allocation pace cross-check (v0.6.1) ────────────────────────────────── */

export interface AllocationPace {
  /** Median EstimatedLapTime per compound (seconds, fresh sets). */
  lapTime: Record<Compound, number>;
  /** Deltas vs Soft derived from the game's own estimates. */
  deltas: Record<Compound, number>;
  /** Fresh sets with an EstimatedLapTime, per compound (median inputs). */
  samples: Record<Compound, number>;
}

/**
 * The game's own pace estimate from Save_CarTyreAllocation.EstimatedLapTime
 * (fresh sets). Verified on the Silverstone 2027 save: the values are the
 * game's nominal per-compound lap times, identical across cars
 * (S 88.91 / M 89.48 / H 89.80 → +0.57 / +0.89 vs Soft). Used ONLY when the
 * practice measurement is unusable (monotonic clamp forced H above M) — it
 * replaces the forced number with the game's own estimate, clearly labelled
 * 'allocation'. Returns null unless all three dry compounds have fresh sets
 * with a positive lap time.
 */
export function getAllocationPace(model: SaveModel): AllocationPace | null {
  const byType: Record<number, number[]> = { 0: [], 1: [], 2: [] };
  for (const set of model.tyres) {
    if (
      set.frontLeftWear >= 0.99 &&
      set.estimatedLapTimeS != null &&
      set.estimatedLapTimeS > 0 &&
      set.weekendTyreType in byType
    ) {
      byType[set.weekendTyreType].push(set.estimatedLapTimeS);
    }
  }
  const lapTime: Partial<Record<Compound, number>> = {};
  const samples: Partial<Record<Compound, number>> = {};
  /* v0.6.2 mapping fix: WeekendTyreType 1 = M, 0 = H. The old 3=M/4=H read
     the Silverstone allocation as M 95.32 / H 105.35 (+6.41 / +16.45) —
     those types are Inter/Wet (95.32/105.35 IS their wet-track pace). */
  for (const [type, c] of [[2, 'S'], [1, 'M'], [0, 'H']] as const) {
    const m = median(byType[type]);
    if (m == null) return null;
    lapTime[c as Compound] = m;
    samples[c as Compound] = byType[type].length;
  }
  const s = lapTime.S!;
  return {
    lapTime: lapTime as Record<Compound, number>,
    deltas: {
      S: 0,
      M: Math.round((lapTime.M! - s) * 100) / 100,
      H: Math.round((lapTime.H! - s) * 100) / 100,
    },
    samples: samples as Record<Compound, number>,
  };
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
  /**
   * v0.7.0 — the tyre set this stint runs on (best available fit in the
   * player's inventory). null when no inventory applies (pre-gate / no rows).
   */
  setUsed?: { fresh: boolean; life: number; spare: boolean } | null;
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
  /**
   * v0.7.0 — the RANK price (model/median lives) this plan was ordered by.
   * When the inventory cap re-prices the execution, timeS carries the
   * inventory price and modelTimeS preserves the rank price for display.
   */
  modelTimeS?: number;
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
  deg: DegConstants = ORACLE_DEG,
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
        degS: stintDegPenaltyWith(deg, c, l, life),
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
  deg: DegConstants = ORACLE_DEG,
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
      degS: stintDegPenaltyWith(deg, compound, stintLaps, life),
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
      last.degS = stintDegPenaltyWith(deg, last.compound, last.laps, life);
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
  /* v0.6.2 mapping fix: Inter = WeekendTyreType 3, Wet = 4 (0 and 1 are the
     dry Hard and Medium — verified on the Silverstone 2027 save). */
  const iLife = freshLife(3);
  const wLife = freshLife(4);
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
  /**
   * v0.6.1: the raw pre-clamp value when a monotonic clamp replaced the
   * measurement (Silverstone 2027: raw +0.606 forced to +0.861). Present
   * only when the ranked value is NOT the raw measurement.
   */
  rawDelta?: number;
}

/** The game's own strategist plan, normalized (v0.5.1 P2). */
export interface GamePlanShape {
  compounds: Compound[];
  stintLaps: number[];
  pitLaps: number[];
  /** Pit window per pit (stints 1..n-1) from the game rows. */
  pitWindows: { start: number; end: number }[];
  /** False when the two loadouts' selected plans differ (team-level caveat). */
  loadoutsAgree: boolean;
}

/** Decode Save_PlayerStrategyStints into the game's plan for the active
 * weekend. LoadoutID → driver mapping is UNVERIFIED (both cars shared one
 * plan on the audited save) — the plan is reported at team level: loadout
 * 0's selected strategy, with `loadoutsAgree` flagging a split. A plan
 * containing wet/unknown tyre encodings is not modelled here → null. */
export function buildGamePlan(
  section: PlayerStrategySection | undefined,
  laps: number,
): GamePlanShape | null {
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

/**
 * v0.6.1: model the game plan with the SAME maths as the web ranking
 * (pace delta + wear incl. cliff + pit costs) so the user sees the gap
 * between the web suggestion and the game's own plan in seconds.
 */
export function gamePlanTotalTimeS(
  plan: GamePlanShape,
  deltas: Record<Compound, number>,
  lives: Record<Compound, number>,
  pitCostS: number,
  deg: DegConstants = ORACLE_DEG,
): number {
  let total = 0;
  for (let i = 0; i < plan.stintLaps.length; i++) {
    const c = plan.compounds[i];
    const stint = plan.stintLaps[i];
    total += deltas[c] * stint + stintDegPenaltyWith(deg, c, stint, lives[c]);
  }
  total += plan.pitLaps.length * pitCostS;
  return Math.round(total * 10) / 10;
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
  paceSource: Record<
    Compound,
    'practice' | 'cross-session' | 'model' | 'baseline' | 'clamped' | 'allocation'
  >;
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
  gamePlan: (GamePlanShape & {
    /** v0.6.1: the game plan modelled with the web's own maths (seconds). */
    totalTimeS: number;
  }) | null;
  /**
   * v0.7.0 strategy data gate (spec bước 2): no plan may exist until the
   * save carries the weekend's allocation, ≥1 practice session and a
   * derivable qualifying grid. When `ready` is false `best`/`strategies`/
   * `gamePlan` are null/empty and the UI renders the missing-data checklist.
   */
  readiness: WeekendReadiness;
  /**
   * v0.7.0 per-car tyre inventory + the feasibility cap it imposes
   * (maxStint = min(model life, best available set life)). null when the
   * allocation is absent or the gate has not opened.
   */
  inventory: TyreInventory | null;
  /**
   * v0.7.0 step 4 — the two-car split (spec bước 4): the higher-grid car
   * (lead) runs the optimizer's plan, the lower-grid car (trail) runs the
   * best plan whose pit laps stay ≥ 3 laps clear of the lead's (double-
   * stack avoidance — the offset rule IS the handling; no invented penalty
   * constant). null when the grid does not cover both player drivers.
   */
  carPlans: CarPlans | null;
}

/** One car's plan with its attribution (spec bước 4 UI contract). */
export interface CarPlan {
  driverId: number;
  driverName: string;
  gridPos: number;
  /** 'lead' = optimizer output; 'trail' = the offset plan. */
  role: 'lead' | 'trail';
  plan: StrategyResult;
  confidence: Confidence;
  /**
   * Why the trail plan differs (machine-computed, one line):
   * diff-compound / pit-gap / shifted (could not fully separate).
   */
  reason: 'diff-compound' | 'pit-gap' | 'shifted' | null;
  /** Extra laps gained by the fallback pit shift (shifted reason only). */
  shiftedBy?: number;
}

export interface CarPlans {
  lead: CarPlan;
  trail: CarPlan | null;
  /** True when the two plans tie on modelled time — hedge, not speed. */
  tie: boolean;
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
  /**
   * v0.6.1 backtest hook (scripts/tune-deg-cliff.ts): override the deg
   * constants for what-if analysis. Production code never sets this —
   * the oracle constants are the shipped tuning.
   */
  degOverride?: Partial<DegConstants>;
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
  const deg: DegConstants = { ...ORACLE_DEG, ...options.degOverride };
  /* v0.7.0 — the strategy data gate: computed once, drives the plan path. */
  const readiness = assessReadiness(model, race.raceId);
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

  /* ── v0.7.0 step 3: the player's tyre inventory + the feasibility cap.
     Computed early so the evidence can carry it; the re-price pass below
     (after ranking) applies it to every plan. maxStint[C] = min(model
     life, best AVAILABLE set life) — on the owner's Monza pre-race save
     this turns the field-median lives S26/M39/H60 into the garage's real
     S24/M36/H55. */
  const inventory = readiness.ready ? buildTyreInventory(model, lives, race.raceId) : null;
  const invCap: Record<Compound, number> = inventory
    ? { ...lives, ...inventory.maxStint }
    : { ...lives };
  const capTightens = (['S', 'M', 'H'] as const).some((c) => invCap[c] < lives[c]);

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

  /* v0.7.0 — warnings list starts early; the checklist state carries its
     own provenance (see the evidence pushes right before the gate). */
  const warnings: string[] = [];

  /* pace deltas per lap (vs soft) */
  const assumptions: Assumption[] = [];
  const practicePace = getPracticePace(model, race.trackId);
  const deltas: Record<Compound, number> = { S: 0, M: FALLBACK_PACE_DELTA.M, H: FALLBACK_PACE_DELTA.H };
  const paceSource: Record<
    Compound,
    'practice' | 'cross-session' | 'model' | 'baseline' | 'clamped' | 'allocation'
  > = { S: 'baseline', M: 'model', H: 'model' };
  /** Measured values kept visible even when the same-tier rule overrides them. */
  const paceMeasured: { M: PaceMeasuredEntry | null; H: PaceMeasuredEntry | null } = {
    M: null, H: null,
  };
  if (practicePace) {
    for (const c of ['M', 'H'] as const) {
      const src = practicePace.measured[c];
      if (src != null && practicePace.rawDeltas[c] != null) {
        /* v0.6.1: paceMeasured always carries the RAW measured value; when a
           monotonic clamp replaced it, rawDelta records the same pre-clamp
           number explicitly so the UI can show both sides. */
        paceMeasured[c] = {
          delta: practicePace.rawDeltas[c]!,
          source: src,
          ...(practicePace.clamped[c] ? { rawDelta: practicePace.rawDeltas[c]! } : {}),
        };
      }
    }
  }
  /* Same-tier ranking rule (v0.5.1 P0, Suzuka 2027 bug): never rank a
     practice-measured compound against a model-constant one. Mixed tiers →
     the model constants rank for BOTH (fair comparison), the measured values
     stay visible in the evidence, and the assumption says why. */
  const sameTierFallback = (paceMeasured.M != null) !== (paceMeasured.H != null);
  /* v0.6.1: a monotonic clamp (practice noise — H measured faster than M,
     Silverstone 2027) must never masquerade as a measurement. The ranking
     delta switches to the game's own allocation estimate when available
     ('allocation'), otherwise the forced value stays but is labelled
     'clamped'. The raw measurement stays visible either way. */
  const allocPace = getAllocationPace(model);
  const hForced = practicePace?.clamped.H === true && !sameTierFallback;
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
    if (paceMeasured.H && !hForced) {
      deltas.H = Math.round(paceMeasured.H.delta * 100) / 100;
      paceSource.H = paceMeasured.H.source === 'cross-session' ? 'cross-session' : 'practice';
    }
    if (paceMeasured.H && hForced) {
      if (allocPace) {
        deltas.H = allocPace.deltas.H;
        paceSource.H = 'allocation';
        assumptions.push({
          text: `Practice đo được H (+${paceMeasured.H.delta.toFixed(3)}s) nhanh hơn M nên không dùng được (nhiễu — mỗi tay đua chỉ chạy 1 hợp chất) — xếp hạng H bằng ước tính allocation của game (${allocPace.lapTime.S.toFixed(2)} / ${allocPace.lapTime.M.toFixed(2)} / ${allocPace.lapTime.H.toFixed(2)}s)`,
          fallbackValue: `H +${allocPace.deltas.H}s vs Soft (giá trị thô +${paceMeasured.H.delta.toFixed(3)}s)`,
        });
      } else {
        deltas.H = Math.round(practicePace!.deltas.H! * 100) / 100;
        paceSource.H = 'clamped';
        assumptions.push({
          text: `Practice đo được H (+${paceMeasured.H.delta.toFixed(3)}s) nhanh hơn M nên không dùng được (nhiễu) — giữ quy tắc đơn điệu H = M + 0.15s, ghi rõ đây là giá trị model không phải số đo`,
          fallbackValue: `H +${deltas.H}s vs Soft (giá trị thô +${paceMeasured.H.delta.toFixed(3)}s)`,
        });
      }
    }
  }

  /* in-game strategist plan — normalized from Save_PlayerStrategyStints
     (v0.5.1 P2). The table has no race reference; rows exist only for the
     current weekend, so the plan attaches to the first non-completed race
     of the CURRENT season (real saves keep placeholder state-0 calendars
     for future seasons — filtering by season is what anchors the plan to
     the actual weekend). Empty table / completed race → null.
     Computed BEFORE ranking (v0.6.1): exact ties between order-equivalent
     plans are broken in the game plan's favour — the model is order-
     agnostic, and among equals the order the game itself runs is the one
     worth suggesting. */
  /* v0.7.0 — base evidence is built before the gate so the checklist state
     still carries its provenance (lives / practice / pits). */
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
        /* v0.6.1: a forced H delta is labelled for what it is — model or
           allocation — never "(practice)"; the raw measurement stays on
           record for comparison. */
        if (c === 'H' && m && (paceSource.H === 'clamped' || paceSource.H === 'allocation')) {
          const forcedSource = paceSource.H === 'allocation' ? 'allocation' : 'model';
          return `${c} ${fmt(deltas.H)} (${forcedSource} — practice đo được H nhanh hơn M nên không dùng được; giá trị thô +${m.delta.toFixed(3)}s)`;
        }
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
  if (inventory) {
    const agg = (c: 'S' | 'M' | 'H'): string => {
      const a = inventory.teamAggregate.find((x) => x.compound === c);
      return a
        ? `${c}: mới ×${a.fresh}${a.freshLife != null ? ` (đời ${a.freshLife})` : ''} · đã dùng ×${a.used}${a.usedLife ? ` (đời ${a.usedLife[0]}–${a.usedLife[1]})` : ''}`
        : `${c}: —`;
    };
    evidence.push({
      source: 'Save_CarTyreAllocation',
      label: `Kho lốp đội (${inventory.cars.map((c) => c.label).join(' / ')}): ${agg('S')}, ${agg('M')}, ${agg('H')} — cap thực thi ${(['S', 'M', 'H'] as const).map((c) => `${c} ${invCap[c]}`).join('/')}`,
    });
  }

  /* v0.7.0 data gate (spec bước 2): trước khi đủ allocation + practice +
     quali, KHÔNG plan nào được tính hay hiện — kể cả plan thuần model.
     Chặng đã chạy xong cũng không bao giờ "ready" (allocation đã bị xóa
     sau race — tính lại từ model rồi giới thiệu như đề xuất là bịa). */
  if (!readiness.ready) {
    const historyEarly = getTrackHistory(model, race.trackId);
    if (race.state === 2) warnings.push('RACE_ALREADY_COMPLETED');
    warnings.push('STRATEGY_NOT_READY');
    assumptions.push({
      text: `Chưa đủ dữ liệu chiến thuật (${readiness.missing.join(', ') || 'chặng đã xong'}) — web không đoán trước quali: không tính plan nào từ hằng số model`,
    });
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
        strategies: [],
        best: null,
        wet: null,
        trackHistory: historyEarly,
        observedStops: observed,
        practiceSessions: practicePace?.sessions ?? 0,
        gamePlan: null,
        readiness,
        inventory: null,
        carPlans: null,
      },
      confidence: 'LOW' as Confidence,
      evidence,
      assumptions,
      recommendations: [],
      warnings,
    };
  }

  const activeRace = model.races
    .filter((r) => r.seasonId === model.meta.seasonId && r.state !== 2)
    .sort((a, b) => a.day - b.day)[0];
  const gamePlanBase =
    race.raceId === activeRace?.raceId
      ? buildGamePlan(model.playerStrategy ?? { tablePresent: false, plans: [] }, laps)
      : null;
  /* v0.6.1: the game plan always carries its web-modelled total so the user
     sees exactly how far the web disagrees with the game, in seconds.
     v0.7.1: the modelled total is priced on the GARAGE cap (invCap), the
     same basis as every ranked plan — the v0.7.0 pass priced it on the
     field-median model lives, so the game plan's 72.5s on the Monza save
     was never executable (the garage's best M/H lives are 36/55, giving
     75.0s). Same-basis comparison or the gap number is meaningless. */
  const gamePlan: TyreLab['gamePlan'] = gamePlanBase
    ? {
        ...gamePlanBase,
        totalTimeS: gamePlanTotalTimeS(gamePlanBase, deltas, invCap, pitCostS, deg),
      }
    : null;
  const gameOrder = gamePlan ? gamePlan.compounds.join('→') : null;
  const gameOrderRank = (s: { order: Compound[] }): number =>
    gameOrder != null && s.order.join('→') === gameOrder ? 0 : 1;
  if (gamePlan) {
    assumptions.push({
      text: 'Plan của game đọc từ Save_PlayerStrategyStints, hiển thị ở mức đội — chưa xác minh được LoadoutID (0/1) map sang xe nào',
    });
  }

  /* candidate strategies (oracle enumeration) */
  const maxStint: Record<Compound, number> = { ...lives };
  const strategies: (StrategyResult & { timeS: number })[] = [];
  const runOrders = (orders: Compound[][], stops: number): void => {
    for (const order of orders) {
      const r = evaluateStrategy(order, laps, maxStint, deltas, pitCostS, deg);
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

  /* rank, sanity-filter throwaway stints, mark vsBest (oracle). v0.6.1:
     exact time+stops ties prefer the game's own compound order. */
  strategies.sort(
    (a, b) => a.timeS - b.timeS || a.stops - b.stops || gameOrderRank(a) - gameOrderRank(b),
  );
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

  /* ── v0.7.0 step 3: apply the inventory cap to every ranked plan.
     The ranked order above is the SELECTION order (model-lives maths, the
     optimizer output the spec freezes for the lead). The garage decides
     what is physically runnable and what each plan costs when executed on
     the sets actually owned:
       · no split fits the cap → the plan is INFEASIBLE and never proposed
         (the reason goes into the assumptions);
       · otherwise the plan keeps its rank but is RE-SPLIT and RE-PRICED on
         the cap lives (deg at the set life the player actually owns).
     On the owner's Monza pre-race save: the S(19)→M(34) lead re-prices
     from 51.7s (model lives) to 57.6s (cap 24/36/55). */
  let infeasibleNote: string | null = null;
  if (inventory && capTightens) {
    const surviving: typeof ranked = [];
    for (const plan of ranked) {
      const capEval = evaluateStrategy(plan.order, laps, invCap, deltas, pitCostS, deg);
      if (!capEval) {
        if (!infeasibleNote) {
          const shortest = plan.stints
            .filter((st) => st.laps > invCap[st.compound])
            .map((st) => `${st.compound} ${st.laps} vòng`)
            .join(', ');
          infeasibleNote = `${plan.stints.map((st) => st.compound).join('→')} — cần bộ ${shortest} nhưng kho chỉ còn bộ tối đa ${[...new Set(plan.stints.map((st) => st.compound))].map((c) => `${c} ${invCap[c]} vòng`).join(' / ')}`;
        }
        continue;
      }
      plan.modelTimeS = plan.timeS;
      plan.timeS = Math.round(capEval.timeS * 10) / 10;
      plan.stints = capEval.stints;
      let lap = 0;
      for (const st of plan.stints) {
        st.fromLap = lap + 1;
        lap += st.laps;
        st.toLap = lap;
      }
      plan.pitLaps = plan.stints.slice(0, -1).map((st) => st.toLap);
      surviving.push(plan);
    }
    if (surviving.length > 0) {
      ranked.length = 0;
      ranked.push(...surviving);
    } else {
      /* no plan fits the garage at all — keep the model ranking visible and
         say so instead of rendering an empty lab */
      assumptions.push({
        text: 'Kho lốp không đủ cho phương án nào — hiển thị tạm xếp hạng theo đời lốp model để tham chiếu',
        fallbackValue: `cap không xét: ${(['S', 'M', 'H'] as const).map((c) => `${c} ${invCap[c]}`).join(' / ')}`,
      });
    }
    if (infeasibleNote) {
      assumptions.push({
        text: `Bỏ phương án nhanh hơn theo model vì kho không chạy được: ${infeasibleNote}`,
      });
    }
  }
  /* per-stint set info (best available fit) + the reuse assumption */
  if (inventory) {
    for (const plan of ranked) {
      for (const st of plan.stints) {
        const carSets = inventory.cars
          .flatMap((car) => car.sets)
          .filter(
            (s) =>
              s.compound === st.compound &&
              s.available &&
              (s.lifeRemaining ?? 0) >= st.laps,
          )
          .sort((a, b) => (a.lifeRemaining ?? 0) - (b.lifeRemaining ?? 0));
        const best = carSets[0];
        st.setUsed = best
          ? { fresh: best.fresh, life: best.lifeRemaining as number, spare: false }
          : { fresh: false, life: invCap[st.compound], spare: true };
      }
    }
    /* count stints per compound vs available sets — flag the reuse gap */
    for (const plan of ranked) {
      const perCompound: Partial<Record<Compound, number>> = {};
      for (const st of plan.stints) {
        perCompound[st.compound] = (perCompound[st.compound] ?? 0) + 1;
      }
      const reused = (['S', 'M', 'H'] as const).filter((c) => {
        const need = perCompound[c] ?? 0;
        if (need <= 1) return false;
        const have = inventory.cars
          .flatMap((car) => car.sets)
          .filter((s) => s.compound === c && s.available && (s.lifeRemaining ?? 0) > 0)
          .length;
        return need > have;
      });
      if (reused.length > 0) {
        assumptions.push({
          text: `Kho chỉ có ít bộ ${reused.join('/')} khả dụng hơn số stint của plan — model tạm giả định dùng lại bộ tốt nhất cho stint sau (giới hạn đã biết, chưa có dữ liệu phân bộ theo xe)`,
        });
        break;
      }
    }
  }

  const top = ranked.slice(0, 6);
  const best = top[0] ?? null;

  /* v0.6.1 tie detection (pillar g + tie rule): order permutations of the
     same stint multiset tie EXACTLY and are not a rival — compare against
     the first plan with a DIFFERENT stint signature (multiset compare). */
  const planKey = (s: StrategyResult): string =>
    s.stints.map((st) => `${st.compound}${st.laps}`).sort().join('/');
  const bestKey = best ? planKey(best) : null;
  const secondDistinct =
    bestKey != null ? ranked.find((s) => planKey(s) !== bestKey) ?? null : null;
  const tieGapS =
    secondDistinct && best ? secondDistinct.timeS - best.timeS : null;
  const isTie = tieGapS != null && tieGapS < 2.0;

  /* wet plan */
  const history = getTrackHistory(model, race.trackId);
  const forecastRain = race.state !== 2 && race.weather?.raceRain === true;
  const rainLikely = forecastRain || (history.rainRatio != null && history.rainRatio >= 0.35);
  let wet: TyreLab['wet'] = null;
  if (rainLikely) {
    /* v0.6.2 mapping fix: inters = type 3, wets = type 4 (0/1 are dry H/M). */
    const inters = model.tyres
      .filter((t) => t.weekendTyreType === 3 && t.frontLeftWear >= 0.99 && t.estimatedLapLifeRemaining != null)
      .map((t) => t.estimatedLapLifeRemaining as number);
    const wets = model.tyres
      .filter((t) => t.weekendTyreType === 4 && t.frontLeftWear >= 0.99 && t.estimatedLapLifeRemaining != null)
      .map((t) => t.estimatedLapLifeRemaining as number);
    wet = {
      rainLikely,
      intersLifeLaps: inters.length > 0 ? Math.round(median(inters) ?? 0) || null : null,
      wetLifeLaps: wets.length > 0 ? Math.round(median(wets) ?? 0) || null : null,
      source: inters.length > 0 || wets.length > 0 ? 'allocation' : 'model',
    };
  }

  /* in-game strategist plan — computed before ranking (game-order
     tie-break); see the block above the strategy enumeration. */

  /* confidence — honest tiers (v0.5.1 P1). HIGH requires EVERY pillar:
     lives from the weekend allocation, BOTH M and H measured from practice
     (any tier), ≥3 stint-factor samples, and a plan at least as pit-heavy
     as the field average observed at this track. Any shortfall caps at
     MEDIUM — a HIGH badge must never rest on unmeasured numbers. */
  const livesFromAllocation = lifeSource.S === 'allocation' || lifeSource.M === 'allocation';
  const bothPaceMeasured =
    (paceSource.M === 'practice' || paceSource.M === 'cross-session') &&
    (paceSource.H === 'practice' || paceSource.H === 'cross-session');
  const fewStintSamples = stintFactor.samples < 3;
  // Field reference: the save's own observed stops win; the local per-track
  // correction prior (v0.5.1 P2) fills in when this save has none; the meta
  // expectedStops (v0.6.1 pillar h) fills in when neither exists — the
  // engine already knows the field's stop count, ignoring it let a 1-pit
  // plan rate HIGH at a 2-stop track (Silverstone 2027).
  const priorApplied = observed == null && options.prior?.fieldAvgStops != null;
  const fieldRefStops =
    observed?.avgStopsPerDriver ?? options.prior?.fieldAvgStops ?? expectedStops;
  const fewerPitsThanField = best != null && fieldRefStops != null && best.stops < fieldRefStops;
  /* v0.6.1 pillar e: no delta may carry the 'clamped' label. */
  const noPaceClamped = !Object.values(paceSource).includes('clamped');
  /* v0.6.1 pillar f: practice consistency — either ≥ 2 practice sessions,
     or the allocation estimate agrees with the practice measurement within
     0.2s for every compound both sources cover. With NO practice measured
     at all there is nothing to contradict — the absence is already priced
     by the pace pillar (b); this is what keeps honest no-practice saves
     (Bahrain backtest) at MEDIUM instead of an unfair LOW. */
  const paceConsistency = (() => {
    if ((practicePace?.sessions ?? 0) >= 2) return true;
    const measuredC = (['M', 'H'] as const).filter((c) => practicePace?.measured[c] != null);
    if (measuredC.length === 0) return true;
    if (!allocPace) return false;
    return measuredC.every((c) => {
      const raw = paceMeasured[c]?.delta;
      return raw == null || Math.abs(allocPace.deltas[c] - raw) <= 0.2;
    });
  })();

  /* v0.6.1 confidence — HIGH needs EVERY pillar; each missing one is named.
     HIGH: (a) allocation lives · (b) both M+H measured from practice ·
     ≥3 stint-factor samples · (e) no 'clamped' delta · (f) practice ≥2
     sessions or allocation consistency within 0.2s · (g) best plan beats
     the first DIFFERENT plan by ≥ 2.0s · (h) plan stops ≥ field reference
     (observed → prior → meta expectedStops). One missing pillar = MEDIUM;
     ≥ 2 missing or any forced delta = LOW — a HIGH badge must never rest
     on a forced number or two weak legs. */
  const missingPillars: string[] = [];
  if (!livesFromAllocation) missingPillars.push('lives');
  if (!bothPaceMeasured) missingPillars.push('pace');
  if (fewStintSamples) missingPillars.push('samples');
  if (!noPaceClamped) missingPillars.push('clamped');
  if (!paceConsistency) missingPillars.push('consistency');
  if (tieGapS == null || tieGapS < 2.0) missingPillars.push('margin');
  if (fewerPitsThanField) missingPillars.push('fieldStops');
  const forcedPaceDelta = hForced || paceSource.M === 'clamped';
  const confidence: Confidence =
    forcedPaceDelta || missingPillars.length >= 2
      ? 'LOW'
      : missingPillars.length === 1
        ? 'MEDIUM'
        : 'HIGH';
  /* v0.7.0 per-plan confidence (spec bước 4: tính riêng từng plan, giữ
     nguyên các pillar v0.6.1) — the pillars are plan-independent except
     fieldStops, which is re-checked per plan's own stop count. */
  const planConfidenceFor = (stops: number): Confidence => {
    const fewer = fieldRefStops != null && stops < fieldRefStops;
    const missing = missingPillars.filter((p) => p !== 'fieldStops' || fewer);
    if (fewer && !missing.includes('fieldStops')) missing.push('fieldStops');
    return forcedPaceDelta || missing.length >= 2
      ? 'LOW'
      : missing.length === 1
        ? 'MEDIUM'
        : 'HIGH';
  };
  if (fewerPitsThanField) {
    warnings.push(priorApplied ? 'PLAN_BELOW_FIELD_STOPS_PRIOR' : 'PLAN_BELOW_FIELD_STOPS');
  }
  /* name every missing pillar (traceability contract, prompt mục 3) */
  if (confidence !== 'HIGH') {
    const reasons: string[] = [];
    if (hForced) {
      reasons.push(
        `delta H bị ép (xếp hạng bằng ${paceSource.H === 'allocation' ? 'allocation' : 'model'}, không phải số đo practice)`,
      );
    } else if (paceSource.M === 'clamped') {
      reasons.push('delta M bị ép');
    }
    if (missingPillars.includes('pace')) {
      reasons.push('delta xếp hạng chưa đủ cả M và H từ practice');
    }
    if (missingPillars.includes('consistency')) {
      reasons.push(
        `practice chỉ ${practicePace?.sessions ?? 0} session và allocation lệch quá 0.2s so với practice`,
      );
    }
    if (missingPillars.includes('margin')) {
      reasons.push(
        tieGapS == null
          ? 'không có phương án kế tiếp để so'
          : `hai phương án đầu chênh nhau ${tieGapS.toFixed(1)}s (<2s — hòa)`,
      );
    }
    if (missingPillars.includes('fieldStops')) {
      reasons.push(`plan ${best!.stops} pit < mặt bằng ${fieldRefStops!.toFixed(2).replace(/\.00$/, '')} pit`);
    }
    if (missingPillars.includes('lives')) {
      reasons.push('lives không từ allocation của tuần lễ');
    }
    if (missingPillars.includes('samples')) {
      reasons.push(`mẫu pit-stop lịch sử ${stintFactor.samples} < 3`);
    }
    if (missingPillars.includes('clamped')) {
      reasons.push('có delta bị ép đơn điệu');
    }
    if (reasons.length > 0) {
      assumptions.push({ text: `Confidence ${confidence}: ${reasons.join('; ')}` });
    }
  }
  if (fewerPitsThanField) {
    assumptions.push({
      text: priorApplied
        ? `Lần trước tại ${race.trackName} cả giải chạy ~${fieldRefStops!.toFixed(2)} pit/driver, plan hiện dùng ${best!.stops} pit — độ tin cậy bị hạ`
        : `Plan dùng ít pit hơn mặt bằng cả giải tại track này (plan ${best!.stops} vs ~${fieldRefStops!.toFixed(2)}/driver) — độ tin cậy bị hạ`,
    });
  } else if (confidence === 'MEDIUM' && livesFromAllocation && bothPaceMeasured && fewStintSamples) {
    assumptions.push({
      text: `Mẫu pit-stop lịch sử chỉ ${stintFactor.samples} chặng (< 3) — độ tin cậy bị hạ xuống MEDIUM`,
    });
  }

  if (priorApplied && options.prior) {
    evidence.push({
      source: 'pitwall:track-corrections (local)',
      label: `Hiệu chỉnh local tại ${race.trackName}: lần trước plan ${options.prior.predictedStops ?? '?'} pit (pit vòng ${options.prior.predictedPitLap ?? '?'}), cả giải chạy ${(options.prior.fieldAvgStops ?? 0).toFixed(2)} pit/driver`,
    });
  }

  /* ── v0.7.0 step 4: the two-car split (spec bước 4) ────────────────────
     Lead = the higher-grid player driver, running the optimizer's plan
     (already feasibility-gated + re-priced by the inventory cap in step 3).
     Trail = the best feasible plan whose EVERY pit lap stays ≥ 3 laps
     clear of every lead pit lap — the offset rule IS the double-stack
     handling (the model has no queue-time constant and none may be
     invented). A different starting compound (a) is preferred when the
     plan sits within the repo's 2.0s "tie" band of the optimal plan; a
     same-compound plan qualifies through the pit gap alone (b). Without
     any qualifying plan the lead's pits shift as far as the tyres allow
     and the shortfall is stated. CẤM bịa hằng số phạt double-stack. */
  const TRAIL_PIT_GAP = 3;
  const playerDriverIds = new Set(
    model.drivers.filter((d) => d.teamId === model.player.teamId).map((d) => d.staffId),
  );
  const playerGrid = (readiness.grid ?? [])
    .filter((g) => playerDriverIds.has(g.driverId))
    .sort((a, b) => a.gridPos - b.gridPos);
  let carPlans: CarPlans | null = null;
  if (best && playerGrid.length >= 2) {
    const [leadGrid, trailGrid] = playerGrid;
    const driverName = (id: number): string =>
      model.drivers.find((d) => d.staffId === id)?.fullName ?? `Driver ${id}`;
    /* v0.7.1 — per-car cap pricing (spec bước 2): a driver with a VERIFIED
       seat is priced against THEIR OWN car's garage; the conservative team
       cap (min across cars) stays the fallback because pricing a car on an
       unverified seat guess is exactly the v0.6/v0.7 failure shape. On the
       Monza pre-race save both cars cap identically → both paths give the
       same numbers (locked in tests so a future divergence is not lost). */
    const capOfDriver = (driverId: number): Record<Compound, number> => {
      const car = inventory?.cars.find((c) => c.driverId === driverId && c.seatVerified);
      return car && inventory ? { ...lives, ...inventory.perCarMaxStint[car.carId]! } : invCap;
    };
    const priceOn = (
      plan: StrategyResult,
      cap: Record<Compound, number>,
    ): StrategyResult | null => {
      if ((['S', 'M', 'H'] as const).every((c) => cap[c] === invCap[c])) return plan;
      const r = evaluateStrategy(plan.order, laps, cap, deltas, pitCostS, deg);
      if (!r) return null;
      let lap = 0;
      for (const st of r.stints) {
        st.fromLap = lap + 1;
        lap += st.laps;
        st.toLap = lap;
      }
      return {
        ...plan,
        modelTimeS: plan.modelTimeS ?? plan.timeS,
        timeS: Math.round(r.timeS * 10) / 10,
        stints: r.stints,
        pitLaps: r.stints.slice(0, -1).map((st) => st.toLap),
      };
    };
    const leadPlan = priceOn(best, capOfDriver(leadGrid.driverId)) ?? best;
    if (leadPlan !== best) {
      assumptions.push({
        text: 'Plan của xe lead tính lại giá trên kho lốp đúng xe đó (cap xe khác cap đội) — bảng xếp hạng phía trên vẫn xếp theo cap đội',
      });
    }
    const gapOk = (p: StrategyResult): boolean =>
      p.pitLaps.every((pl) =>
        leadPlan.pitLaps.every((lp) => Math.abs(pl - lp) >= TRAIL_PIT_GAP),
      );
    /* candidates are priced on the TRAIL car's own garage before the
       offset rules run — a re-split can move pit laps, so the gap check
       applies AFTER pricing */
    const candidates: StrategyResult[] = [];
    for (const p of ranked) {
      if (p === best) continue; // the lead's ranked entry (clone or not)
      const priced = priceOn(p, capOfDriver(trailGrid.driverId));
      if (priced && gapOk(priced)) candidates.push(priced);
    }
    /* (a) different starting compound, within the 2.0s tie band of the
       optimal plan — the spec's preference order */
    const diffCompound = candidates.filter(
      (p) => p.order[0] !== leadPlan.order[0] && (p.vsBestS ?? Infinity) <= 2.0,
    );
    let trailPlan: StrategyResult | null = diffCompound[0] ?? candidates[0] ?? null;
    let reason: CarPlan['reason'] = null;
    let shiftedBy: number | undefined;
    if (trailPlan) {
      reason = trailPlan.order[0] !== leadPlan.order[0] ? 'diff-compound' : 'pit-gap';
    } else {
      /* fallback: keep the optimal plan but push its pits as far from the
         lead's as the tyres allow — never reach ≥3 is stated, not hidden.
         v0.7.1: the shift runs on the TRAIL car's own cap. */
      const trailCap = capOfDriver(trailGrid.driverId);
      let bestShifted: { plan: StrategyResult; gap: number; shift: number } | null = null;
      for (const shift of [3, -3, 4, -4, 5, -5, 2, -2, 1, -1]) {
        const r = whatIfPitShift(leadPlan, laps, trailCap, deltas, pitCostS, shift);
        if (!r.shifted) continue;
        const minGap = Math.min(
          ...r.shifted.pitLaps.map((pl) =>
            Math.min(...leadPlan.pitLaps.map((lp) => Math.abs(pl - lp))),
          ),
        );
        if (minGap >= TRAIL_PIT_GAP) {
          bestShifted = { plan: r.shifted, gap: minGap, shift };
          break;
        }
        if (!bestShifted || minGap > bestShifted.gap) {
          bestShifted = { plan: r.shifted, gap: minGap, shift };
        }
      }
      if (bestShifted) {
        trailPlan = bestShifted.plan;
        reason = 'shifted';
        shiftedBy = bestShifted.shift;
      }
    }
    const tie =
      trailPlan != null &&
      (planKey(leadPlan) === planKey(trailPlan) ||
        Math.abs(
          (trailPlan.modelTimeS ?? trailPlan.timeS) -
            (leadPlan.modelTimeS ?? leadPlan.timeS),
        ) < 2.0);
    if (tie) {
      assumptions.push({
        text: 'Hai plan hòa nhau về tổng thời gian mô hình — tách để tránh dẫm chân + hedge, không phải vì nhanh hơn',
      });
    }
    /* documented model limitation (spec bước 4): fuel load makes early
       stints dearer than late ones in reality — the model cannot see it */
    assumptions.push({
      text: 'Giới hạn model: không phân biệt deg của stint chạy đầu race (xe nặng xăng) với stint chạy cuối — hai plan cùng multiset stint cho cùng tổng thời gian dù thứ tự khác nhau',
    });
    carPlans = {
      lead: {
        driverId: leadGrid.driverId,
        driverName: driverName(leadGrid.driverId),
        gridPos: leadGrid.gridPos,
        role: 'lead',
        plan: leadPlan,
        confidence: planConfidenceFor(leadPlan.stops),
        reason: null,
      },
      trail:
        trailPlan != null
          ? {
              driverId: trailGrid.driverId,
              driverName: driverName(trailGrid.driverId),
              gridPos: trailGrid.gridPos,
              role: 'trail',
              plan: trailPlan,
              confidence: planConfidenceFor(trailPlan.stops),
              reason,
              ...(shiftedBy != null ? { shiftedBy } : {}),
            }
          : null,
      tie,
    };
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

  /* recommendations — 6-field standard (docs/03 §5.11). v0.6.1 tie rule:
     when the first DIFFERENT plan is within 2.0s the race is a coin flip —
     say so, and prefer the game's own plan (or, without a game plan, the
     tied plan whose longest stint is shortest). */
  const recommendations: Recommendation[] = [];
  if (best) {
    const longestStint = (s: StrategyResult): number => Math.max(...s.stints.map((st) => st.laps));
    let recommended = best;
    let tieNote = '';
    /* v0.7.0 — the inventory story rides in the why: the plan's total is the
       EXECUTION price (deg at the capped set lives), the rank was computed
       on the model lives, and a faster-ranked plan that the garage cannot
       run is named with its reason. */
    let inventoryNote = '';
    if (inventory && capTightens) {
      const capTxt = (['S', 'M', 'H'] as const)
        .filter((c) => invCap[c] < lives[c])
        .map((c) => `${c} ${invCap[c]}/${lives[c]}`)
        .join(' · ');
      inventoryNote =
        ` Tổng thời gian tính theo kho lốp của đội (deg trên đời bộ còn dùng được${capTxt ? ` — cap ${capTxt} vòng` : ''})${recommended.modelTimeS != null && Math.abs(recommended.modelTimeS - recommended.timeS) >= 0.05 ? `, thay vì ${recommended.modelTimeS.toFixed(1)}s theo đời lốp model` : ''}.`;
      if (infeasibleNote) {
        inventoryNote += ` Bỏ phương án nhanh hơn theo model vì kho không chạy được: ${infeasibleNote}.`;
      }
    }
    if (isTie && secondDistinct) {
      const gamePlanViable =
        gamePlan != null &&
        gamePlan.totalTimeS <= best.timeS + 2.0 &&
        ranked.some((s) => s.order.join('→') === gamePlan.compounds.join('→'));
      if (gamePlanViable) {
        recommended =
          ranked.find((s) => s.order.join('→') === gamePlan!.compounds.join('→')) ?? best;
        tieNote = ` Hai phương án đầu chênh nhau ${tieGapS!.toFixed(1)}s (<2s) — coi như hòa; ưu tiên plan của game.`;
      } else {
        if (!gamePlan && longestStint(secondDistinct) < longestStint(best)) {
          recommended = secondDistinct;
        }
        tieNote = ` Hai phương án đầu chênh nhau ${tieGapS!.toFixed(1)}s (<2s) — coi như hòa;${gamePlan ? ' plan của game chậm hơn quá 2s nên vẫn đề xuất web' : ' ưu tiên plan có stint dài nhất ngắn hơn'}.`;
      }
    }
    const alt = top.find((s) => s !== recommended) ?? null;
    /* v0.6.2: an alternative whose vsBestS rounds to 0.0 is an exact-tie
       permutation (same stint multiset), not a "slower" plan — saying
       "chậm hơn 0.0s" is self-contradictory. Name it a tie instead.
       isTie logic, tieNote and the ranking order stay untouched. */
    const altTail = alt
      ? alt.vsBestS != null && Math.abs(alt.vsBestS) < 0.05
        ? `; kế hoạch kế tiếp (${alt.stints.map((s) => s.compound).join('→')}) hòa (cùng tổng thời gian mô hình)`
        : `; kế hoạch kế tiếp (${alt.stints.map((s) => s.compound).join('→')}) chậm hơn ${alt.vsBestS?.toFixed(1) ?? '?'}s`
      : '';
    const pitWindow = (pitLap: number, life: number): string => {
      const lo = Math.max(minStintLaps, pitLap - 2, 2);
      const hi = Math.min(laps - 2, pitLap + 2, Math.max(life, pitLap));
      return hi > lo ? `${lo}–${hi}` : `${pitLap}`;
    };
    const first = recommended.stints[0];
    const action = recommended.stops === 0
      ? `Không pit — chạy ${recommended.order.join('→')} toàn chặng`
      : `Pit ở vòng ${pitWindow(recommended.pitLaps[0], lives[first.compound])} — chuyển sang ${recommended.stints[1]?.compound ?? ''}`;
    recommendations.push({
      id: `tyre-plan-${race.raceId}`,
      title: `Chiến thuật đề xuất: ${recommended.stints.map((s) => `${s.compound}(${s.laps})`).join(' → ')} — ${recommended.stops} pit`,
      action,
      why: `Tổng thời gian mô hình ${recommended === best ? 'thấp nhất' : 'thấp nhất (cùng lâu)'} (${recommended.timeS.toFixed(1)}s: pace delta + deg + ${recommended.stops}×pit ${pitCostS.toFixed(1)}s). Lốp ${first.compound} sống ${lives[first.compound]} vòng (nguồn: ${lifeSource[first.compound]})${alt && !isTie ? altTail : ''}.${tieNote}${inventoryNote}${gamePlan ? ` Plan của game (${gamePlan.compounds.join('→')}, pit ${gamePlan.pitLaps.join(', ') || '—'}) tốn ${gamePlan.totalTimeS.toFixed(1)}s theo mô hình web.` : ''}`,
      confidence,
      evidence,
      assumptions,
      riskIfIgnored: recommended.stops > 0
        ? `Ở lại ngoài ${lives[first.compound]} vòng: deg cuối đời ${DEG_FINAL[first.compound]}s/vòng + risk undercut từ đối thủ trực tiếp`
        : undefined,
      expectedGain: alt ? `${Math.abs(alt.vsBestS ?? 0).toFixed(1)}s vs ${alt.order.join('→')} (ước lượng mô hình)` : undefined,
    });
  }

  if (race.state === 2) warnings.push('RACE_ALREADY_COMPLETED');
  if (sameTierFallback) warnings.push('SAME_TIER_PACE_FALLBACK');
  if (paceSource.H === 'clamped' || paceSource.H === 'allocation') {
    warnings.push('PACE_DELTA_FORCED');
  }

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
      readiness,
      inventory,
      carPlans,
    },
    confidence,
    evidence,
    assumptions,
    recommendations,
    warnings,
  };
}
