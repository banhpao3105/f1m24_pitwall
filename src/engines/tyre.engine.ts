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
import { assessReadiness, buildTyreInventory, resolveCarDrivers, assignSetsForCar, type WeekendReadiness, type TyreInventory, type InventoryCar, type InventorySet, type SetAssignment } from './grid.engine';

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

/** Deg-formula constants — injectable so backtests can grid-search.
 * v0.9.7: the keys gain OPTIONAL I/W slots so the free-form simulator can
 * carry its labelled wet-deg assumption (SIM_DEG) through the SAME
 * DegConstants shape — the oracle values below are untouched. */
export interface DegConstants {
  final: Record<Compound, number> & Partial<Record<'I' | 'W', number>>;
  cliff: Record<Compound, number> & Partial<Record<'I' | 'W', number>>;
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
  compound: Compound | 'I' | 'W',
  stintLaps: number,
  life: number,
): number {
  if (!life || life <= 0 || stintLaps <= 0) return 0;
  /* v0.9.7 — the I/W keys exist only on SIM_DEG; the `?? 0` keeps the
     oracle path byte-identical (S/M/H keys are always defined). */
  const fin = deg.final[compound] ?? 0;
  const cl = deg.cliff[compound] ?? 0;
  const frac = Math.min(1, stintLaps / life);
  const base =
    fin * (stintLaps / (DEG_EXP + 1)) * Math.pow(frac, DEG_EXP);
  const overflow = stintLaps - deg.cliffThreshold * life;
  const cliff = overflow > 0 ? cl * overflow * overflow : 0;
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

/** v0.9.4 — per-stint wear correction (seconds, rounded 0.1 each). */
export interface WearCorrectionResult {
  totalS: number;
  perStint: number[];
}

/**
 * v0.9.4 — price a plan on the PHYSICAL sets it runs (the wear→price law).
 *
 * The plan price above (pace delta + deg + pits) assumes fresh tyres at the
 * priced lives; the game itself prices each SET via
 * Save_CarTyreAllocation.EstimatedLapTime (verified on a real save: a soft
 * worn to 0.888 estimates +0.01s/lap, a hard worn to 0.504 +1.50s/lap over
 * its fresh median). Two correction parts per assigned stint:
 *
 *   · pace: (set.estimatedLapTime − allocPace.lapTime[compound]) × laps —
 *     the game's own number for THIS set against the fresh-set median of
 *     `getAllocationPace` (game data only — no invented constant);
 *   · deg:  stintDegPenaltyWith(deg, c, laps, assignedSet.life) −
 *           stintDegPenaltyWith(deg, c, laps, pricedLives[c]) — the deg at
 *     the life the set ACTUALLY has vs the life the plan was priced on.
 *
 * Null-safe by contract: a stint without an assignment, a set missing its
 * EstimatedLapTime, or a null `allocPace` contribute 0 pace (the deg part
 * still prices from the assigned life). Per-stint values are rounded to
 * 0.1s FIRST and the total is the rounded sum of those — the stint lines
 * shown to the user add up to the plan line, always.
 */
export function wearCorrection(
  stints: ReadonlyArray<{
    compound: Compound | 'I' | 'W';
    laps: number;
    setUsed?: { tyreSetId: number; life: number } | null;
  }>,
  sets: InventorySet[],
  allocPace: AllocationPace | null,
  pricedLives: Record<Compound, number> & Partial<Record<'I' | 'W', number>>,
  deg: DegConstants = ORACLE_DEG,
): WearCorrectionResult {
  const perStint = stints.map((st) => {
    const used = st.setUsed;
    if (!used) return 0;
    const set = sets.find((s) => s.tyreSetId === used.tyreSetId);
    const pace =
      set?.estimatedLapTime != null &&
      allocPace != null &&
      allocPace.lapTime[st.compound] != null
        ? (set.estimatedLapTime - allocPace.lapTime[st.compound]!) * st.laps
        : 0;
    /* v0.9.7 — a compound with no priced life (I/W without wet allocation)
       contributes 0 deg correction; the S/M/H path is unchanged. */
    const priced = pricedLives[st.compound];
    const degPart =
      priced == null
        ? 0
        : stintDegPenaltyWith(deg, st.compound, st.laps, used.life) -
          stintDegPenaltyWith(deg, st.compound, st.laps, priced);
    return Math.round((pace + degPart) * 10) / 10;
  });
  return {
    perStint,
    totalS: Math.round(perStint.reduce((sum, v) => sum + v, 0) * 10) / 10,
  };
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
  /** Seconds per lap vs Soft — the RANKING values (v0.7.1: the measured
   * delta rounded to 2dp; the 0.05 floor applies ONLY to a degenerate
   * (≤ 0) M measurement; upper bounds + the H monotonic rule unchanged). */
  deltas: { S: 0; M: number | null; H: number | null };
  /**
   * v0.7.1 (renamed from `sessions`): how many sessions produced a
   * MEASURABLE compound gap (≥ MIN_PACE_SAMPLE drivers per compound).
   * Deliberately distinct from `WeekendReadiness.practiceSessions` (the
   * F1 sessions present in the save) — Monza 2027: 3 present, 2 measured.
   */
  sessionsMeasured: number;
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
    /* v0.7.1 — F1-only pace pool: session 1 of a real weekend also carries
       the F2/F3 fields; their laps are not F1 pace data. Legacy rows
       without the formula column keep every row (same guard as the grid). */
    const rows = race.practice ?? [];
    const hasFormula = rows.some((p) => p.raceFormula != null);
    const f1Rows = hasFormula ? rows.filter((p) => p.raceFormula === 1) : rows;
    const perSession = new Map<number, Map<Compound, { best: number; drivers: Set<number> }>>();
    for (const p of f1Rows) {
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
  // Sanity clamps. v0.7.1 (spec bước 5): the ranking delta IS the measured
  // value (rounded to 2dp) — the old 0.05 floor on M overwrote a real
  // measured median (Monza raw 0.0285 → displayed 0.05, silently pricing
  // every total +0.6s with no evidence). The floor now applies ONLY to a
  // DEGENERATE measurement (≤ 0). Upper bounds (M ≤ 2.5, H ∈ [0.1, 3.5])
  // and the H monotonic rule stay untouched (v0.6.1). Raw values stay on
  // record and any change is flagged — a forced delta is a MODEL opinion,
  // never a measurement.
  rawDeltas.M = deltas.M;
  rawDeltas.H = deltas.H;
  if (deltas.M != null) {
    deltas.M = deltas.M <= 0 ? 0.05 : Math.min(deltas.M, 2.5);
    deltas.M = Math.round(deltas.M * 100) / 100;
  }
  if (deltas.H != null) {
    deltas.H = clamp(deltas.H, 0.1, 3.5);
    if (deltas.M != null && deltas.H <= deltas.M) deltas.H = deltas.M + 0.15;
    deltas.H = Math.round(deltas.H * 100) / 100;
  }
  const clamped = {
    /* the flag means a CLAMP fired (degenerate floor / bounds / monotonic
       rule) — plain 2dp rounding is part of the ranking transform, not a
       clamp, and must not read as one */
    M: deltas.M != null && rawDeltas.M != null && deltas.M !== Math.round(rawDeltas.M * 100) / 100,
    H: deltas.H != null && rawDeltas.H != null && deltas.H !== Math.round(rawDeltas.H * 100) / 100,
  };
  return { deltas, sessionsMeasured: sessionCount, measured, rawDeltas, clamped };
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
  /** Median EstimatedLapTime per compound (seconds, fresh sets).
   *  v0.9.7: optional I/W slots — the simulator merges the wet medians in
   *  so `wearCorrection` prices wet sets on the same basis. */
  lapTime: Record<Compound, number> & Partial<Record<'I' | 'W', number>>;
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
   * v0.7.0 — the tyre set this stint runs on. v0.9.1: the set comes from
   * the REAL per-car greedy assignment (`assignSetsForCar`) — longest stint
   * ↔ longest-life set — never an independent best-fit pick that could
   * point two stints of one plan at the same physical set. null when no
   * inventory applies (pre-gate / no rows). v0.9.4: the never-set `spare`
   * flag is GONE — the fresh/used label reads `fresh` alone.
   */
  setUsed?: { tyreSetId: number; fresh: boolean; life: number } | null;
  /**
   * v0.9.4 — this stint's wear correction (seconds, rounded 0.1): the
   * assigned set's pace gap vs the fresh-set median + the deg at the
   * assigned set's life vs the priced life. Absent when 0.
   */
  wearS?: number;
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
  /**
   * v0.9.4 — the plan's total wear correction (seconds, rounded 0.1):
   * pace gap of the ASSIGNED sets vs the fresh-set median + deg at the
   * assigned set lives vs the priced lives. Absent when 0 — a zero
   * correction must never masquerade as a measured one.
   */
  wearS?: number;
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
 *
 * v0.9.1 — `sets` (the examined car's OWN InventorySet[]) turns the set
 * assignment law into a gate here too: a shift that stretches a stint past
 * the life of the set it must run on returns `shifted: null, clamped: true`,
 * exactly like the life-clamp shape (prompt v0.9.1 bước 1.7).
 */
export function whatIfPitShift(
  best: StrategyResult,
  laps: number,
  maxStint: Record<Compound, number>,
  deltas: Record<Compound, number>,
  pitCostS: number,
  shift: number,
  deg: DegConstants = ORACLE_DEG,
  sets?: InventorySet[],
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

  /* v0.9.1 — the shifted plan must still be runnable on the examined car's
     OWN sets (longest stint ↔ longest-life set per compound). A shift that
     pushes a stint past its set's life is no plan at all. */
  if (sets && assignSetsForCar(sets, stints) == null) {
    return { baseline: best, shifted: null, deltaS: null, clamped: true };
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
 *
 * v0.9.1 — `inventory` (when provided) applies the SAME set-assignment law
 * as the dry plans: the wet stints must be runnable on each car's OWN I/W
 * stock (Inter 5 fresh sets/car, Wet 2/car — rarely binding, but the law is
 * one law). Not assignable → null, same shape as a missing wet life.
 */
export function buildWetPlan(
  model: SaveModel,
  laps: number,
  inventory?: TyreInventory | null,
): WetPlanResult | null {
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
  /* v0.9.1 — one law for wet too: each car must own the sets the plan runs. */
  if (inventory) {
    const wetStints = stints.map((s) => ({ compound: s.compound, laps: s.laps }));
    if (inventory.cars.some((car) => assignSetsForCar(car.sets, wetStints) == null)) {
      return null;
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

/* ── v0.9.2 — the SC/VSC what-if (roadmap v0.9 §2.2.3, probe-verified) ────── */

export type SCVSCMode = 'sc' | 'vsc';

/** The user-chosen interruption window (1-based laps, inclusive start). */
export interface SCVSCScenario {
  mode: SCVSCMode;
  /** First lap of the interruption. */
  startLap: number;
  /** Window length in laps. */
  laps: number;
}

/** One re-priced plan row (green vs scenario). */
export interface SCVSCRow {
  order: Compound[];
  stops: number;
  pitLaps: number[];
  stints: PlannedStint[];
  /** The lab's own green-flag number (unchanged). */
  greenTimeS: number;
  /** Green time with every in-window stop priced at the scenario pit cost. */
  scenarioTimeS: number;
  /** greenTimeS − scenarioTimeS, rounded 0.1 (positive = saved). */
  savedS: number;
  stopsInWindow: number;
}

/** Structured assumptions — the UI translates them (no raw strings here). */
export type SCVSCAssumptionKey =
  | 'scRatio'
  | 'vscMidpoint'
  | 'repricedOnly'
  | 'userWindow';

export interface SCVSCWhatIf {
  scenario: SCVSCScenario;
  laps: number;
  /** The lab's green pit cost — engine-calibrated, UNCHANGED by this what-if. */
  pitCostGreenS: number;
  /** Green cost scaled by the track's real columns for the scenario mode. */
  pitCostScenarioS: number;
  /** The raw Races_Tracks columns the scaling comes from (game seconds). */
  trackCols: { pitLaneS: number; greenFlagS: number; scS: number; chance: number };
  /** The lab's surviving plans re-priced, sorted by scenario time. */
  rows: SCVSCRow[];
  assumptions: Array<{ key: SCVSCAssumptionKey; params: Record<string, string | number> }>;
}

/**
 * Re-prices the tyre lab's surviving plans under an SC/VSC scenario.
 *
 * Semantics (probe-v090-pitcost §2.2.3, verified on a real F1M 24 save):
 *   - Races_Tracks carries per-track pit costs: PitLaneTimeLoss (green) and
 *     SafetyCarTimeLoss (SC). The save records no per-lap SC history, so the
 *     window itself is user input — the engine only supplies honest pricing.
 *   - The green pit cost stays the lab's own calibrated constant (never the
 *     game's raw column); the SC cost scales it by the track's REAL
 *     green→SC ratio: pitCostScenario = pitCostGreen × SC/Pit. VSC has no
 *     column of its own — midpoint between green and SC, labelled.
 *   - Only pit costs inside the window change. Deg/deltas/set assignment are
 *     untouched: every row is a plan the v0.9.1 feasibility law already
 *     passed on each car's own sets, and no new plan can appear.
 * Returns null when the save lacks the track columns (feature off, honestly)
 * or the lab has no plan to re-price.
 */
export function whatIfSCVSC(
  model: SaveModel,
  raceId: number,
  scenario: SCVSCScenario,
): SCVSCWhatIf | null {
  const race = model.races.find((r) => r.raceId === raceId) ?? null;
  if (
    !race ||
    race.trackPitLaneTimeLossS == null ||
    race.trackSafetyCarTimeLossS == null ||
    race.trackPitLaneTimeLossS <= 0
  ) {
    return null;
  }
  const lab = buildTyreLab(model, raceId);
  const d = lab.data;
  if (!d || !d.readiness.ready || d.strategies.length === 0) return null;

  const scRatio = clamp(race.trackSafetyCarTimeLossS / race.trackPitLaneTimeLossS, 0, 1);
  /* VSC: no column in the save — the green↔SC midpoint, labelled as such. */
  const ratio = scenario.mode === 'sc' ? scRatio : 1 - (1 - scRatio) / 2;
  const pitCostScenarioS = d.pitCostS * ratio;
  const discount = d.pitCostS - pitCostScenarioS;

  const rows: SCVSCRow[] = d.strategies
    .map((plan) => {
      const stopsInWindow = plan.pitLaps.filter(
        (l) => l >= scenario.startLap && l < scenario.startLap + scenario.laps,
      ).length;
      const scenarioTimeS = plan.timeS - stopsInWindow * discount;
      return {
        order: plan.order,
        stops: plan.stops,
        pitLaps: plan.pitLaps,
        stints: plan.stints,
        greenTimeS: plan.timeS,
        scenarioTimeS: Math.round(scenarioTimeS * 10) / 10,
        savedS: Math.round((plan.timeS - scenarioTimeS) * 10) / 10,
        stopsInWindow,
      };
    })
    .sort((a, b) => a.scenarioTimeS - b.scenarioTimeS);

  const assumptions: SCVSCWhatIf['assumptions'] = [];
  if (scenario.mode === 'sc') {
    assumptions.push({
      key: 'scRatio',
      params: {
        sc: race.trackSafetyCarTimeLossS,
        pit: race.trackPitLaneTimeLossS,
        green: d.pitCostS.toFixed(1),
        cost: pitCostScenarioS.toFixed(1),
      },
    });
  } else {
    assumptions.push({
      key: 'vscMidpoint',
      params: { cost: pitCostScenarioS.toFixed(1) },
    });
  }
  assumptions.push({ key: 'repricedOnly', params: {} });
  assumptions.push({ key: 'userWindow', params: {} });

  return {
    scenario,
    laps: d.laps,
    pitCostGreenS: d.pitCostS,
    pitCostScenarioS: Math.round(pitCostScenarioS * 10) / 10,
    trackCols: {
      pitLaneS: race.trackPitLaneTimeLossS,
      greenFlagS: race.trackGreenFlagTimeLossS ?? 0,
      scS: race.trackSafetyCarTimeLossS,
      chance: race.trackSafetyCarChance ?? 0,
    },
    rows,
    assumptions,
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
  /** Source used for RANKING (after the same-tier rule). v0.9.3: the
   * 'allocation'/'clamped' variants are never produced any more — a clamped
   * measurement is unusable, so the compound ranks on the model constants
   * ('model'); the variants stay in the type for older serialized labs. */
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
    /**
     * v0.9.4 — the wear correction priced on car 1's stock (same basis as
     * the lead card). Absent when 0 or when the game plan cannot be
     * assigned sets on that garage (total stays the team-cap price then).
     */
    wearS?: number;
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
  /**
   * v0.9.4 — which GARAGE this card prices on (the inventory car's label:
   * "Xe 1"/"Xe 2" while the seats are unverified, the driver's name once
   * verified). The card is a per-CAR briefing — the driver name + grid
   * slot are context, the label names the garage the sets come from.
   */
  carLabel?: string;
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
      if (src != null && practicePace.deltas[c] != null) {
        /* v0.7.1 (spec bước 5): paceMeasured carries THE RANKING delta —
           the same number the plans are priced with, straight from
           practicePace.deltas (no second delta object). When a clamp
           (degenerate floor / monotonic rule) replaced the measurement,
           rawDelta records the pre-clamp value for the honesty trail. */
        paceMeasured[c] = {
          delta: practicePace.deltas[c]!,
          source: src,
          ...(practicePace.clamped[c] ? { rawDelta: practicePace.rawDeltas[c]! } : {}),
        };
      }
    }
  }
  /* Same-tier ranking rule (v0.5.1 P0, Suzuka 2027 bug) — v0.9.3 sharpening
     (Interlagos 2027 bug): a CLAMPED value is the model's opinion, never a
     measurement, so USABLE = measured && !clamped. The ranking M and H may
     never mix tiers and never rank on allocation: exactly one usable side →
     both fall back to the model constants; allocation stays evidence only
     (the consistency pillar + the fallback assumption). */
  const mUsable = paceMeasured.M != null && practicePace?.clamped.M !== true;
  const hUsable = paceMeasured.H != null && practicePace?.clamped.H !== true;
  const sameTierFallback = mUsable !== hUsable;
  /* v0.7.1: the confound evidence quotes the RAW measured values (full
     precision) — the proof that the measurement was noise, independent of
     the ranking transform. */
  const rawMeasuredH = practicePace?.rawDeltas.H ?? null;
  const rawMeasuredM = practicePace?.rawDeltas.M ?? null;
  /* v0.6.1 → v0.9.3: the game's own allocation estimate is EVIDENCE (the
     consistency pillar, the fallback assumption) — never a ranking delta. */
  const allocPace = getAllocationPace(model);
  if (sameTierFallback) {
    const side: 'M' | 'H' = mUsable ? 'H' : 'M';
    const clampFired = practicePace?.clamped[side] === true;
    if (clampFired) {
      const raw = (side === 'H' ? rawMeasuredH : rawMeasuredM) ?? 0;
      const why =
        side === 'H'
          ? 'nhanh hơn M nên không dùng được (nhiễu — mỗi tay đua chỉ chạy 1 hợp chất)'
          : 'bị kẹp biên/sanity nên không dùng được';
      const allocNote = allocPace
        ? ` · allocation ${side} +${allocPace.deltas[side].toFixed(2)}s`
        : '';
      assumptions.push({
        text: `Practice đo được ${side} (+${raw.toFixed(3)}s) ${why} — dùng hằng số model cho cả M và H để so sánh công bằng (không trộn nguồn, không xếp hạng bằng giá trị đã clamp)`,
        fallbackValue: `M +${FALLBACK_PACE_DELTA.M}s, H +${FALLBACK_PACE_DELTA.H}s vs Soft (giá trị thô ${side} +${raw.toFixed(3)}s${allocNote})`,
      });
    } else {
      assumptions.push({
        text: `Delta ${side} chưa được đo ở track này — dùng hằng số model cho cả M và H để so sánh công bằng (không trộn nguồn đo được và không đo được)`,
        fallbackValue: `M +${FALLBACK_PACE_DELTA.M}s, H +${FALLBACK_PACE_DELTA.H}s vs Soft`,
      });
    }
  } else {
    if (mUsable && paceMeasured.M) {
      deltas.M = paceMeasured.M.delta;
      paceSource.M = paceMeasured.M.source === 'cross-session' ? 'cross-session' : 'practice';
    }
    if (hUsable && paceMeasured.H) {
      deltas.H = paceMeasured.H.delta;
      paceSource.H = paceMeasured.H.source === 'cross-session' ? 'cross-session' : 'practice';
    }
    if (!mUsable && !hUsable && paceMeasured.M != null && paceMeasured.H != null) {
      /* both measured but both clamped — no usable measurement survives */
      assumptions.push({
        text: 'Cả M và H đều đo được nhưng bị clamp (nhiễu/sanity) — không giá trị đo nào đủ tin để xếp hạng, cả hai dùng hằng số model',
        fallbackValue: `M +${FALLBACK_PACE_DELTA.M}s, H +${FALLBACK_PACE_DELTA.H}s vs Soft (giá trị thô M +${rawMeasuredM?.toFixed(3)}s, H +${rawMeasuredH?.toFixed(3)}s)`,
      });
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
        if (m && practicePace?.clamped[c] === true) {
          const raw = (c === 'H' ? rawMeasuredH : rawMeasuredM) ?? 0;
          return `${c} đo được nhưng bị loại (nhiễu) — thô +${raw.toFixed(3)}s`;
        }
        return m
          ? `${c} đo được ${fmt(m.delta)} (${m.source === 'cross-session' ? 'cross-session' : 'practice'})`
          : `${c} chưa đo được`;
      };
      label = `Practice tại ${race.trackName}: ${part('M')}, ${part('H')} — xếp hạng dùng hằng số model cho cả hai (M ${fmt(FALLBACK_PACE_DELTA.M)} / H ${fmt(FALLBACK_PACE_DELTA.H)})`;
    } else {
      const part = (c: 'M' | 'H'): string => {
        const m = paceMeasured[c];
        /* v0.9.3: the label reads the RANKING source, never the measurement
           record — a clamped compound ranks on the model constant and must
           say so even though paceMeasured keeps its record. */
        const src =
          paceSource[c] === 'model' || paceSource[c] === 'baseline'
            ? 'model'
            : m?.source === 'cross-session'
              ? 'cross-session (ít mẫu)'
              : 'practice';
        return `${c} ${fmt(deltas[c])} (${src})`;
      };
      /* v0.7.1 (spec bước 5): ONE line carrying both counts — the F1
         sessions present in the save (readiness) vs how many produced a
         measurable gap (sessionsMeasured). Monza: "2/3 session đo được delta". */
      label = `Practice deltas vs Soft: ${part('M')}, ${part('H')} (${practicePace.sessionsMeasured}/${readiness.practiceSessions} session đo được delta tại ${race.trackName})`;
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
        practiceSessions: readiness.practiceSessions,
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
  /* v0.9.4 — same-basis pricing for the game plan too (the v0.7.1 rule):
     the total above is the TEAM-cap price, but every plan card it is
     compared against is priced on car 1's stock (the ranked list's basis).
     Re-running the set-assignment law on car 1's sets and adding the wear
     correction puts the GAME/WEB row on the same basis as the lead card.
     Not assignable on car 1 → the team-cap total stays, honestly noted. */
  if (gamePlan && inventory && inventory.cars[0]) {
    const car0 = inventory.cars[0];
    const gameStints = gamePlan.stintLaps.map((l, i) => ({
      compound: gamePlan.compounds[i] as Compound,
      laps: l,
    }));
    const gameAssigns = assignSetsForCar(car0.sets, gameStints);
    if (gameAssigns) {
      const withSets = gameStints.map((st, i) => {
        const a = gameAssigns.find((x) => x.stintIndex === i)!;
        return { ...st, setUsed: { tyreSetId: a.tyreSetId, life: a.life } };
      });
      const corr = wearCorrection(withSets, car0.sets, allocPace, invCap, deg);
      if (corr.totalS !== 0) {
        gamePlan.totalTimeS = Math.round((gamePlan.totalTimeS + corr.totalS) * 10) / 10;
        gamePlan.wearS = corr.totalS;
      }
    } else {
      assumptions.push({
        text:
          'Plan của game không gán được bộ lốp trên kho Xe 1 — tổng thời gian giữ nguyên cap đội (chưa hiệu chỉnh mòn bộ được gán)',
      });
    }
  }
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
  /* v0.9.1 — the set-assignment note: names the plan, the compound, the
     stint laps it needs and the failing car's OWN stock, exactly the spec
     format: "S→M→M — cần 2 stint M (23 + 23 vòng) nhưng mỗi xe chỉ có 1 bộ M khả dụng (đời 31)" */
  const setInfeasibleNote = (plan: StrategyResult, car: InventoryCar): string => {
    const perCompound = new Map<Compound, number[]>();
    for (const st of plan.stints) {
      const laps = perCompound.get(st.compound);
      if (laps) laps.push(st.laps);
      else perCompound.set(st.compound, [st.laps]);
    }
    const parts: string[] = [];
    for (const [compound, laps] of perCompound) {
      const usable = car.sets
        .filter((s) => s.compound === compound && s.available && (s.lifeRemaining ?? 0) > 0)
        .map((s) => s.lifeRemaining as number)
        .sort((a, b) => b - a);
      const ordered = [...laps].sort((a, b) => b - a);
      if (ordered.some((l, i) => l > (usable[i] ?? 0))) {
        parts.push(
          `${ordered.length} stint ${compound} (${ordered.join(' + ')} vòng) nhưng mỗi xe chỉ có ${usable.length} bộ ${compound} khả dụng${usable.length > 0 ? ` (đời ${usable[0]})` : ''}`,
        );
      }
    }
    return `${plan.order.join('→')} — cần ${parts.join('; ')}`;
  };
  if (inventory) {
    const surviving: typeof ranked = [];
    for (const plan of ranked) {
      let split = plan.stints;
      if (capTightens) {
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
        split = plan.stints;
        let lap = 0;
        for (const st of plan.stints) {
          st.fromLap = lap + 1;
          lap += st.laps;
          st.toLap = lap;
        }
        plan.pitLaps = plan.stints.slice(0, -1).map((st) => st.toLap);
      }
      /* v0.9.1 — the set-assignment law (prompt §2): the split must be
         runnable on EACH car's OWN garage. The ranked list is team-level;
         a plan any single car cannot run is never proposed (the v0.8.1
         MarinaBay bug priced S→M→M off the TEAM's 2 M sets where each car
         owns exactly 1). */
      const assigns = inventory.cars.map((car) => assignSetsForCar(car.sets, split));
      const failingIndex = assigns.findIndex((a) => a == null);
      if (failingIndex >= 0) {
        if (!infeasibleNote) {
          infeasibleNote = setInfeasibleNote(plan, inventory.cars[failingIndex]!);
        }
        continue;
      }
      /* per-stint set info from the REAL assignment (lead garage shown at
         team level; a diverging car re-attaches its own sets in priceOn) */
      for (const a of assigns[0] as SetAssignment[]) {
        split[a.stintIndex].setUsed = {
          tyreSetId: a.tyreSetId,
          fresh: a.fresh,
          life: a.life,
        };
      }
      /* v0.9.4 — the wear correction on the ranked price: the stints above
         now name the physical sets of car 1 (the ranked list's basis, see
         garageFor); pricing the pace gap of THOSE sets (game's
         EstimatedLapTime vs the fresh median) and the deg at their real
         lives turns the team-cap price into the EXECUTION price. The rank
         order is the optimizer's output and stays untouched — only the
         price and the per-stint wear lines move. */
      if (inventory.cars[0]) {
        const corr = wearCorrection(
          split,
          inventory.cars[0].sets,
          allocPace,
          invCap,
          deg,
        );
        if (corr.totalS !== 0) {
          plan.timeS = Math.round((plan.timeS + corr.totalS) * 10) / 10;
          plan.wearS = corr.totalS;
          for (let i = 0; i < plan.stints.length; i++) {
            if (corr.perStint[i] !== 0) plan.stints[i]!.wearS = corr.perStint[i];
          }
        }
      }
      surviving.push(plan);
    }
    if (surviving.length > 0) {
      ranked.length = 0;
      ranked.push(...surviving);
      /* v0.9.1 — re-base vsBestS on the best FEASIBLE plan (the lead): a
         model-best plan the garage cannot run must never drag its old
         model-price gap (+6.4s on MarinaBay) onto the plan we propose.
         modelTimeS keeps the pre-cap price for reference. */
      const baseS = surviving[0].timeS;
      for (const s of surviving) {
        s.vsBestS = Math.round((s.timeS - baseS) * 10) / 10;
      }
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
    if ((practicePace?.sessionsMeasured ?? 0) >= 2) return true;
    const measuredC = (['M', 'H'] as const).filter((c) => practicePace?.measured[c] != null);
    if (measuredC.length === 0) return true;
    if (!allocPace) return false;
    /* v0.7.1: the comparison uses the RAW measurement (rawDeltas) — the
       ranking delta can be forced (monotonic) and comparing the allocation
       estimate against a value derived from the allocation itself would be
       circular. paceMeasured.delta is the RANKING value now, so the raw
       record is the only honest input here. */
    return measuredC.every((c) => {
      const raw = practicePace?.rawDeltas[c] ?? null;
      return raw == null || Math.abs(allocPace.deltas[c] - raw) <= 0.2;
    });
  })();

  /* v0.6.1 confidence — HIGH needs EVERY pillar; each missing one is named.
     HIGH: (a) allocation lives · (b) both M+H measured from practice ·
     ≥3 stint-factor samples · (e) no 'clamped' delta · (f) practice ≥2
     sessions or allocation consistency within 0.2s · (g) best plan beats
     the first DIFFERENT plan by ≥ 2.0s · (h) plan stops ≥ field reference
     (observed → prior → meta expectedStops). One missing pillar = MEDIUM;
     ≥ 2 missing = LOW — a HIGH badge must never rest on weak legs.
     v0.9.3: the old "forced delta" trigger is GONE — a clamped value never
     enters the ranking at all, so there is no forced delta left to punish;
     the same bug now surfaces as the pace + consistency pillars (both fail
     when a clamp discarded a measurement). */
  const missingPillars: string[] = [];
  if (!livesFromAllocation) missingPillars.push('lives');
  if (!bothPaceMeasured) missingPillars.push('pace');
  if (fewStintSamples) missingPillars.push('samples');
  if (!noPaceClamped) missingPillars.push('clamped');
  if (!paceConsistency) missingPillars.push('consistency');
  if (tieGapS == null || tieGapS < 2.0) missingPillars.push('margin');
  if (fewerPitsThanField) missingPillars.push('fieldStops');
  const confidence: Confidence =
    missingPillars.length >= 2
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
    return missing.length >= 2
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
    if (missingPillars.includes('pace')) {
      reasons.push('delta xếp hạng chưa đủ cả M và H từ practice');
    }
    if (missingPillars.includes('consistency')) {
      reasons.push(
        `practice chỉ ${practicePace?.sessionsMeasured ?? 0} session đo được delta và allocation lệch quá 0.2s so với practice`,
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
     Trail = the best feasible plan where no pit lap is shared with the
     lead (every trail pit lap ≥ 1 lap clear of every lead pit lap) —
     the offset rule IS the double-stack handling (the model has no
     queue-time constant and none may be invented). A different starting
     compound (a) is preferred when the
     plan sits within the repo's 2.0s "tie" band of the optimal plan; a
     same-compound plan qualifies through the pit gap alone (b). Without
     any qualifying plan the lead's pits shift as far as the tyres allow
     and the shortfall is stated. CẤM bịa hằng số phạt double-stack. */
  const TRAIL_PIT_GAP = 1;
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
    /* v0.9.4 — the CARD-ORDER garage (spec bước 1d): the two plan cards are
       briefings per CAR, not per driver. A verified seat keeps the old
       carOfDriver path (priced on the driver's own verified car); an
       unverified seat prices on inventory.cars[cardIndex] — lead ← car 1,
       trail ← car 2 — with THAT car's own cap and sets. No seat guessing:
       the driver name + grid slot on the card are pit-timing context, the
       label names the garage (hence carLabel). */
    const garageFor = (
      driverId: number,
      cardIndex: number,
    ): { cap: Record<Compound, number>; sets: InventorySet[] | null; carLabel: string } => {
      const verified = inventory?.cars.find(
        (c) => c.driverId === driverId && c.seatVerified,
      );
      if (verified && inventory) {
        return {
          cap: { ...lives, ...inventory.perCarMaxStint[verified.carId]! },
          sets: verified.sets,
          carLabel: verified.label,
        };
      }
      const byCard = inventory?.cars[cardIndex];
      if (byCard && inventory) {
        return {
          cap: { ...lives, ...inventory.perCarMaxStint[byCard.carId]! },
          sets: byCard.sets,
          carLabel: byCard.label,
        };
      }
      return { cap: invCap, sets: null, carLabel: `Xe ${cardIndex + 1}` };
    };
    const priceOn = (
      plan: StrategyResult,
      cap: Record<Compound, number>,
      sets: InventorySet[] | null,
    ): StrategyResult | null => {
      const sameCap = (['S', 'M', 'H'] as const).every((c) => cap[c] === invCap[c]);
      if (sameCap && !sets) return plan;
      /* v0.9.4 — the base price is the UNCORRECTED one: a ranked plan may
         already carry car 1's wear correction, and this car's own
         correction must REPLACE it, never stack on top of it. */
      let stints = plan.stints;
      let timeS = plan.timeS - (plan.wearS ?? 0);
      if (!sameCap) {
        const r = evaluateStrategy(plan.order, laps, cap, deltas, pitCostS, deg);
        if (!r) return null;
        stints = r.stints;
        timeS = Math.round(r.timeS * 10) / 10;
        let lap = 0;
        for (const st of stints) {
          st.fromLap = lap + 1;
          lap += st.laps;
          st.toLap = lap;
        }
      }
      let wearS: number | undefined;
      if (sets) {
        const assigns = assignSetsForCar(sets, stints);
        if (!assigns) return null;
        stints = stints.map((st, i) => {
          /* strip the ranked plan's per-stint wear — this car's sets are
             priced fresh below */
          const { wearS: _stintWear, ...rest } = st;
          const a = assigns.find((x) => x.stintIndex === i)!;
          return {
            ...rest,
            setUsed: { tyreSetId: a.tyreSetId, fresh: a.fresh, life: a.life },
          };
        });
        const corr = wearCorrection(stints, sets, allocPace, sameCap ? invCap : cap, deg);
        if (corr.totalS !== 0) {
          timeS = Math.round((timeS + corr.totalS) * 10) / 10;
          wearS = corr.totalS;
          stints = stints.map((st, i) =>
            corr.perStint[i] !== 0 ? { ...st, wearS: corr.perStint[i] } : st,
          );
        }
      }
      /* v0.9.4 — strip the ranked plan's wearS here: a zero correction must
         leave NO wearS at all (the ranked number belongs to a different
         garage's basis, and the spread would otherwise keep it). */
      const { wearS: _rankedWear, ...planRest } = plan;
      return {
        ...planRest,
        modelTimeS: plan.modelTimeS ?? plan.timeS,
        timeS,
        stints,
        pitLaps: stints.slice(0, -1).map((st) => st.toLap),
        ...(wearS !== undefined ? { wearS } : {}),
      };
    };
    const leadGarage = garageFor(leadGrid.driverId, 0);
    const leadPlan = priceOn(best, leadGarage.cap, leadGarage.sets) ?? best;
    /* v0.9.4 — say so only when the lead card's price/split actually moved
       off the ranked entry: re-attaching sets with a zero correction on the
       same cap changes nothing the user must know about. */
    const leadRepriced =
      leadPlan.timeS !== best.timeS ||
      leadPlan.stints.some((st, i) => st.laps !== best.stints[i]?.laps);
    if (leadPlan !== best && leadRepriced) {
      assumptions.push({
        text: 'Plan của xe lead tính lại giá trên kho lốp đúng xe đó (bộ được gán theo kho xe, cap xe có thể khác cap đội) — bảng xếp hạng phía trên vẫn xếp theo cap đội',
      });
    }
    /* v0.9.4 — the split cards are per-car briefings; while at least one
       seat is unverified the mapping card↔car is the garage order, and the
       user can swap the two plans safely (pits never share a lap on the
       candidate path — the offset rule). */
    if (inventory && inventory.cars.some((c) => !c.seatVerified)) {
      assumptions.push({
        text:
          'Ghế lái chưa xác minh — plan Xe 1 / Xe 2 theo thứ tự xe trong kho, không theo tên tay đua; nếu tay đua xếp trên của bạn ngồi xe 2, đổi 2 plan cho nhau (2 xe không pit chung vòng nên đổi được)',
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
    const trailGarage = garageFor(trailGrid.driverId, 1);
    for (const p of ranked) {
      if (p === best) continue; // the lead's ranked entry (clone or not)
      /* v0.9.1 — a trail candidate the TRAIL car cannot run on its own sets
         is skipped, never proposed */
      const priced = priceOn(p, trailGarage.cap, trailGarage.sets);
      if (!priced) continue;
      /* v0.9.4 — re-base the tie-band input on the lead CARD's execution
         price: vsBestS still carries the ranked-list gap (car-1 basis),
         which is not the gap the user will actually run */
      priced.vsBestS = Math.round((priced.timeS - leadPlan.timeS) * 10) / 10;
      if (gapOk(priced)) candidates.push(priced);
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
      /* v0.9.4 — the reason records HOW the plan was chosen: 'diff-compound'
         only when it came through the 2.0s execution-tie band; a fallback
         candidate that merely clears the pit gap is 'pit-gap' even when its
         starting compound differs (the gap, not the compound, chose it). */
      reason = trailPlan === diffCompound[0] ? 'diff-compound' : 'pit-gap';
    } else {
      /* fallback: keep the optimal plan but push its pits as far from the
         lead's as the tyres allow — never reach ≥1 is stated, not hidden.
         v0.7.1: the shift runs on the TRAIL car's own cap. v0.9.1: and on
         the TRAIL car's own sets. */
      const trailCap = trailGarage.cap;
      let bestShifted: { plan: StrategyResult; gap: number; shift: number } | null = null;
      for (const shift of [3, -3, 4, -4, 5, -5, 2, -2, 1, -1]) {
        const r = whatIfPitShift(leadPlan, laps, trailCap, deltas, pitCostS, shift, deg, trailGarage.sets ?? undefined);
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
        /* v0.9.4 — the shifted plan must CARRY the trail car's real sets and
           wear, not just be feasible on them: attach the assignment, strip
           any stale wear, and price the correction on the trail cap. A
           shifted plan that cannot be assigned is dropped (the same shape
           as the feasibility gate above). */
        let shifted = bestShifted.plan;
        if (trailGarage.sets) {
          const assigns = assignSetsForCar(trailGarage.sets, shifted.stints);
          if (!assigns) {
            shifted = null as unknown as StrategyResult;
          } else {
            shifted.stints = shifted.stints.map((st, i) => {
              const { wearS: _stale, ...rest } = st;
              const a = assigns.find((x) => x.stintIndex === i)!;
              return {
                ...rest,
                setUsed: { tyreSetId: a.tyreSetId, fresh: a.fresh, life: a.life },
              };
            });
            const corr = wearCorrection(
              shifted.stints,
              trailGarage.sets,
              allocPace,
              trailCap,
              deg,
            );
            shifted.wearS = undefined;
            if (corr.totalS !== 0) {
              shifted.timeS = Math.round((shifted.timeS + corr.totalS) * 10) / 10;
              shifted.wearS = corr.totalS;
              shifted.stints = shifted.stints.map((st, i) =>
                corr.perStint[i] !== 0 ? { ...st, wearS: corr.perStint[i] } : st,
              );
            }
          }
        }
        if (shifted) {
          trailPlan = shifted;
          reason = 'shifted';
          shiftedBy = bestShifted.shift;
        }
      }
    }
    /* v0.9.4 — the tie is an EXECUTION-time fact now: two plans tie when
       their prices on their own garages land within 2.0s. The old planKey
       branch is gone — the same stint multiset can price differently on
       two different garages, so the multiset alone is not a tie. */
    const tie =
      trailPlan != null &&
      Math.abs(trailPlan.timeS - leadPlan.timeS) < 2.0;
    if (tie) {
      assumptions.push({
        text: 'Hai plan hòa nhau về tổng thời gian thực thi — tách để tránh dẫm chân + hedge, không phải vì nhanh hơn',
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
        carLabel: leadGarage.carLabel,
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
              carLabel: trailGarage.carLabel,
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
  /* v0.9.3: PACE_DELTA_FORCED is gone — a clamped value never reaches the
     ranking, so the forced-delta state cannot exist; the same situation now
     raises SAME_TIER_PACE_FALLBACK instead. */

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
      practiceSessions: readiness.practiceSessions,
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

/* ── v0.9.7 — the free-form simulator (Strategy Builder + wet pace) ──────── */

export type SimCompound = 'S' | 'M' | 'H' | 'I' | 'W';

/** One user-assembled stint of the Strategy Builder. */
export interface SimStintInput {
  compound: SimCompound;
  laps: number;
}

/** A user-drawn rain window (1-based laps, inclusive start..start+laps-1). */
export interface RainWindow {
  startLap: number;
  laps: number;
}

/**
 * Deg constants for the simulator: S/M/H keep the oracle values; I/W BORROW
 * the Medium curve — the save carries no deg constants for wet tyres, so
 * this is a LABELLED assumption (surfaced verbatim by priceManualPlan), not
 * a measurement. No invented wet pace: pace comes only from the game's own
 * EstimatedLapTime via `wetPace`.
 */
export const SIM_DEG: DegConstants = {
  final: { ...ORACLE_DEG.final, I: 2.0, W: 2.0 },
  cliff: { ...ORACLE_DEG.cliff, I: 0.02, W: 0.02 },
  cliffThreshold: ORACLE_DEG.cliffThreshold,
};

/** The game's own wet pace, measured on the WHOLE FIELD's fresh I/W sets. */
export interface WetPace {
  /** ELT median I/W − ELT median S, rounded 2dp (the sim's wet deltas). */
  deltas: { I: number; W: number };
  /** The raw fresh-set medians (S anchor + I/W when present). */
  elt: { S: number; I: number | null; W: number | null };
  /** Fresh-set life medians per wet compound (the priced lives for I/W). */
  lives: { I: number | null; W: number | null };
  /** Fresh-set sample counts. */
  samples: { I: number; W: number };
}

/**
 * v0.9.7 — the game CARRIES wet pace: every fresh Inter/Wet set of
 * Save_CarTyreAllocation prices its own EstimatedLapTime on a wet track.
 * Same fresh rule as `getAllocationPace` (FrontLeftWear >= 0.99, ELT > 0),
 * whole field. Measured on the real saves (prompt v0.9.7 §0):
 * Shanghai S 94.24 → I +7.33 / W +18.10 (lives 84/109); Vegas
 * S 97.86 → I +8.63 / W +20.35 (lives 99/128). Returns null when the save
 * has no fresh S anchor or neither wet compound — the builder then refuses
 * I/W with an explicit error instead of inventing a number.
 */
export function wetPace(model: SaveModel): WetPace | null {
  const freshOf = (
    type: number,
  ): { elt: number[]; life: number[] } => {
    const elt: number[] = [];
    const life: number[] = [];
    for (const t of model.tyres) {
      if (
        t.weekendTyreType === type &&
        t.frontLeftWear >= 0.99 &&
        t.estimatedLapTimeS != null &&
        t.estimatedLapTimeS > 0
      ) {
        elt.push(t.estimatedLapTimeS);
        if (t.estimatedLapLifeRemaining != null) {
          life.push(t.estimatedLapLifeRemaining);
        }
      }
    }
    return { elt, life };
  };
  const sMedian = median(freshOf(2).elt);
  if (sMedian == null) return null;
  const round2 = (x: number): number => Math.round(x * 100) / 100;
  const wetOf = (type: number): { elt: number | null; life: number | null; n: number } => {
    const f = freshOf(type);
    const e = median(f.elt);
    const l = median(f.life);
    return {
      elt: e,
      life: l != null ? Math.round(l) : null,
      n: f.elt.length,
    };
  };
  const i = wetOf(3);
  const w = wetOf(4);
  if (i.elt == null && w.elt == null) return null;
  return {
    deltas: {
      I: i.elt != null ? round2(i.elt - sMedian) : 0,
      W: w.elt != null ? round2(w.elt - sMedian) : 0,
    },
    elt: { S: sMedian, I: i.elt, W: w.elt },
    lives: { I: i.life, W: w.life },
    samples: { I: i.n, W: w.n },
  };
}

/** One priced stint of a FIXED plan (no re-optimization — unlike
 *  `evaluateStrategy`, the laps are the user's input, never re-split). */
export interface FixedStint {
  compound: SimCompound;
  laps: number;
  fromLap: number;
  toLap: number;
  /** Fresh-pace delta s/lap vs Soft for this stint's compound. */
  deltaS: number;
  /** Wear seconds priced at the priced life (the caller's deg curve). */
  degS: number;
}

/**
 * Prices a FIXED stint list: Σ(delta × laps + deg(laps, pricedLife)) plus
 * every pit priced through `pitCostAt` (green or an SC/VSC window). The
 * total is rounded to 0.1s. The caller owns validation (total laps, minimum
 * stint, set feasibility) — this function only does arithmetic.
 */
export function priceFixedStints(
  stints: ReadonlyArray<{ compound: SimCompound; laps: number }>,
  pricedLives: Record<SimCompound, number>,
  deltas: Record<SimCompound, number>,
  pitCostAt: (lap: number) => number,
  deg: DegConstants = SIM_DEG,
): { timeS: number; stints: FixedStint[]; pitLaps: number[] } {
  const out: FixedStint[] = [];
  let total = 0;
  let lap = 0;
  for (const st of stints) {
    const from = lap + 1;
    const to = lap + st.laps;
    lap = to;
    const deltaS = deltas[st.compound];
    const degS = stintDegPenaltyWith(deg, st.compound, st.laps, pricedLives[st.compound]);
    total += deltaS * st.laps + degS;
    out.push({ compound: st.compound, laps: st.laps, fromLap: from, toLap: to, deltaS, degS });
  }
  const pitLaps = out.slice(0, -1).map((st) => st.toLap);
  for (const pl of pitLaps) total += pitCostAt(pl);
  return { timeS: Math.round(total * 10) / 10, stints: out, pitLaps };
}

/**
 * The pit cost at ONE lap under an SC/VSC event timeline — the cheapest
 * covering window wins (an overlap never stacks two discounts; the overlap
 * itself is surfaced as a labelled assumption by the callers). Same ratios
 * as the v0.9.2 single-window what-if, verified on real columns:
 * SC = green × clamp(SC/Pit, 0, 1); VSC = the green↔SC midpoint. No
 * covering window → the green cost, unchanged.
 */
export function pitCostAtLap(
  lap: number,
  green: number,
  trackCols: { pitLaneS: number; scS: number },
  events: SCVSCScenario[],
): number {
  const ratio =
    trackCols.pitLaneS > 0 ? clamp(trackCols.scS / trackCols.pitLaneS, 0, 1) : 0;
  let best = green;
  for (const ev of events) {
    if (lap >= ev.startLap && lap < ev.startLap + ev.laps) {
      const cost =
        ev.mode === 'sc' ? green * ratio : green * (1 - (1 - ratio) / 2);
      if (cost < best) best = cost;
    }
  }
  return best;
}

export interface ManualPlanOpts {
  /** SC/VSC windows — pits inside price at the window's cost. */
  events?: SCVSCScenario[];
  /** Rain windows — slick stints overlapping one are rejected. */
  rain?: RainWindow[];
}

/** The priced manual plan (Strategy Builder output, ok branch). */
export interface ManualPlan {
  order: SimCompound[];
  stops: number;
  timeS: number;
  /** Total wear correction — ABSENT when 0 (never a masquerading zero). */
  wearS?: number;
  stints: Array<
    FixedStint & {
      setUsed?: { tyreSetId: number; fresh: boolean; life: number };
      /** Per-stint wear correction — absent when 0. */
      wearS?: number;
    }
  >;
  pitLaps: number[];
  /** Execution gap vs the lab's best (the trail re-base of v0.9.4). */
  vsBestS: number | null;
  /** The price BEFORE the wear correction (pace + deg + pits). */
  baseTimeS: number;
}

export type ManualPlanResult =
  | { ok: true; plan: ManualPlan; carLabel: string; assumptions: string[] }
  | { ok: false; errors: string[] };

/**
 * One lap span of a manual plan (1-based, inclusive end).
 */
interface ManualSpan {
  compound: SimCompound;
  laps: number;
  from: number;
  to: number;
}

/**
 * The single assignment-shortfall diagnostic (v0.9.1 law, one error naming
 * the first failing compound): a compound used more times than the car owns
 * available sets, or a stint longer than the k-th best set's life.
 */
function manualAssignmentError(
  sets: InventorySet[],
  spans: ManualSpan[],
): string {
  for (const c of ['S', 'M', 'H', 'I', 'W'] as const) {
    const stints = spans.filter((sp) => sp.compound === c).map((sp) => sp.laps);
    if (stints.length === 0) continue;
    const usable = sets
      .filter(
        (s) =>
          s.compound === c &&
          s.available &&
          (s.lifeRemaining ?? 0) > 0,
      )
      .map((s) => s.lifeRemaining as number)
      .sort((a, b) => b - a);
    const ordered = [...stints].sort((a, b) => b - a);
    if (ordered.length > usable.length) {
      return `cần ${ordered.length} stint ${c} nhưng xe chỉ có ${usable.length} bộ ${c} khả dụng`;
    }
    for (let k = 0; k < ordered.length; k++) {
      if (ordered[k]! > (usable[k] ?? 0)) {
        return `stint ${c} dài nhất ${ordered[k]} vòng vượt đời bộ ${c} thứ ${k + 1} (${usable[k]} vòng)`;
      }
    }
  }
  return 'plan không gán được bộ lốp trên kho xe này';
}

/**
 * v0.9.7 — prices a USER-ASSEMBLED plan on ONE car's own garage: the
 * v0.9.1 set-assignment law, the v0.9.4 wear correction and the cap of
 * THAT car (execution basis = per-car cap, exactly like `priceOn`), plus
 * the game's own wet pace (`wetPace`) and an SC/VSC event timeline
 * (cheapest covering window per pit). NO re-optimization: the stints are
 * priced exactly as given (a 1-stint no-stop plan and an all-wet plan are
 * legal — the dry rule of `evaluateStrategy` does NOT apply here).
 *
 * Validation collects EVERY error before pricing (no fail-fast); only a
 * plan with zero validation errors reaches the set assignment, whose
 * shortfall is reported as a single diagnostic.
 */
export function priceManualPlan(
  model: SaveModel,
  raceId: number,
  carIndex: number,
  stints: ReadonlyArray<SimStintInput>,
  opts: ManualPlanOpts = {},
): ManualPlanResult {
  const race = model.races.find((r) => r.raceId === raceId) ?? null;
  const lab = race ? buildTyreLab(model, raceId) : null;
  const d = lab?.data ?? null;
  if (!race || !d || !d.readiness.ready || !d.inventory) {
    return { ok: false, errors: ['data gate chưa mở — cần save sau quali'] };
  }
  const car = d.inventory.cars[carIndex];
  if (!car) {
    return { ok: false, errors: [`không có xe ${carIndex + 1} trong kho`] };
  }

  const laps = d.laps;
  const errors: string[] = [];

  /* total laps must equal the race distance */
  const total = stints.reduce((sum, st) => sum + st.laps, 0);
  if (total !== laps) {
    errors.push(`tổng số vòng ${total} ≠ ${laps} vòng của chặng`);
  }
  /* minimum stint length (the builder's own floor — 4 laps) */
  for (const st of stints) {
    if (st.laps < MIN_STINT_LAPS) {
      errors.push(
        `stint ${st.compound} ${st.laps} vòng < tối thiểu ${MIN_STINT_LAPS} vòng`,
      );
    }
  }
  /* a slick stint may never overlap a rain window (1-based, end inclusive) */
  const rain = opts.rain ?? [];
  const spans: ManualSpan[] = [];
  let cursor = 0;
  for (const st of stints) {
    const from = cursor + 1;
    cursor += st.laps;
    spans.push({ compound: st.compound, laps: st.laps, from, to: cursor });
  }
  for (const sp of spans) {
    if (sp.compound === 'I' || sp.compound === 'W') continue;
    for (const rw of rain) {
      const end = rw.startLap + rw.laps - 1;
      if (sp.from <= end && sp.to >= rw.startLap) {
        errors.push(
          `stint ${sp.compound} vòng ${sp.from}–${sp.to} chạy slick trong mưa (cửa sổ ${rw.startLap}–${end})`,
        );
      }
    }
  }
  /* SC/VSC pricing needs the track's real columns */
  const hasEvents = (opts.events?.length ?? 0) > 0;
  const trackCols =
    race.trackPitLaneTimeLossS != null &&
    race.trackSafetyCarTimeLossS != null &&
    race.trackPitLaneTimeLossS > 0
      ? {
          pitLaneS: race.trackPitLaneTimeLossS,
          greenFlagS: race.trackGreenFlagTimeLossS ?? 0,
          scS: race.trackSafetyCarTimeLossS,
          chance: race.trackSafetyCarChance ?? 0,
        }
      : null;
  if (hasEvents && !trackCols) {
    errors.push(
      'thiếu cột SC/pit của track (Races_Tracks) — không định giá được SC/VSC',
    );
  }
  /* wet pricing needs the game's wet allocation */
  const usesWet = stints.some((st) => st.compound === 'I' || st.compound === 'W');
  const wet = usesWet ? wetPace(model) : null;
  if (usesWet && wet == null) {
    errors.push(
      'save không có allocation lốp mưa (I/W) — không định giá được Inter/Wet',
    );
  }
  for (const c of ['I', 'W'] as const) {
    /* the compound-specific refusal fires when wetPace EXISTS but that
       compound carries no fresh life (e.g. W rows without the save); when
       wetPace is null outright, the general error above already says why */
    if (
      stints.some((st) => st.compound === c) &&
      wet != null &&
      wet.lives[c] == null
    ) {
      errors.push(
        `không có đời lốp ${c} trong allocation — không định giá được stint ${c}`,
      );
    }
  }
  if (errors.length > 0) return { ok: false, errors };

  /* ── pricing (reached only with zero validation errors) ──────────────── */
  const pricedLives: Record<SimCompound, number> = {
    ...d.lives,
    ...d.inventory.perCarMaxStint[car.carId]!,
    /* a dry plan never reads the I/W slots; a wet plan validated above
       guarantees both are non-null */
    I: wet?.lives.I ?? 0,
    W: wet?.lives.W ?? 0,
  };
  const simDeltas: Record<SimCompound, number> = {
    S: d.deltas.S,
    M: d.deltas.M,
    H: d.deltas.H,
    I: wet?.deltas.I ?? 0,
    W: wet?.deltas.W ?? 0,
  };
  const events = opts.events ?? [];
  const cols = trackCols ?? { pitLaneS: 1, scS: 0 };
  const base = priceFixedStints(
    spans,
    pricedLives,
    simDeltas,
    (pl) => pitCostAtLap(pl, d.pitCostS, cols, events),
  );

  /* the v0.9.1 set-assignment law on THIS car's own stock */
  const assigns = assignSetsForCar(car.sets, spans);
  if (!assigns) {
    return { ok: false, errors: [manualAssignmentError(car.sets, spans)] };
  }
  const planStints: ManualPlan['stints'] = base.stints.map((fst, i) => {
    const a = assigns.find((x) => x.stintIndex === i)!;
    return {
      ...fst,
      setUsed: { tyreSetId: a.tyreSetId, fresh: a.fresh, life: a.life },
    };
  });

  /* the v0.9.4 wear correction on the assigned sets — wet medians merged
     into the allocPace basis so I/W sets price on the game's own ELT */
  const allocPace = getAllocationPace(model);
  const mergedPace: AllocationPace | null = allocPace
    ? {
        ...allocPace,
        lapTime: {
          ...allocPace.lapTime,
          I: wet?.elt.I ?? undefined,
          W: wet?.elt.W ?? undefined,
        },
      }
    : null;
  const corr = wearCorrection(planStints, car.sets, mergedPace, pricedLives, SIM_DEG);

  const timeS = Math.round((base.timeS + corr.totalS) * 10) / 10;
  const vsBestS =
    d.best != null ? Math.round((timeS - d.best.timeS) * 10) / 10 : null;

  /* labelled assumptions — rendered verbatim by the UI */
  const assumptions: string[] = [];
  if (usesWet) {
    assumptions.push(
      'pace I/W = ELT trung vị toàn trường của game cho lốp mưa (pace trên đường ướt theo game, không phải số đo practice)',
    );
    assumptions.push(
      'deg I/W mượn curve của M (save không có hằng số deg cho lốp mưa — giả định gán nhãn)',
    );
    const wetOnDry = spans.some(
      (sp) =>
        (sp.compound === 'I' || sp.compound === 'W') &&
        !rain.some((rw) => sp.from >= rw.startLap && sp.to <= rw.startLap + rw.laps - 1),
    );
    if (wetOnDry) {
      assumptions.push(
        'stint I/W chạy trên khô: giá dùng delta ELT ướt của game — thực tế còn chậm hơn, số này là cận dưới (lạc quan)',
      );
    }
  }
  if (events.length > 1) {
    const overlapped = base.pitLaps.some(
      (pl) =>
        events.filter((ev) => pl >= ev.startLap && pl < ev.startLap + ev.laps)
          .length >= 2,
    );
    if (overlapped) {
      assumptions.push('pit rơi vào 2 cửa sổ chồng lấn lấy giá rẻ nhất');
    }
  }

  const plan: ManualPlan = {
    order: spans.map((sp) => sp.compound),
    stops: spans.length - 1,
    timeS,
    ...(corr.totalS !== 0 ? { wearS: corr.totalS } : {}),
    stints: planStints.map((st, i) =>
      corr.perStint[i] !== 0 ? { ...st, wearS: corr.perStint[i] } : st,
    ),
    pitLaps: base.pitLaps,
    vsBestS,
    baseTimeS: base.timeS,
  };
  return { ok: true, plan, carLabel: car.label, assumptions };
}

/* ── v0.9.7 — the multi-window SC/VSC what-if (timeline generalization) ──── */

/** One re-priced plan row under a multi-window SC/VSC timeline. */
export interface SCVSCMultiRow {
  order: Compound[];
  stops: number;
  pitLaps: number[];
  stints: PlannedStint[];
  /** The lab's own green-flag number (unchanged). */
  greenTimeS: number;
  /** Green time with every in-window stop at its window's pit cost. */
  scenarioTimeS: number;
  /** greenTimeS − scenarioTimeS, rounded 0.1 (positive = saved). */
  savedS: number;
  /** How many of the plan's pits land in ANY user window. */
  stopsInWindows: number;
}

export interface SCVSCMultiWhatIf {
  scenarios: SCVSCScenario[];
  laps: number;
  /** The lab's green pit cost — engine-calibrated, UNCHANGED by this what-if. */
  pitCostGreenS: number;
  /** Green cost scaled by the track's real columns (rounded 0.1). */
  pitCosts: { sc: number; vsc: number };
  /** The raw Races_Tracks columns the scaling comes from (game seconds). */
  trackCols: { pitLaneS: number; greenFlagS: number; scS: number; chance: number };
  /** The lab's surviving plans re-priced, sorted by scenario time. */
  rows: SCVSCMultiRow[];
  assumptions: Array<{
    key: SCVSCAssumptionKey | 'userWindows';
    params: Record<string, string | number>;
  }>;
}

/**
 * Re-prices the tyre lab's surviving plans under a TIMELINE of SC/VSC
 * windows — the v0.9.2 single-window what-if generalized to a list, reusing
 * `pitCostAtLap` (cheapest covering window wins; an overlap never stacks).
 * Each plan keeps its rank and its v0.9.1 feasibility; only the pit costs
 * inside the windows move (same law as v0.9.2 — no new plan can appear).
 *
 * Rounding follows the single-window function exactly: the per-pit
 * discounts are summed UNROUNDED and only the totals round (M1 DoD:
 * 7.245 + 3.6225 = 10.8675 → saved 10.9, never 7.2 + 3.6 = 10.8).
 *
 * `whatIfSCVSC` (single window) stays UNTOUCHED — it is verified on a real
 * save; the multi is an addition, and with exactly one window it produces
 * identical rows (locked by test M3).
 *
 * Returns null when the save lacks the track columns, the lab is not
 * ready, there is no plan to re-price, or the timeline is empty.
 */
export function whatIfSCVSCMulti(
  model: SaveModel,
  raceId: number,
  scenarios: SCVSCScenario[],
): SCVSCMultiWhatIf | null {
  if (scenarios.length === 0) return null;
  const race = model.races.find((r) => r.raceId === raceId) ?? null;
  if (
    !race ||
    race.trackPitLaneTimeLossS == null ||
    race.trackSafetyCarTimeLossS == null ||
    race.trackPitLaneTimeLossS <= 0
  ) {
    return null;
  }
  const lab = buildTyreLab(model, raceId);
  const d = lab.data;
  if (!d || !d.readiness.ready || d.strategies.length === 0) return null;

  const trackCols = {
    pitLaneS: race.trackPitLaneTimeLossS,
    greenFlagS: race.trackGreenFlagTimeLossS ?? 0,
    scS: race.trackSafetyCarTimeLossS,
    chance: race.trackSafetyCarChance ?? 0,
  };
  const ratio = clamp(trackCols.scS / trackCols.pitLaneS, 0, 1);
  const scCost = d.pitCostS * ratio;
  const vscCost = d.pitCostS * (1 - (1 - ratio) / 2);

  const rows: SCVSCMultiRow[] = d.strategies
    .map((plan) => {
      let discountSum = 0;
      let stopsInWindows = 0;
      for (const pl of plan.pitLaps) {
        const cost = pitCostAtLap(pl, d.pitCostS, trackCols, scenarios);
        if (cost < d.pitCostS) {
          discountSum += d.pitCostS - cost;
          stopsInWindows++;
        }
      }
      const scenarioTimeS = plan.timeS - discountSum;
      return {
        order: plan.order,
        stops: plan.stops,
        pitLaps: plan.pitLaps,
        stints: plan.stints,
        greenTimeS: plan.timeS,
        scenarioTimeS: Math.round(scenarioTimeS * 10) / 10,
        savedS: Math.round(discountSum * 10) / 10,
        stopsInWindows,
      };
    })
    .sort((a, b) => a.scenarioTimeS - b.scenarioTimeS);

  const assumptions: SCVSCMultiWhatIf['assumptions'] = [];
  if (scenarios.some((s) => s.mode === 'sc')) {
    assumptions.push({
      key: 'scRatio',
      params: {
        sc: trackCols.scS,
        pit: trackCols.pitLaneS,
        green: d.pitCostS.toFixed(1),
        cost: scCost.toFixed(1),
      },
    });
  }
  if (scenarios.some((s) => s.mode === 'vsc')) {
    assumptions.push({
      key: 'vscMidpoint',
      params: { cost: vscCost.toFixed(1) },
    });
  }
  assumptions.push({ key: 'repricedOnly', params: {} });
  assumptions.push({ key: 'userWindows', params: { count: scenarios.length } });

  return {
    scenarios,
    laps: d.laps,
    pitCostGreenS: d.pitCostS,
    pitCosts: {
      sc: Math.round(scCost * 10) / 10,
      vsc: Math.round(vscCost * 10) / 10,
    },
    trackCols,
    rows,
    assumptions,
  };
}

/* ── v0.11.0 — the scenario recommender (one search under one scenario) ──── */

/** Structured assumptions of the scenario recommendation — the UI
 *  translates them (same law as the SCVSCAssumptionKey keys). */
export type ScenarioAssumptionKey = 'scRatio' | 'vscMidpoint' | 'wetDegBorrowed';

export interface ScenarioAssumption {
  key: ScenarioAssumptionKey;
  params: Record<string, string | number>;
}

/** The seed (lead) plan re-priced under the scenario: either its execution
 *  price on the examined car's own garage, or WHY it cannot run at all
 *  (the engine's verbatim validation errors — e.g. both slick stints
 *  inside a rain window). */
export type ScenarioCurrentPlan =
  | { feasible: true; plan: ManualPlan }
  | { feasible: false; errors: string[] };

export interface ScenarioRecommendation {
  laps: number;
  carIndex: number;
  carLabel: string;
  /** The cheapest feasible plan found under the scenario (execution price). */
  recommendation: ManualPlan;
  /** The next ≤ 2 distinct plans (different stint signature = different
   *  order or different pit laps), sorted by price. */
  alternates: ManualPlan[];
  currentUnderScenario: ScenarioCurrentPlan;
  /** The seed plan's published GREEN price (the delta's reference number). */
  currentGreenS: number | null;
  /** recommendation.timeS − currentGreenS, rounded 0.1 (negative = the
   *  recommendation is FASTER than the published plan). */
  deltaS: number | null;
  /**
   * 'switch' | 'keep'. UI rule (NOT a model constant): switch only when
   * the recommendation beats the published plan by MORE than 0.5s (the
   * rounding-noise band — the same ±0.05 logic scaled up: a 0.1s "gain"
   * is noise, a 2.9s gain is a decision), or when the current plan cannot
   * run the scenario at all (mandatory switch). With exactly-one-window
   * parity this keeps "keep" from flickering on ±0.1s rounding.
   */
  verdict: 'switch' | 'keep';
  assumptions: ScenarioAssumption[];
}

export interface ScenarioSearchInput {
  /** SC/VSC windows (pits inside price at the window's cost). */
  events: SCVSCScenario[];
  /** Rain windows (slick stints overlapping one are rejected). */
  rain: RainWindow[];
}

/**
 * v0.11.0 — finds the best plan UNDER a user-declared scenario (SC/VSC
 * windows + rain), the piece the three old what-if blocks never had: the
 * SC card only re-priced the top-6 green ranking, the rain toggle only
 * swapped to the preset, and neither ever moved a pit lap into a window.
 *
 * Search law (bounded — no exponential blow-up):
 *   · Dry: the SAME compound-order enumeration `buildTyreLab` uses
 *     (oneStop + multiStop 2–3 ≈ 54 orders), each priced once through
 *     `evaluateStrategy` for its OPTIMAL GREEN split; then a local search
 *     moves each pit lap into each SC/VSC window (every lap inside the
 *     window, stint minimum enforced, greedy one pass over pits — never
 *     every pit position on the lap line);
 *   · Rain: from each dry split, wet variants aligned to the rain window
 *     edges — the wet stint starts at `rain.startLap` and ends either at
 *     the window's last lap or one lap past it (both edge conventions are
 *     priced, "để giá tự quyết" — a user-typed window edge is ±1 lap
 *     honest input, not a model fact), plus the `buildWetPlan` preset;
 *   · EVERY candidate is priced on the examined car's OWN stock through
 *     the exact `priceManualPlan` path (validation, `pitCostAtLap`,
 *     `assignSetsForCar`, `wearCorrection`) — not assignable = dropped,
 *     same as an infeasible ranked plan. Wet deg borrows the M curve
 *     (SIM_DEG, the v0.9.7 labelled assumption).
 *
 * `currentUnderScenario` re-prices the SEED plan (the lab's lead — the
 * same plan the simulator seeds from) under the scenario on the same
 * car basis, so the UI can say what the user's CURRENT plan costs now.
 * The delta is measured against the seed's published GREEN price: under
 * SC a pit inside a window is a pure discount, so the headline question
 * is "how much does the scenario change my published number".
 *
 * Returns null when there is no scenario to recommend under, the data
 * gate is closed, the car/garage is missing, or SC events exist without
 * the track's real Races_Tracks columns (feature off, honestly — same
 * law as `whatIfSCVSC`).
 */
export function recommendUnderScenario(
  model: SaveModel,
  raceId: number,
  carIndex: number,
  scenario: ScenarioSearchInput,
): ScenarioRecommendation | null {
  if (scenario.events.length === 0 && scenario.rain.length === 0) return null;
  const race = model.races.find((r) => r.raceId === raceId) ?? null;
  const lab = race ? buildTyreLab(model, raceId) : null;
  const d = lab?.data ?? null;
  if (!race || !d || !d.readiness.ready || !d.inventory) return null;
  const car = d.inventory.cars[carIndex];
  if (!car) return null;

  const trackCols =
    race.trackPitLaneTimeLossS != null &&
    race.trackSafetyCarTimeLossS != null &&
    race.trackPitLaneTimeLossS > 0
      ? {
          pitLaneS: race.trackPitLaneTimeLossS,
          greenFlagS: race.trackGreenFlagTimeLossS ?? 0,
          scS: race.trackSafetyCarTimeLossS,
          chance: race.trackSafetyCarChance ?? 0,
        }
      : null;
  if (scenario.events.length > 0 && !trackCols) return null;

  const laps = d.laps;
  const events = scenario.events;
  const rain = scenario.rain;

  /* the seed (lead) plan — the same plan the simulator seeds from. Needed
     early: its compound vocabulary bounds the RAIN variant search (see the
     variant block below) and its re-price is `currentUnderScenario`. */
  const seedPlan = d.carPlans?.lead.plan ?? d.best ?? null;
  if (!seedPlan) return null;
  const seedCompounds = new Set(seedPlan.stints.map((st) => st.compound));

  /* ── the per-car pricing context, built ONCE (priceManualPlan's exact
     path minus the per-call lab rebuild — same validation strings, same
     rounding, same assignment + wear law; parity is locked by test). ── */
  const wet = wetPace(model);
  const pricedLives: Record<SimCompound, number> = {
    ...d.lives,
    ...d.inventory.perCarMaxStint[car.carId]!,
    I: wet?.lives.I ?? 0,
    W: wet?.lives.W ?? 0,
  };
  const simDeltas: Record<SimCompound, number> = {
    S: d.deltas.S,
    M: d.deltas.M,
    H: d.deltas.H,
    I: wet?.deltas.I ?? 0,
    W: wet?.deltas.W ?? 0,
  };
  const cols = trackCols ?? { pitLaneS: 1, scS: 0 };
  const allocPace = getAllocationPace(model);
  const mergedPace: AllocationPace | null = allocPace
    ? {
        ...allocPace,
        lapTime: {
          ...allocPace.lapTime,
          I: wet?.elt.I ?? undefined,
          W: wet?.elt.W ?? undefined,
        },
      }
    : null;

  const priceCandidate = (
    stints: ReadonlyArray<SimStintInput>,
  ): { ok: true; plan: ManualPlan } | { ok: false; errors: string[] } => {
    const errors: string[] = [];
    const total = stints.reduce((sum, st) => sum + st.laps, 0);
    if (total !== laps) {
      errors.push(`tổng số vòng ${total} ≠ ${laps} vòng của chặng`);
    }
    for (const st of stints) {
      if (st.laps < MIN_STINT_LAPS) {
        errors.push(`stint ${st.compound} ${st.laps} vòng < tối thiểu ${MIN_STINT_LAPS} vòng`);
      }
    }
    const spans: ManualSpan[] = [];
    let cursor = 0;
    for (const st of stints) {
      const from = cursor + 1;
      cursor += st.laps;
      spans.push({ compound: st.compound, laps: st.laps, from, to: cursor });
    }
    for (const sp of spans) {
      if (sp.compound === 'I' || sp.compound === 'W') continue;
      for (const rw of rain) {
        const end = rw.startLap + rw.laps - 1;
        if (sp.from <= end && sp.to >= rw.startLap) {
          errors.push(
            `stint ${sp.compound} vòng ${sp.from}–${sp.to} chạy slick trong mưa (cửa sổ ${rw.startLap}–${end})`,
          );
        }
      }
    }
    if (events.length > 0 && !trackCols) {
      errors.push(
        'thiếu cột SC/pit của track (Races_Tracks) — không định giá được SC/VSC',
      );
    }
    const usesWet = stints.some((st) => st.compound === 'I' || st.compound === 'W');
    if (usesWet && wet == null) {
      errors.push('save không có allocation lốp mưa (I/W) — không định giá được Inter/Wet');
    }
    for (const c of ['I', 'W'] as const) {
      if (stints.some((st) => st.compound === c) && wet != null && wet.lives[c] == null) {
        errors.push(`không có đời lốp ${c} trong allocation — không định giá được stint ${c}`);
      }
    }
    if (errors.length > 0) return { ok: false, errors };

    const base = priceFixedStints(
      spans,
      pricedLives,
      simDeltas,
      (pl) => pitCostAtLap(pl, d.pitCostS, cols, events),
      SIM_DEG,
    );
    const assigns = assignSetsForCar(car.sets, spans);
    if (!assigns) {
      return { ok: false, errors: [manualAssignmentError(car.sets, spans)] };
    }
    const planStints: ManualPlan['stints'] = base.stints.map((fst, i) => {
      const a = assigns.find((x) => x.stintIndex === i)!;
      return {
        ...fst,
        setUsed: { tyreSetId: a.tyreSetId, fresh: a.fresh, life: a.life },
      };
    });
    const corr = wearCorrection(planStints, car.sets, mergedPace, pricedLives, SIM_DEG);
    const timeS = Math.round((base.timeS + corr.totalS) * 10) / 10;
    const vsBestS = d.best != null ? Math.round((timeS - d.best.timeS) * 10) / 10 : null;
    return {
      ok: true,
      plan: {
        order: spans.map((sp) => sp.compound),
        stops: spans.length - 1,
        timeS,
        ...(corr.totalS !== 0 ? { wearS: corr.totalS } : {}),
        stints: planStints.map((st, i) =>
          corr.perStint[i] !== 0 ? { ...st, wearS: corr.perStint[i] } : st,
        ),
        pitLaps: base.pitLaps,
        vsBestS,
        baseTimeS: base.timeS,
      },
    };
  };

  /* ── candidate collection: every candidate priced ONCE, deduped by its
     stint signature (order + lap split — pits are derived from them). ── */
  const byKey = new Map<string, ManualPlan>();
  const pushCandidate = (stints: ReadonlyArray<SimStintInput>): void => {
    /* the editor holds at most 4 stints — a recommendation the user cannot
       apply would be a lie, so longer variants never enter the search */
    if (stints.length > 4) return;
    const key = `${stints.map((st) => st.compound).join('→')}:${stints.map((st) => st.laps).join('/')}`;
    if (byKey.has(key)) return;
    const priced = priceCandidate(stints);
    if (priced.ok) byKey.set(key, priced.plan);
  };

  /* the same enumeration orders `buildTyreLab` ranks on (oneStop + multi 2–3) */
  const oneStop: Compound[][] = [];
  for (const a of DRY) for (const b of DRY) if (a !== b) oneStop.push([a, b]);
  const multiStop = (n: 2 | 3): Compound[][] => {
    const orders: Compound[][] = [];
    for (const a of DRY) for (const b of DRY) for (const c of DRY) {
      if (new Set([a, b, c]).size >= 2) {
        if (n === 2) orders.push([a, b, c]);
        if (n === 3) orders.push([a, b, c, a]);
      }
    }
    return orders;
  };
  const orders: Compound[][] = [...oneStop, ...multiStop(2), ...multiStop(3)];
  /* the lab's own throwaway-stint floor (v0.6.0 sanity filter) */
  const sanityFloor = Math.max(MIN_STINT_LAPS + 1, Math.round(laps / 12));

  /* every lap inside ANY SC/VSC window (deduped, sorted) — the only laps a
     pit may move to in the local search */
  const windowLaps: number[] = (() => {
    const set = new Set<number>();
    for (const ev of events) {
      for (let L = ev.startLap; L < ev.startLap + ev.laps; L++) {
        if (L >= 1 && L <= laps) set.add(L);
      }
    }
    return [...set].sort((a, b) => a - b);
  })();

  /** The stint list with pit `i` FIXED at lap `L`: the compounds before it
   *  re-split optimally over [1..L], the compounds after over [L+1..laps]
   *  (evaluateStrategy on the sub-orders; a single-compound span is one
   *  fixed stint — the dry rule of two distinct compounds must not erase
   *  legal candidates). null when a multi-compound span cannot split. */
  const resplitAroundPit = (
    order: Compound[],
    pitIndex: number,
    lapL: number,
    totalLaps: number,
  ): SimStintInput[] | null => {
    const headOrder = order.slice(0, pitIndex + 1);
    const tailOrder = order.slice(pitIndex + 1);
    if (tailOrder.length === 0) return null;
    const headStints: SimStintInput[] | null =
      headOrder.length === 1
        ? [{ compound: headOrder[0]!, laps: lapL }]
        : (() => {
            const r = evaluateStrategy(headOrder, lapL, d.lives, d.deltas, d.pitCostS);
            return r
              ? r.stints.map((st) => ({ compound: st.compound, laps: st.laps }))
              : null;
          })();
    if (!headStints) return null;
    const tailStints: SimStintInput[] | null =
      tailOrder.length === 1
        ? [{ compound: tailOrder[0]!, laps: totalLaps - lapL }]
        : (() => {
            const r = evaluateStrategy(tailOrder, totalLaps - lapL, d.lives, d.deltas, d.pitCostS);
            return r
              ? r.stints.map((st) => ({ compound: st.compound, laps: st.laps }))
              : null;
          })();
    if (!tailStints) return null;
    return [...headStints, ...tailStints];
  };

  for (const order of orders) {
    const split = evaluateStrategy(order, laps, d.lives, d.deltas, d.pitCostS);
    if (!split) continue;
    if (split.stints.some((st) => st.laps < sanityFloor)) continue;
    /* candidate A — the optimal GREEN split priced under the scenario */
    pushCandidate(split.stints.map((st) => ({ compound: st.compound, laps: st.laps })));

    /* local search — for EACH pit, try EVERY lap inside the windows; the
       pit is FIXED at the trial lap and the stints before/after it are
       re-split OPTIMALLY over the remaining spans (evaluateStrategy on the
       sub-orders — a single-compound span becomes one fixed stint). This
       is what turns a green 19/18/19 into the DoD's S25/M13/S18: pit 1
       moves to 25, the [M,S] tail re-splits 13/18. Bounded: pits × window
       laps, never the whole lap line. */
    if (events.length > 0 && windowLaps.length > 0) {
      for (let i = 0; i < order.length - 1; i++) {
        for (const L of windowLaps) {
          const cand = resplitAroundPit(order, i, L, laps);
          if (cand) pushCandidate(cand);
        }
      }
    }

    /* rain variants from THIS dry split (only when rain exists). The
       variant's DRY compounds must stay inside the seed plan's own
       vocabulary: the rain plan is an ADAPTATION of the race the user
       already planned — it recombines the compounds that plan commits to
       (plus the wet tyres the scenario forces). Measured on Shanghai
       (seed S/S/M): letting every order contribute its tail leaks
       S18/I10/H28 (163.6s) above the DoD's second alternate
       S18/I10/M28 (164.6s) — an H stint the weekend plan never
       considered; the vocabulary rule keeps the adaptation honest. The
       DRY search below keeps the FULL enumeration. */
    if (rain.length > 0 && wet != null) {
      const variants = rainVariantsFromSplit(split.stints, rain, laps);
      for (const v of variants) {
        if (!v.every((st) => st.compound === 'RAIN' || seedCompounds.has(st.compound))) {
          continue;
        }
        for (const wetC of ['I', 'W'] as const) {
          pushCandidate(
            v.map((st) =>
              st.compound === 'RAIN'
                ? { compound: wetC, laps: st.laps }
                : { compound: st.compound as SimCompound, laps: st.laps },
            ),
          );
        }
      }
    }
  }

  /* the wet preset (buildWetPlan) as its own candidate — the old rain
     toggle's plan keeps its place in the search */
  if (rain.length > 0 && wet != null) {
    const preset = buildWetPlan(model, laps, d.inventory);
    if (preset) pushCandidate(preset.stints);
  }

  if (byKey.size === 0) return null;
  /* the seed's stint signature — an EXACT price tie prefers the plan the
     user is already running (measured on Shanghai SC [19,21]: S→S→M and
     S→M→S tie to the stint multiset {S19,S19,M18}; the seed match picks
     the "giữ plan, pit dưới SC" reading instead of an order-equivalent
     twin) */
  const seedKey = `${seedPlan.stints.map((st) => st.compound).join('→')}:${seedPlan.stints.map((st) => st.laps).join('/')}`;
  const ranked = [...byKey.entries()]
    .map(([key, plan]) => ({ key, plan }))
    .sort(
      (a, b) =>
        a.plan.timeS - b.plan.timeS ||
        (a.key === seedKey ? 0 : 1) - (b.key === seedKey ? 0 : 1) ||
        a.plan.stops - b.plan.stops ||
        a.plan.order.join('→').localeCompare(b.plan.order.join('→')),
    );
  const recommendation = ranked[0]!.plan;
  /* alternates: the next ≤ 2 DISTINCT stint signatures (the dedup key
     above already guarantees distinctness) */
  const alternates = ranked.slice(1, 3).map((r) => r.plan);

  /* the seed re-priced under the scenario on THIS car's stock */
  const seedPriced = priceCandidate(
    seedPlan.stints.map((st) => ({ compound: st.compound as SimCompound, laps: st.laps })),
  );
  const currentUnderScenario: ScenarioCurrentPlan = seedPriced.ok
    ? { feasible: true, plan: seedPriced.plan }
    : { feasible: false, errors: seedPriced.errors };
  const currentGreenS = Math.round(seedPlan.timeS * 10) / 10;
  const deltaS =
    currentGreenS != null
      ? Math.round((recommendation.timeS - currentGreenS) * 10) / 10
      : null;
  /* the 0.5s rule is a UI law (see ScenarioRecommendation.verdict) */
  const verdict: 'switch' | 'keep' =
    !currentUnderScenario.feasible || (deltaS != null && deltaS < -0.5)
      ? 'switch'
      : 'keep';

  const assumptions: ScenarioAssumption[] = [];
  if (events.some((e) => e.mode === 'sc') && trackCols) {
    const scCost = d.pitCostS * clamp(trackCols.scS / trackCols.pitLaneS, 0, 1);
    assumptions.push({
      key: 'scRatio',
      params: {
        sc: trackCols.scS,
        pit: trackCols.pitLaneS,
        green: d.pitCostS.toFixed(1),
        cost: scCost.toFixed(1),
      },
    });
  }
  if (events.some((e) => e.mode === 'vsc') && trackCols) {
    const vscCost = d.pitCostS * (1 - (1 - clamp(trackCols.scS / trackCols.pitLaneS, 0, 1)) / 2);
    assumptions.push({ key: 'vscMidpoint', params: { cost: vscCost.toFixed(1) } });
  }
  if (recommendation.stints.some((st) => st.compound === 'I' || st.compound === 'W')) {
    assumptions.push({ key: 'wetDegBorrowed', params: {} });
  }

  return {
    laps,
    carIndex,
    carLabel: car.label,
    recommendation,
    alternates,
    currentUnderScenario,
    currentGreenS,
    deltaS,
    verdict,
    assumptions,
  };
}

/**
 * v0.11.0 — the rain-variant shapes from ONE dry split: the dry stints
 * before the first rain window keep their compounds AND their internal
 * pits (truncated at the window's first lap); each rain window becomes
 * ONE wet stint (compound decided by the caller — I and W are both
 * priced); every dry lap AFTER the first window runs the compound of the
 * first stint that lies fully past the last window (the lead's own
 * M18 stays M for its post-window remainder — measured on Shanghai:
 * S18/I10/M28 is the third-best rain plan, exactly the DoD's alternate).
 * Returns lap-split segments with the sentinel compound 'RAIN' for the
 * wet stints, or an empty array when no variant fits (window past the
 * race distance). Stints shorter than the builder floor fail validation
 * in the pricing path — an honestly infeasible variant, not an error.
 */
interface RainVariantStint {
  compound: Compound | 'RAIN';
  laps: number;
}

function rainVariantsFromSplit(
  splitStints: PlannedStint[],
  rain: RainWindow[],
  laps: number,
): RainVariantStint[][] {
  /* merge the user windows into sorted, non-touching intervals
     (1-based inclusive [start, end]) */
  const ivs = rain
    .filter((rw) => rw.laps > 0 && rw.startLap >= 1 && rw.startLap <= laps)
    .map((rw) => ({ start: rw.startLap, end: Math.min(rw.startLap + rw.laps - 1, laps) }))
    .sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const iv of ivs) {
    const last = merged[merged.length - 1];
    if (last && iv.start <= last.end + 1) {
      last.end = Math.max(last.end, iv.end);
    } else {
      merged.push({ ...iv });
    }
  }
  if (merged.length === 0) return [];

  /* the first NON-touching stint's compound: the dry compound that runs
     every dry lap after the first window */
  let cursor = 0;
  let postCompound: Compound | null = null;
  for (const st of splitStints) {
    const stStart = cursor + 1;
    cursor += st.laps;
    if (stStart > merged[merged.length - 1]!.end) {
      postCompound = st.compound;
      break;
    }
  }
  /* no dry stint survives past the last window — the dry laps after the
     first window carry the compound of the last PRE-window stint (the
     stint the window truncates) */
  const fallbackCompound = (() => {
    let pos = 0;
    let compound: Compound | null = null;
    for (const st of splitStints) {
      if (pos + 1 >= merged[0]!.start) break;
      compound = st.compound;
      pos += st.laps;
    }
    return compound;
  })();
  const dryAfterCompound = postCompound ?? fallbackCompound ?? splitStints[0]!.compound;

  /* two edge conventions per window set — the caller prices both:
     'exact' ends the wet stint at the window's last lap; 'spill' runs one
     lap past it (the "kết thúc ở startLap + laps" reading of the window
     edge). Both are honest readings of a user-typed window. */
  const conventions: Array<(end: number) => number> = [
    (end) => end,
    (end) => Math.min(laps, end + 1),
  ];

  const out: RainVariantStint[][] = [];
  for (const conv of conventions) {
    /* re-merge under this convention (spill can make windows touch) */
    const ivs2 = merged
      .map((iv) => ({ start: iv.start, end: conv(iv.end) }))
      .sort((a, b) => a.start - b.start);
    const wetIvs: { start: number; end: number }[] = [];
    for (const iv of ivs2) {
      const last = wetIvs[wetIvs.length - 1];
      if (last && iv.start <= last.end + 1) {
        last.end = Math.max(last.end, iv.end);
      } else {
        wetIvs.push({ ...iv });
      }
    }
    const stints: RainVariantStint[] = [];
    /* pre part — original compounds + internal pits, truncated at the
       first window's first lap.
       v0.11.1 — the TRUNCATED head (the touching stint's dry remainder
       before the window) FOLDS INTO THE PREVIOUS STINT instead of living
       as its own segment: one fewer stint and one fewer pit than a
       separate head. Owner-measured on Shanghai rain [47,56] (the window
       starts mid-M18 of the S19/S19/M18 lead): the reference engine
       answers S19/S27/I10 at 151.8s — the head laps [39..46] run on the
       previous stint's compound — while a separate head gives
       S19/S19/M8/I10 at 163s. No previous stint → the head keeps its own
       compound (the [19,28] lead case) — every locked number unchanged,
       re-verified by the full suite. */
    let cursor2 = 0;
    for (const st of splitStints) {
      const stStart = cursor2 + 1;
      if (stStart >= wetIvs[0]!.start) break;
      const headLaps = Math.min(st.laps, wetIvs[0]!.start - stStart);
      const truncated = headLaps < st.laps;
      const prev = stints[stints.length - 1];
      if (truncated && prev) {
        prev.laps += headLaps;
      } else {
        stints.push({ compound: st.compound, laps: headLaps });
      }
      cursor2 += st.laps;
    }
    /* wet stints + the dry gaps between/after them (one compound) */
    for (let k = 0; k < wetIvs.length; k++) {
      const iv = wetIvs[k]!;
      stints.push({ compound: 'RAIN', laps: iv.end - iv.start + 1 });
      const gapStart = iv.end + 1;
      const gapEnd = k + 1 < wetIvs.length ? wetIvs[k + 1]!.start - 1 : laps;
      if (gapEnd >= gapStart) {
        stints.push({ compound: dryAfterCompound, laps: gapEnd - gapStart + 1 });
      }
    }
    /* drop a trailing stint that would exceed the race (cannot happen:
       gaps are clamped) and the degenerate empty shape */
    if (stints.length > 0 && stints.every((st) => st.laps > 0)) {
      out.push(stints);
    }
  }
  return out;
}
