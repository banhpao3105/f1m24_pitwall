/**
 * Practice repository — verified columns (F1M 24):
 *   Races_PracticeResults: RaceID, PracticeSession, DriverID, TeamID,
 *     BestLapTime, BestLapTyre, RaceFormula
 * BestLapTyre encoding (oracle-verified): 0=H, 1=M, 2=S.
 */

import type { SqlJsDatabase } from '../sqlite/sqljs-loader';
import { tableColumns } from '../schema';

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
  /** v0.7.0 — laps completed in the session (CarID↔driver mapping signal).
   *  Column verified on the Monza 2027 save; undefined on older schemas. */
  lapCount?: number;
}

export function getPracticeResults(db: SqlJsDatabase): RawPracticeResult[] {
  const hasLapCount = tableColumns(db, 'Races_PracticeResults')
    .some((c) => c.toLowerCase() === 'lapcount');
  const rows = db.exec(`
    SELECT RaceID, PracticeSession, DriverID, TeamID, BestLapTime, BestLapTyre, RaceFormula${
      hasLapCount ? ', LapCount' : ''
    }
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
    lapCount: hasLapCount && row[7] != null ? Number(row[7]) : undefined,
  }));
}
