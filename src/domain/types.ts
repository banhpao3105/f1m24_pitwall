/**
 * Normalized Model — the single contract between parser and UI.
 * v0: Phase 0. v1: Phase 2 adds parts/finance/personnel/regulations.
 *
 * Source: docs/01-AUDIT-DATA.md §4.4 (file 04 — Data Model).
 * Rules:
 *   - JSON-serializable only (no SQL.Database, no ArrayBuffer).
 *   - Every race result row is pre-joined with driver/team names.
 *   - Lap times in ms, gaps in seconds, money in game units.
 *   - Missing optional tables degrade gracefully via `availability` +
 *     `tablesMissing` — never a crash, never a fake zero.
 */

import type { Evidence, Assumption, Confidence, Recommendation } from './provenance';

export type GameVersionId = 'F1M22' | 'F1M23' | 'F1M24' | 'UNKNOWN';

export interface SaveMeta {
  /** SHA-256 of the raw .sav bytes — dedupe + IndexedDB key. */
  id: string;
  fileName: string;
  fileSizeBytes: number;
  gameVersion: GameVersionId;
  saveGameVersion: number;
  engineVersion?: string;
  gameVersionWithBuild?: string;
  saveGameClassName?: string;
  parsedAt: string; // ISO
  seasonId: number;
  day: number;
  playerTeamId: number;
  tablesPresent: string[];
  tablesMissing: string[];
  warnings: string[];
}

export interface Team {
  teamId: number;
  teamName: string;
  isCustomTeam: boolean;
  formula: number;
  colourPrimary?: string;
}

export interface Driver {
  staffId: number;
  fullName: string;
  /** 3-letter code from Staff_DriverData.DriverCode, if present. */
  code?: string;
  /** Team from the most recent driver contract (ContractType=0). */
  teamId?: number;
}

export interface StaffMember {
  staffId: number;
  fullName: string;
  role: string;
}

export interface Season {
  seasonId: number;
  year?: number;
}

export interface WeatherInfo {
  raceTempC?: number;
  raceRain?: boolean;
  /** Phase 3 (Gazette narrative, oracle weatherLine): Races.RainPractice. */
  practiceRain?: boolean;
  /** Phase 3: Races.RainQualifying. */
  qualifyingRain?: boolean;
}

export interface RaceResult {
  driverId: number;
  driverName: string;
  teamId: number;
  teamName: string;
  finishingPos: number;
  startingPos?: number;
  points: number;
  dnf: boolean;
  laps?: number;
  /** Fastest lap time in ms. */
  fastestLapMs?: number;
  /**
   * Total race time in ms (Races_Results.Time, stored seconds — converted at
   * the parser boundary). Phase 3: gap computation for the Gazette results
   * table. Missing (old schemas) → gap column degrades.
   */
  totalTimeMs?: number;
  /** SuccessfulOvertakes (Phase 3, Gazette aggregates). */
  overtakes?: number;
  /** SafetyCarDeployments — same value repeated on every row of the race. */
  safetyCarDeployments?: number;
  /** VirtualSafetyCarDeployments — same value repeated on every row. */
  vscDeployments?: number;
}

export interface QualifyingResult {
  driverId: number;
  driverName: string;
  teamId: number;
  finishingPos: number;
  /** Fastest lap time in ms. */
  fastestLapMs?: number;
  championshipPoints?: number;
}

export interface PitStop {
  driverId: number;
  teamId: number;
  /** First lap the stop spans (oracle: MIN(Lap) per PitStopID). */
  lap: number;
  /** Total stop duration in ms. */
  durationMs: number;
  pitStopId?: number;
}

export interface PracticeResult {
  driverId: number;
  teamId: number;
  session: number;
  /** Best lap in ms. */
  bestLapMs: number;
  /** 0=H, 1=M, 2=S (oracle practice encoding). */
  bestLapTyre: number;
}

export interface Race {
  raceId: number;
  seasonId: number;
  trackId: number;
  trackName: string;
  day: number;
  /** 2 = completed (docs/01-AUDIT-DATA.md §4.2). */
  state: number;
  isSprint: boolean;
  laps?: number;
  weather?: WeatherInfo;
  results: RaceResult[];
  qualifying?: QualifyingResult[];
  pitStops?: PitStop[];
  practice?: PracticeResult[];
  /* ── Track facts (Races_Tracks, Phase 3 — Gazette preview + trivia) ── */
  /** TrackLength in km (oracle: track.TrackLength). */
  trackLengthKm?: number;
  /** TypeOfTrack: 1 = downforce, 2 = power, else balanced (oracle odds). */
  trackType?: number;
  trackFirstRaceYear?: number;
  /** All-time track lap record (Races_Tracks.FastestLap, ms). */
  trackFastestLapMs?: number;
  trackFastestLapDriverId?: number;
  trackFastestLapYear?: number;
  sprintResults?: {
    driverId: number;
    teamId: number;
    finishingPos: number;
    points: number;
  }[];
}

export interface StandingRow {
  position: number;
  id: number;
  name: string;
  teamId?: number;
  points: number;
}

export interface TyreAllocation {
  carId: number;
  tyreSetId: number;
  /** 0=W, 1=I, 2=S, 3=M, 4=H (oracle encoding). */
  weekendTyreType: number;
  /** 0 = fresh … 1 = worn (oracle: fresh fresh-set filter is >= 0.99). */
  frontLeftWear: number;
  availabilityState: number;
  estimatedLapLifeRemaining?: number;
}

