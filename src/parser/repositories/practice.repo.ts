/**
 * Practice repository — verified columns (F1M 24):
 *   Races_PracticeResults: RaceID, PracticeSession, DriverID, TeamID,
 *     BestLapTime, BestLapTyre, RaceFormula
 * BestLapTyre encoding (oracle-verified): 0=H, 1=M, 2=S.
 */

import type { SqlJsDatabase } from '../sqlite/sqljs-loader';

export interface RawPracticeResult {
  raceId: number;
  session: number;
  driverId: number;
  teamId: number;
  /** Best lap in ms. */
  bestLapMs: number;
  /** 0=H, 1=M, 2=S (oracle practice encoding). */
  bestLapTyre: number;
  raceFormula: number;
}

export function getPracticeResults(db: SqlJsDatabase): RawPracticeResult[] {
  const rows = db.exec(`
    SELECT RaceID, PracticeSession, DriverID, TeamID, BestLapTime, BestLapTyre, RaceFormula
    FROM Races_PracticeResults
    WHERE BestLapTime IS NOT NULL AND BestLapTime > 0 AND BestLapTyre IS NOT NULL
    ORDER BY RaceID, PracticeSession, DriverID
  `);
  if (rows.length === 0) return [];
  return rows[0].values.map((row) => ({
    raceId: Number(row[0] ?? 0),
    session: Number(row[1] ?? 0),
    driverId: Number(row[2] ?? 0),
    teamId: Number(row[3] ?? 0),
    // BestLapTime stored in seconds (float) — normalized to ms.
  bestLapMs: Math.round(Number(row[4] ?? 0) * 1000),
    bestLapTyre: Number(row[5] ?? 0),
    raceFormula: Number(row[6] ?? 0),
  }));
}
