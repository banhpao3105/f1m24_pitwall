/**
 * Pit stop repository — verified columns (F1M 24):
 *   Races_PitStopTimings: SeasonID, RaceID, TeamID, DriverID, PitStopID,
 *     PitStopStage, Duration, IncidentDelay, Lap
 * One physical stop can span several timing rows (stationary + lane);
 * PitStopID groups them (oracle groups by RaceID+DriverID+PitStopID and
 * takes MIN(Lap)).
 */

import type { SqlJsDatabase } from '../sqlite/sqljs-loader';

export interface RawPitTiming {
  raceId: number;
  driverId: number;
  teamId: number;
  pitStopId: number;
  stage: number;
  /** Lap number of this timing row. */
  lap: number;
  /** Row duration in ms (meaning varies per stage — aggregate per stop). */
  durationMs: number;
}

export function getPitTimings(db: SqlJsDatabase): RawPitTiming[] {
  const rows = db.exec(`
    SELECT RaceID, DriverID, TeamID, PitStopID, PitStopStage, Lap, Duration
    FROM Races_PitStopTimings
    ORDER BY RaceID, Lap
  `);
  if (rows.length === 0) return [];
  return rows[0].values.map((row) => ({
    raceId: Number(row[0] ?? 0),
    driverId: Number(row[1] ?? 0),
    teamId: Number(row[2] ?? 0),
    pitStopId: Number(row[3] ?? 0),
    stage: Number(row[4] ?? 0),
    lap: Number(row[5] ?? 0),
    // Duration stored in seconds (float) — normalized to ms.
  durationMs: Math.round(Number(row[6] ?? 0) * 1000),
  }));
}
