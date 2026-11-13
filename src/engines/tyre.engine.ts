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
import type { SaveModel, Race } from '../domain/types';

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
 */
export function getStintFactor(model: SaveModel, trackId: number): StintFactor {
  const byTrack: Record<number, number[]> = {};
  const all: number[] = [];
  for (const race of model.races) {
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
export function getObservedStops(model: SaveModel, trackId: number): ObservedStops | null {
  let totalStops = 0;
  let driverRaces = 0;
  for (const race of model.races) {
    if (race.trackId !== trackId || race.state !== 2) continue;
    const pitStops = race.pitStops ?? [];
    if (pitStops.length === 0 || race.results.length === 0) continue;
    totalStops += pitStops.length;
    driverRaces += race.results.length;
  }
  if (driverRaces === 0) return null;
  return { avgStopsPerDriver: totalStops / driverRaces, samples: driverRaces };
}

export interface PracticePace {
  /** Seconds per lap vs Soft. */
  deltas: { S: 0; M: number | null; H: number | null };
  sessions: number;
}

/**
 * Compound pace deltas from practice best laps at this track (oracle logic):
 * per session, best per compound with ≥ MIN_PACE_SAMPLE drivers; gaps in
 * seconds; median across sessions; sanity-clamped and monotonic.
 */
export function getPracticePace(model: SaveModel, trackId: number): PracticePace | null {
  const bySession = new Map<string, Partial<Record<Compound, number>>>();
  for (const race of model.races) {
    if (race.trackId !== trackId) continue;
    const perSession = new Map<number, Map<Compound, { best: number; drivers: Set<number> }>>();
    for (const p of race.practice ?? []) {
      const compound = PRACTICE_TYRE[p.bestLapTyre];
      if (!compound) continue;
      const laps = p.bestLapMs / 1000; // model ms → seconds
      if (!(laps > 0)) continue;
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
  if (bySession.size === 0) return null;

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
  if (sessionCount === 0) return null;

  const mSM = median(gapsSM);
  const mMH = median(gapsMH);
  const mSH = median(gapsSH);
  const deltas: { S: 0; M: number | null; H: number | null } = { S: 0, M: null, H: null };
  if (mSM != null) deltas.M = mSM;
  else if (mSH != null && mMH != null) deltas.M = mSH - mMH;
  if (mSH != null && (gapsSH.length >= 2 || mSM == null)) deltas.H = mSH;
  else if (mSM != null && mMH != null) deltas.H = mSM + mMH;
  else if (mSH != null) deltas.H = mSH;
  if (deltas.M == null && deltas.H == null) return null;
  // Sanity: positive, bounded, monotonic (oracle clamps).
  if (deltas.M != null) deltas.M = clamp(deltas.M, 0.05, 2.5);
  if (deltas.H != null) {
    deltas.H = clamp(deltas.H, 0.1, 3.5);
    if (deltas.M != null && deltas.H <= deltas.M) deltas.H = deltas.M + 0.15;
  }
  return { deltas, sessions: sessionCount };
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

/* ── the engine ──────────────────────────────────────────────────────────── */

export interface TyreLab {
  raceId: number;
  trackName: string;
  laps: number;
  pitLaneLossS: number;
  pitCostS: number;
  lives: Record<Compound, number>;
  lifeSource: Record<Compound, 'allocation' | 'track' | 'model'>;
  deltas: Record<Compound, number>;
  paceSource: Record<Compound, 'practice' | 'model' | 'baseline'>;
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
  gamePlan: {
    compounds: Compound[];
    stintLaps: number[];
    pitLaps: number[];
  } | null;
}

export interface TyreLabOptions {
  /** Exclude one race from history (backtesting); default none. */
  excludeRaceId?: number;
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

  /* life ceilings — evidence priority: allocation > track > model (oracle) */
  const stintFactor = getStintFactor(model, race.trackId);
  const caps = getCompoundCaps(model);
  const allocationFresh = caps != null && model.tyres.length > 0;
  // Only the active weekend's allocation describes THESE tyres — approximate
  // "active weekend" as the race being planned (state !== 2) in v1.
  const useAllocation = allocationFresh && race.state !== 2;

  const lives: Record<Compound, number> = { S: 0, M: 0, H: 0 };
  const lifeSource: Record<Compound, 'allocation' | 'track' | 'model'> = {
    S: 'model', M: 'model', H: 'model',
  };
  for (const c of DRY) {
    const shaped = Math.max(4, Math.round(laps * stintFactor.factor * FALLBACK_LIFE_SHAPE[c]));
    let life: number;
    let src: 'allocation' | 'track' | 'model';
    if (caps && useAllocation && stintFactor.source !== 'track') {
      life = Math.max(4, caps[c]);
      src = 'allocation';
    } else if (caps && useAllocation) {
      life = Math.min(shaped, Math.max(4, caps[c]));
      src = 'track';
    } else if (stintFactor.source === 'track') {
      life = shaped;
      src = 'track';
    } else {
      life = Math.max(4, Math.round(laps * FALLBACK_LIFE_SHAPE[c] * PHYSICAL_LIFE_FALLBACK));
      src = 'model';
    }
    // Durability clamp (oracle): allocation's fresh S median caps all paths.
    if (caps && !useAllocation && caps[c] != null) {
      life = Math.min(life, Math.max(4, caps[c]));
    }
    lives[c] = life;
    lifeSource[c] = src;
  }
  // Physical order S ≤ M ≤ H.
  lives.M = Math.max(lives.M, lives.S);
  lives.H = Math.max(lives.H, lives.M);

  /* expected field stops */
  const observed = getObservedStops(model, race.trackId);
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
  const practicePace = getPracticePace(model, race.trackId);
  const deltas: Record<Compound, number> = { S: 0, M: FALLBACK_PACE_DELTA.M, H: FALLBACK_PACE_DELTA.H };
  const paceSource: Record<Compound, 'practice' | 'model' | 'baseline'> = {
    S: 'baseline', M: 'model', H: 'model',
  };
  if (practicePace) {
    if (practicePace.deltas.M != null) {
      deltas.M = Math.round(practicePace.deltas.M * 100) / 100;
      paceSource.M = 'practice';
    }
    if (practicePace.deltas.H != null) {
      deltas.H = Math.round(practicePace.deltas.H * 100) / 100;
      paceSource.H = 'practice';
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

  /* in-game strategist plan (Save_PlayerStrategyStints ≈ model.tyres v1 note:
     game plan table not yet normalized — Phase 1 backlog; reported as null) */
  const gamePlan: TyreLab['gamePlan'] = null;

  /* confidence: HIGH needs save-measured lives AND pace; MEDIUM for partial
     save evidence; LOW for pure model constants (docs/00 §1.6 semantics) */
  const lifeEvidence = lifeSource.S !== 'model' || lifeSource.M !== 'model';
  const paceEvidence = paceSource.M === 'practice' || paceSource.H === 'practice';
  const stopsEvidence = expectedSource === 'track';
  const evidenceCount = [lifeEvidence, paceEvidence, stopsEvidence].filter(Boolean).length;
  const confidence: Confidence =
    evidenceCount >= 2 && lifeEvidence ? 'HIGH' : evidenceCount >= 1 ? 'MEDIUM' : 'LOW';

  /* evidence + assumptions (traceability contract) */
  const evidence: Evidence[] = [];
  evidence.push({
    source: 'Races/tyre model',
    label: `Tyre life S/M/H = ${lives.S}/${lives.M}/${lives.H} vòng (nguồn: ${lifeSource.S === lifeSource.M && lifeSource.M === lifeSource.H ? lifeSource.S : 'mix'})`,
    detail: `stint factor ${(stintFactor.factor * 100).toFixed(0)}% (${stintFactor.source}, ${stintFactor.samples} mẫu)`,
  });
  if (practicePace) {
    evidence.push({
      source: 'Races_PracticeResults',
      label: `Practice deltas vs Soft: M +${deltas.M.toFixed(2)}s, H +${deltas.H?.toFixed(2) ?? 'n/a'}s (${practicePace.sessions} session tại ${race.trackName})`,
    });
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

  const assumptions: Assumption[] = [];
  if (lifeSource.S === 'model') {
    assumptions.push({
      text: 'Thiếu allocation fresh-set trong save — dùng envelope mô hình (S ≈ 0.51×, M ≈ 0.75×, H ≈ 0.92× quãng đường)',
      fallbackValue: `${lives.S}/${lives.M}/${lives.H} vòng`,
    });
  }
  if (paceSource.M === 'model') {
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

  const warnings: string[] = [];
  if (race.state === 2) warnings.push('RACE_ALREADY_COMPLETED');

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
