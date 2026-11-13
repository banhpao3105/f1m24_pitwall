/**
 * Normalized Model v0 — the single contract between parser and UI. Phase 0.
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
  weekendTyreType: number;
  availabilityState: number;
  estimatedLapLifeRemaining?: number;
}

export interface Part {
  partId: number;
  teamId: number;
  name?: string;
  condition?: number;
}

export interface RegulationProposal {
  proposalId: number;
  title?: string;
  state?: number;
}

export interface FinanceSnapshot {
  balance?: number;
  budget?: number;
}

/**
 * SaveModel v0 — Phase 0 populates meta + player + teams + races summary.
 * Remaining sections fill in during Phase 1+; they are optional so the
 * contract can grow without breaking.
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
  parts: Part[];
  regulations: RegulationProposal[];
  finance: FinanceSnapshot;
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
