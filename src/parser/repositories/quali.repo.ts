/**
 * Qualifying repository — schema-adaptive (Phase 2, for the sim engine).
 *
 * Verified facts from the planning docs (docs/01 §4.2):
 *   - `Races_QualifyingResults.ChampionshipPoints` exists (pole bonus source).
 *   - "QualifyingStage = MAX(...) để lấy kết quả quali cuối cùng" — keep the
 *     highest stage per driver per race (normalize does the MAX).
 * Remaining columns are candidates (adaptive reader, see adaptive.ts).
 */

import type { SqlJsDatabase } from '../sqlite/sqljs-loader';
import {
  readTable,
  buildColumnMap,
  colIndex,
  readNum,
  pkCandidates,
} from './adaptive';

const TABLE = 'Races_QualifyingResults';

const CANDIDATES: Record<string, string[]> = {
  rowId: pkCandidates(TABLE),
  raceId: ['RaceID'],
  driverId: ['DriverID'],
  teamId: ['TeamID'],
  finishingPos: ['FinishingPos', 'Position', 'Pos'],
  qualifyingStage: ['QualifyingStage', 'Stage'],
  championshipPoints: ['ChampionshipPoints', 'Points'],
  /* v0.7.0 — RaceFormula separates F1 (1) from F2 (2) / F3 (3) rows; the
   * grid derivation must only see F1 drivers. GridPenalty stays on record
   * but is 0 on every verified real save — real penalties live in
   * Races_GridPenalties (see grid-penalties.repo.ts). */
  raceFormula: ['RaceFormula'],
  gridPenalty: ['GridPenalty'],
};

export interface RawQualifyingResult {
  raceId: number;
  driverId: number;
  teamId: number;
  finishingPos: number;
  qualifyingStage?: number;
  championshipPoints?: number;
  raceFormula?: number;
  gridPenalty?: number;
}

export function getQualifyingResults(db: SqlJsDatabase): RawQualifyingResult[] {
  const tbl = readTable(db, TABLE);
  if (!tbl.present) return [];
  const map = buildColumnMap(tbl.columns, CANDIDATES);
  if (!map.raceId || !map.driverId || !map.teamId || !map.finishingPos) return [];
  const rIdx = colIndex(tbl.columns, map.raceId);
  const dIdx = colIndex(tbl.columns, map.driverId);
  const tIdx = colIndex(tbl.columns, map.teamId);
  const fIdx = colIndex(tbl.columns, map.finishingPos);
  const sIdx = map.qualifyingStage ? colIndex(tbl.columns, map.qualifyingStage) : -1;
  const pIdx = map.championshipPoints
    ? colIndex(tbl.columns, map.championshipPoints)
    : -1;
  const fmIdx = map.raceFormula ? colIndex(tbl.columns, map.raceFormula) : -1;
  const gpIdx = map.gridPenalty ? colIndex(tbl.columns, map.gridPenalty) : -1;
  const out: RawQualifyingResult[] = [];
  for (const row of tbl.rows) {
    const raceId = readNum(row, rIdx);
    const driverId = readNum(row, dIdx);
    const teamId = readNum(row, tIdx);
    const finishingPos = readNum(row, fIdx);
    if (raceId == null || driverId == null || teamId == null || finishingPos == null) {
      continue;
    }
    out.push({
      raceId,
      driverId,
      teamId,
      finishingPos,
      qualifyingStage: readNum(row, sIdx),
      championshipPoints: readNum(row, pIdx),
      raceFormula: readNum(row, fmIdx),
      gridPenalty: readNum(row, gpIdx),
    });
  }
  return out;
}
