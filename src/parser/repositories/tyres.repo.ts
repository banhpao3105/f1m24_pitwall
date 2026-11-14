/**
 * Tyre repository — verified columns (F1M 24):
 *   Save_CarTyreAllocation: CarID, TyreSetID, WeekendTyreType, FrontLeftWear,
 *     AvailabilityState, EstimatedLapTime, EstimatedLapLifeRemaining,
 *     LapsCompleted
 * WeekendTyreType encoding (oracle-verified): 0=W, 1=I, 2=S, 3=M, 4=H.
 * EstimatedLapTime (v0.6.1, verified on the Silverstone 2027 save probe):
 *   the game's own fresh-lap-time estimate per set, in seconds — identical
 *   across cars for the same compound. Column is selected only when present
 *   (schema-adaptive; older saves may not carry it).
 */

import type { SqlJsDatabase } from '../sqlite/sqljs-loader';
import { tableColumns } from '../schema';

export interface RawTyreSet {
  carId: number;
  tyreSetId: number;
  /** 0=W, 1=I, 2=S, 3=M, 4=H (oracle encoding). */
  weekendTyreType: number;
  frontLeftWear: number;
  /** AvailabilityState 0 = available fresh. */
  availabilityState: number;
  estimatedLapLifeRemaining?: number;
  /** Game's own lap-time estimate (seconds) for a fresh set — v0.6.1. */
  estimatedLapTimeS?: number;
}

export function getTyreAllocations(db: SqlJsDatabase): RawTyreSet[] {
  if (!hasTable(db, 'Save_CarTyreAllocation')) return [];
  const hasLapTime = tableColumns(db, 'Save_CarTyreAllocation')
    .some((c) => c.toLowerCase() === 'estimatedlaptime');
  const rows = db.exec(`
    SELECT CarID, TyreSetID, WeekendTyreType, FrontLeftWear,
           AvailabilityState, EstimatedLapLifeRemaining${
             hasLapTime ? ', EstimatedLapTime' : ''
           }
    FROM Save_CarTyreAllocation
  `);
  if (rows.length === 0) return [];
  return rows[0].values.map((row) => ({
    carId: Number(row[0] ?? 0),
    tyreSetId: Number(row[1] ?? 0),
    weekendTyreType: Number(row[2] ?? 0),
    frontLeftWear: Number(row[3] ?? 0),
    availabilityState: Number(row[4] ?? 0),
    estimatedLapLifeRemaining:
      row[5] == null ? undefined : Number(row[5]),
    estimatedLapTimeS: hasLapTime && row[6] != null ? Number(row[6]) : undefined,
  }));
}

function hasTable(db: SqlJsDatabase, table: string): boolean {
  const res = db.exec(
    "SELECT count(*) FROM sqlite_master WHERE type IN ('table','view') AND name = ?",
    [table],
  );
  return Number(res[0]?.values[0]?.[0] ?? 0) > 0;
}