/* ── Phase 2 sections — schema-adaptive (docs/01 §4.3 degradation) ────────
 * Columns for Parts_*, Finance_*, Staff_* detail and Regulations_* have NOT
 * been verified against a real save yet (no introspected fixture captures
 * them). Repositories map candidate columns at runtime (see
 * parser/repositories/adaptive.ts); unmapped concepts stay undefined and
 * engines degrade to confidence LOW with an explicit assumption.
 */

/** A designed part (Parts_Designs) with its stat values when mapped. */
export interface PartDesign {
  designId: number;
  teamId?: number;
  /** Part type as stored: string label or numeric FK coerced to string. */
  partType?: string;
  name?: string;
  status?: string;
  /** Design/development points if the column maps. */
  points?: number;
  /** Build cost in game currency if the column maps. */
  cost?: number;
  /** Build duration in days if the column maps. */
  buildDays?: number;
  stats: { name: string; value: number }[];
}

/** An installed/manufactured part instance (Parts_Items). */
export interface PartItem {
  itemId: number;
  designId?: number;
  carId?: number;
  teamId?: number;
  partType?: string;
  /** Normalized 0..1 (auto-detected 0..1 vs 0..100 scale at parse time). */
  condition?: number;
  faultCount?: number;
}

export interface CarLoadoutRow {
  carId: number;
  itemId?: number;
  slot?: string;
}

export interface TeamExpertiseRow {
  teamId: number;
  partType?: string;
  expertise?: number;
  /** Verified column from the old tool (docs/01 §2.1: NextSeasonExpertise). */
  nextSeasonExpertise?: number;
}

export interface FinanceTransactionRow {
  txId: number;
  teamId?: number;
  day?: number;
  amount?: number;
  category?: string;
  note?: string;
}

export interface StaffContractRow {
  staffId: number;
  teamId?: number;
  /** 0 = driver contract, 3 = future/pre-signed contract (oracle transfers). */
  contractType?: number;
  salary?: number;
  endDay?: number;
  durationDays?: number;
  /** StartDay (OLE date) — Phase 3, Gazette transfer effective season. */
  startDay?: number;
  /** EndSeason — the season the future contract runs until. */
  endSeason?: number;
}

export interface StaffPerformanceRow {
  staffId: number;
  rating?: number;
  morale?: number;
}

export interface ContractPatienceRow {
  staffId: number;
  suitability?: number;
  opinion?: number;
  /** Acceptance threshold 0..1 — lower = easier to sign (docs/03 §5.7). */
  threshold?: number;
}

export interface PartsModel {
  designs: PartDesign[];
  items: PartItem[];
  loadouts: CarLoadoutRow[];
  expertise: TeamExpertiseRow[];
  tablesPresent: {
    designs: boolean;
    items: boolean;
    statValues: boolean;
    loadouts: boolean;
    expertise: boolean;
  };
}

export interface FinanceModel {
  balance?: number;
  budget?: number;
  transactions: FinanceTransactionRow[];
  tablesPresent: { balance: boolean; transactions: boolean };
}

export interface PersonnelModel {
  contracts: StaffContractRow[];
  performance: StaffPerformanceRow[];
  patience: ContractPatienceRow[];
  tablesPresent: { contracts: boolean; performance: boolean; patience: boolean };
}

export interface RegulationVoteRow {
  teamId: number;
  /** Raw vote value — encoding not verified; engines treat 1 as YES. */
  vote?: number;
}

export interface RegulationChangeRow {
  groupId?: number;
  /** Label/loc-key as stored in Regulations_ChangeGroups. */
  label?: string;
}

export interface RegulationProposal {
  proposalId: number;
  title?: string;
  state?: number;
  seasonId?: number;
  votes: RegulationVoteRow[];
  changes: RegulationChangeRow[];
}

/**
 * SaveModel v1 — Phase 2 extends the v0 contract with the schema-adaptive
 * factory/season sections (parts, finance, personnel, regulations) plus
 * qualifying + sprint results on races. Optional tables degrade via
 * tablesPresent flags + assumptions — never a crash, never a fake zero.
 */
export interface SaveModel {
  meta: SaveMeta;
  player: {
    teamId: number;
    teamName: string;
    managerName?: string;
    customTeamEnabled: boolean;
  };
  teams: Team[];
  drivers: Driver[];
  staff: StaffMember[];
  seasons: Season[];
  races: Race[];
  standings: { drivers: StandingRow[]; teams: StandingRow[] };
  tyres: TyreAllocation[];
  parts: PartsModel;
  regulations: RegulationProposal[];
  finance: FinanceModel;
  personnel: PersonnelModel;
  /** Which optional table groups were present — drives UI degradation. */
  availability: { table: string; present: boolean }[];
  /** Engine results attached later by analytics engines. */
  recommendations?: Recommendation[];
}

/** Shared engine result envelope (docs/03-ANALYTICS-ENGINES.md §5.1). */
export interface EngineResult<T> {
  data: T;
  confidence: Confidence;
  evidence: Evidence[];
  assumptions: Assumption[];
  recommendations: Recommendation[];
  warnings: string[];
}

export type { Evidence, Assumption, Confidence, Recommendation };
