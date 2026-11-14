/**
 * Tyre repository — verified columns (F1M 24):
 *   Save_CarTyreAllocation: CarID, TyreSetID, WeekendTyreType, FrontLeftWear,
 *     AvailabilityState, EstimatedLapTime, EstimatedLapLifeRemaining,
 *     LapsCompleted
 * WeekendTyreType encoding: 0=H, 1=M, 2=S, 3=I(nter), 4=W(et) — v0.6.2,
 * verified on the Silverstone 2027 pre-race save (fresh sets carry exactly
 * one EstimatedLapTime per type: 0=89.80s, 1=89.48s, 2=88.91s, 3=95.32s,
 * 4=105.35s; dry practice BestLapTyre reads S=2, M=1, H=0; the game's own
 * S→M→S plan uses only TyreType 0/1/2). The earlier "0=W, 1=I, 2=S, 3=M,
 * 4=H" note was WRONG and caused the +16.45s H delta in v0.6.1.
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
  /** 0=H, 1=M, 2=S, 3=I, 4=W — verified on the Silverstone 2027 save. */
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
