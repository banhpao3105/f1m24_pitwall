/**
 * Grid penalties repository (v0.7.0) — the ONLY source of real pre-race
 * grid penalties. Races_QualifyingResults.GridPenalty is 0 on every verified
 * real save (Monza/Baku 2027, owner-verified); the actual penalties live in
 * Races_GridPenalties with a separate enum table for the reason → places
 * mapping (both verified on real 1.11 saves):
 *
 *   Races_GridPenalties: PenaltyID, TeamID, CarID, ReasonForPenalty,
 *     SessionReceived, Served, PitLaneStart, ServeInRace, ServeInSprint
 *   - CarID here is the car index WITHIN the team (1–2), NOT the 0–21
 *     CarID of Save_CarTyreAllocation.
 *   - Served flips 0 → 1 when the penalty has been applied (verified:
 *     rows pending before a race weekend carry Served=0 and disappear
 *     from the pending set once the race runs). Pending rows (Served=0,
 *     ServeInRace=1) are the ones that shape the UPCOMING race's grid.
 *   Races_Enum_PenaltyType: Type, Name, GridPenalty, FirstOffenceModifier
 *   - 0 ExceededEngineLimit (5), 1 ExceededERSLimit (5),
 *     2 ExceededGearboxLimit (5), 3 CausingCollision (3),
 *     4 CausingMajorCollision (5), 5 ParcFermeBreach (0).
 *
 * All reads are soft (schema-adaptive) — tables may be missing on old saves.
 */

import type { SqlJsDatabase } from '../sqlite/sqljs-loader';
import { tableColumns } from '../schema';

export interface RawGridPenalty {
  penaltyId: number;
  teamId: number;
  /** Car index within the team (1–2) — NOT the 0–21 allocation CarID. */
  carInTeam: number;
  reasonForPenalty: number;
  sessionReceived?: number;
  served: number;
  pitLaneStart: number;
  serveInRace?: number;
  serveInSprint?: number;
}

export interface RawPenaltyType {
  type: number;
  name?: string;
  /** Grid places the reason costs (from the game's own enum table). */
  gridPenalty: number;
}

function hasTable(db: SqlJsDatabase, table: string): boolean {
  const res = db.exec(
    "SELECT count(*) FROM sqlite_master WHERE type IN ('table','view') AND name = ?",
    [table],
  );
  return Number(res[0]?.values[0]?.[0] ?? 0) > 0;
}

export function getGridPenalties(db: SqlJsDatabase): RawGridPenalty[] {
  if (!hasTable(db, 'Races_GridPenalties')) return [];
  const cols = tableColumns(db, 'Races_GridPenalties').map((c) => c.toLowerCase());
  const has = (name: string): boolean => cols.includes(name.toLowerCase());
  const hasSession = has('SessionReceived');
  const hasPitLane = has('PitLaneStart');
  const hasServeRace = has('ServeInRace');
  const hasServeSprint = has('ServeInSprint');
  const rows = db.exec(`
    SELECT PenaltyID, TeamID, CarID, ReasonForPenalty, Served${
      hasSession ? ', SessionReceived' : ''
    }${hasPitLane ? ', PitLaneStart' : ''}${hasServeRace ? ', ServeInRace' : ''}${
      hasServeSprint ? ', ServeInSprint' : ''
    }
    FROM Races_GridPenalties
  `);
  if (rows.length === 0) return [];
  return rows[0].values.map((row) => {
    let i = 4; // Served is the 5th base column
    const next = (present: boolean): number | undefined => {
      if (!present) return undefined;
      const v = row[++i];
      return v == null ? undefined : Number(v);
    };
    const sessionReceived = next(hasSession);
    const pitLaneStart = next(hasPitLane);
    const serveInRace = next(hasServeRace);
    const serveInSprint = next(hasServeSprint);
    return {
      penaltyId: Number(row[0] ?? 0),
      teamId: Number(row[1] ?? 0),
      carInTeam: Number(row[2] ?? 0),
      reasonForPenalty: Number(row[3] ?? 0),
      served: Number(row[4] ?? 0),
      sessionReceived,
      pitLaneStart: pitLaneStart ?? 0,
      serveInRace,
      serveInSprint,
    };
  });
}

export function getPenaltyTypes(db: SqlJsDatabase): RawPenaltyType[] {
  if (!hasTable(db, 'Races_Enum_PenaltyType')) return [];
  const rows = db.exec('SELECT Type, GridPenalty FROM Races_Enum_PenaltyType');
  if (rows.length === 0) return [];
  return rows[0].values.map((row) => ({
    type: Number(row[0] ?? 0),
    gridPenalty: Number(row[1] ?? 0),
  }));
}
