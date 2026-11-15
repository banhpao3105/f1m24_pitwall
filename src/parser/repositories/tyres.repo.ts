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
 * v0.7.0 (Monza 2027 save set, schema 1.11): the remaining verified columns
 *   FrontRightWear / BackLeftWear / BackRightWear (per-wheel wear — the set
 *   wear is the MIN of the four), LapsCompleted + SessionLastUsedIn (the
 *   practice-usage signal that lets the engine correlate CarID → driver).
 *   All selected softly — older schemas keep parsing without them.
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
  /* ── v0.7.0 — present on 1.11 saves, undefined on older schemas ── */
  frontRightWear?: number;
  backLeftWear?: number;
  backRightWear?: number;
  /** Race/stint laps accumulated on this set (practice-usage signal). */
  lapsCompleted?: number;
  /** Session index the set was last used in (11 = unused on real saves). */
  sessionLastUsedIn?: number;
}

export function getTyreAllocations(db: SqlJsDatabase): RawTyreSet[] {
  if (!hasTable(db, 'Save_CarTyreAllocation')) return [];
  const cols = tableColumns(db, 'Save_CarTyreAllocation').map((c) => c.toLowerCase());
  const has = (name: string): boolean => cols.includes(name.toLowerCase());
  const hasLapTime = has('EstimatedLapTime');
  /* v0.7.0 soft columns (verified on the Monza 2027 save schema). */
  const hasFRW = has('FrontRightWear');
  const hasBLW = has('BackLeftWear');
  const hasBRW = has('BackRightWear');
  const hasLapsCompleted = has('LapsCompleted');
  const hasSessionLastUsed = has('SessionLastUsedIn');
  const rows = db.exec(`
    SELECT CarID, TyreSetID, WeekendTyreType, FrontLeftWear,
           AvailabilityState, EstimatedLapLifeRemaining${
             hasLapTime ? ', EstimatedLapTime' : ''
           }${hasFRW ? ', FrontRightWear' : ''}${hasBLW ? ', BackLeftWear' : ''}${
             hasBRW ? ', BackRightWear' : ''
           }${hasLapsCompleted ? ', LapsCompleted' : ''}${
             hasSessionLastUsed ? ', SessionLastUsedIn' : ''
           }
    FROM Save_CarTyreAllocation
  `);
  if (rows.length === 0) return [];
  return rows[0].values.map((row) => {
    /* sequential reader — advances ONLY over columns that were selected */
    let i = 5; // EstimatedLapLifeRemaining is the last base column
    const next = (present: boolean): number | undefined => {
      if (!present) return undefined;
      const v = row[++i];
      return v == null ? undefined : Number(v);
    };
    const estimatedLapTimeS = next(hasLapTime);
    const frontRightWear = next(hasFRW);
    const backLeftWear = next(hasBLW);
    const backRightWear = next(hasBRW);
    const lapsCompleted = next(hasLapsCompleted);
    const sessionLastUsedIn = next(hasSessionLastUsed);
    return {
      carId: Number(row[0] ?? 0),
      tyreSetId: Number(row[1] ?? 0),
      weekendTyreType: Number(row[2] ?? 0),
      frontLeftWear: Number(row[3] ?? 0),
      availabilityState: Number(row[4] ?? 0),
      estimatedLapLifeRemaining: row[5] == null ? undefined : Number(row[5]),
      estimatedLapTimeS,
      frontRightWear,
      backLeftWear,
      backRightWear,
      lapsCompleted,
      sessionLastUsedIn,
    };
  });
}

function hasTable(db: SqlJsDatabase, table: string): boolean {
  const res = db.exec(
    "SELECT count(*) FROM sqlite_master WHERE type IN ('table','view') AND name = ?",
    [table],
  );
  return Number(res[0]?.values[0]?.[0] ?? 0) > 0;
}
