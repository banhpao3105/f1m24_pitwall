/**
 * Per-track correction records — v0.5.1 P2, LOCAL-ONLY (docs/00 §1.1).
 *
 * After a completed race the app stores what the engine predicted vs what
 * the field actually did ({trackId, predictedStops, fieldAvgStops,
 * predictedPitLap, playerPitLaps}); the next visit to the same track shows
 * the prior and caps confidence until the plan is at least as pit-heavy as
 * the field. The correction NEVER overrides the optimizer — warning +
 * confidence only (owner prompt §3c).
 *
 * Storage: IndexedDB via idb-keyval, store `pitwall` / `track-corrections`
 * (versioned records, v1). Never uploaded, never committed, deleting the
 * browser storage removes every trace — same contract as save-db.ts.
 */

import { createStore, get, set, type UseStore } from 'idb-keyval';

export const TRACK_CORRECTIONS_VERSION = 1 as const;

export interface TrackCorrectionRecord {
  trackId: number;
  raceId: number;
  seasonId: number;
  savedAt: string; // ISO
  /** What the engine recommended for that race (best plan). */
  predictedStops: number | null;
  predictedPitLap: number | null;
  /** Field average stops/driver at that track (Races_PitStopTimings). */
  fieldAvgStops: number | null;
  /** The player's own pit laps that race (Races_Results + timings). */
  playerPitLaps: number[];
  version: typeof TRACK_CORRECTIONS_VERSION;
}

const DB_NAME = 'pitwall';
const STORE_NAME = 'track-corrections';
const keyFor = (trackId: number): string => `tc:v1:${trackId}`;

let cachedStore: UseStore | null | undefined;

/** Lazy store init — SSR and private-mode safe (best-effort, never throws). */
function store(): UseStore | null {
  if (cachedStore === undefined) {
    try {
      cachedStore =
        typeof indexedDB !== 'undefined' ? createStore(DB_NAME, STORE_NAME) : null;
    } catch {
      cachedStore = null;
    }
  }
  return cachedStore;
}

export async function getTrackCorrection(
  trackId: number,
): Promise<TrackCorrectionRecord | null> {
  const s = store();
  if (!s) return null;
  try {
    return (await get<TrackCorrectionRecord>(keyFor(trackId), s)) ?? null;
  } catch {
    return null;
  }
}

export async function putTrackCorrection(rec: TrackCorrectionRecord): Promise<void> {
  const s = store();
  if (!s) return;
  try {
    await set(keyFor(rec.trackId), rec, s);
  } catch {
    // Quota / private mode — the correction is best-effort by contract.
  }
}
