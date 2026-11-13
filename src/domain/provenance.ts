/**
 * Provenance types — the trust vocabulary of the whole app. Phase 0.
 *
 * Every derived number must carry where it came from (docs/00-README-VISION.md
 * golden rule 2: "Traceable > Clever").
 *
 * Confidence semantics (docs/00-README-VISION.md):
 *   HIGH   = measured directly from the save
 *   MEDIUM = derived from historical averages inside the save
 *   LOW    = model constant used because the save lacks the data
 */

export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface Evidence {
  /** Table or constant the value comes from, e.g. 'Races_PitStopTimings'. */
  source: string;
  /** Human-readable label, e.g. 'Pit history tại Bahrain, 3 chặng'. */
  label: string;
  detail?: string;
  seasonId?: number;
  raceId?: number;
}

export interface Assumption {
  /** e.g. 'Dùng trung bình save vì thiếu pit history tại track này'. */
  text: string;
  /** e.g. '≈ 0.28 × race distance'. */
  fallbackValue?: string;
}

export interface Recommendation {
  id: string;
  title: string;
  /** Concrete verb-first action. */
  action: string;
  why: string;
  confidence: Confidence;
  evidence: Evidence[];
  assumptions: Assumption[];
  riskIfIgnored?: string;
  /** Must be explicitly marked as an estimate, e.g. '+2.3s vs 1-stop'. */
  expectedGain?: string;
}
