/**
 * Standings repository — verified columns (F1M 24):
 *   Races_DriverStandings: SeasonID, DriverID, Points, Position, RaceFormula
 *   Races_TeamStandings: SeasonID, TeamID, Points, Position, RaceFormula
 * Used as the TEST ORACLE for self-computed standings (docs/05 §9.2) and as
 * display fallback. RaceFormula 1 = main championship (oracle convention).
 */

import type { SqlJsDatabase } from '../sqlite/sqljs-loader';

export interface RawStanding {
  seasonId: number;
  id: number;
  points: number;
  position: number;
}

export function getDriverStandings(db: SqlJsDatabase, raceFormula = 1): RawStanding[] {
  const rows = db.exec(`
    SELECT SeasonID, DriverID, Points, Position
    FROM Races_DriverStandings
    WHERE RaceFormula = ${Math.floor(raceFormula)}
    ORDER BY SeasonID, Position
  `);
  if (rows.length === 0) return [];
  return rows[0].values.map((row) => ({
    seasonId: Number(row[0] ?? 0),
    id: Number(row[1] ?? 0),
    points: Number(row[2] ?? 0),
    position: Number(row[3] ?? 0),
  }));
}

export function getTeamStandings(db: SqlJsDatabase, raceFormula = 1): RawStanding[] {
  const rows = db.exec(`
    SELECT SeasonID, TeamID, Points, Position
    FROM Races_TeamStandings
    WHERE RaceFormula = ${Math.floor(raceFormula)}
    ORDER BY SeasonID, Position
  `);
  if (rows.length === 0) return [];
  return rows[0].values.map((row) => ({
    seasonId: Number(row[0] ?? 0),
    id: Number(row[1] ?? 0),
    points: Number(row[2] ?? 0),
    position: Number(row[3] ?? 0),
  }));
}
