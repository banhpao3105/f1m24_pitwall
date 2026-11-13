/**
 * Races repository — verified columns (F1M 24):
 *   Races: RaceID, SeasonID, Day, TrackID, State, RainRace, TemperatureRace,
 *          WeekendType
 *   Races_Tracks: TrackID, Name, Laps, PitLaneTimeLoss
 *   Races_Results: Season, RaceID, FinishingPos, DriverID, TeamID, Laps,
 *          Time, FastestLap, Points, DNF, StartingPos
 *
 * NOTE (verified vs planning): Races_Results uses `Season` + `FinishingPos`,
 * Races uses `WeekendType` (planning file 01 flagged these columns as
 * "cần verify" — differences recorded in tests/fixtures/schema JSON).
 */

import type { SqlJsDatabase } from '../sqlite/sqljs-loader';

export interface RawRace {
  raceId: number;
  seasonId: number;
  day: number;
  trackId: number;
  state: number;
  rainRace: number;
  temperatureRace: number;
  weekendType: number;
  trackName?: string;
  laps?: number;
}

export interface RawRaceResult {
  raceId: number;
  driverId: number;
  teamId: number;
  finishingPos: number;
  points: number;
  dnf: number;
  laps?: number;
  fastestLap?: number;
  startingPos?: number;
}

export function getRaces(db: SqlJsDatabase): RawRace[] {
  const rows = db.exec(`
    SELECT r.RaceID, r.SeasonID, r.Day, r.TrackID, r.State,
           r.RainRace, r.TemperatureRace, r.WeekendType,
           t.Name, t.Laps
    FROM Races r
    LEFT JOIN Races_Tracks t ON t.TrackID = r.TrackID
    ORDER BY r.SeasonID, r.Day
  `);
  if (rows.length === 0) return [];
  return rows[0].values.map((row) => ({
    raceId: Number(row[0] ?? 0),
    seasonId: Number(row[1] ?? 0),
    day: Number(row[2] ?? 0),
    trackId: Number(row[3] ?? 0),
    state: Number(row[4] ?? 0),
    rainRace: Number(row[5] ?? 0),
    temperatureRace: Number(row[6] ?? 0),
    weekendType: Number(row[7] ?? 0),
    trackName: row[8] == null ? undefined : String(row[8]),
    laps: row[9] == null ? undefined : Number(row[9]),
  }));
}

export function getRaceResults(db: SqlJsDatabase): RawRaceResult[] {
  const rows = db.exec(`
    SELECT RaceID, DriverID, TeamID, FinishingPos, Points, DNF,
           Laps, FastestLap, StartingPos
    FROM Races_Results
    ORDER BY RaceID, FinishingPos
  `);
  if (rows.length === 0) return [];
  return rows[0].values.map((row) => ({
    raceId: Number(row[0] ?? 0),
    driverId: Number(row[1] ?? 0),
    teamId: Number(row[2] ?? 0),
    finishingPos: Number(row[3] ?? 0),
    points: Number(row[4] ?? 0),
    dnf: Number(row[5] ?? 0),
    laps: row[6] == null ? undefined : Number(row[6]),
    fastestLap: row[7] == null ? undefined : Number(row[7]),
    startingPos: row[8] == null ? undefined : Number(row[8]),
  }));
}
