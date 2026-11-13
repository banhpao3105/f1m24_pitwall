/**
 * Teams repository — verified columns (F1M 24):
 *   Teams: TeamID, TeamName, TeamNameLocKey, IsCustomTeam, Formula
 *   Teams_Colours: TeamID, ColourID, Colour (optional)
 */

import type { SqlJsDatabase } from '../sqlite/sqljs-loader';

export interface RawTeam {
  teamId: number;
  teamName: string;
  teamNameLocKey?: string;
  isCustomTeam: number;
  formula: number;
}

export function getTeams(db: SqlJsDatabase): RawTeam[] {
  const rows = db.exec(
    'SELECT TeamID, TeamName, TeamNameLocKey, IsCustomTeam, Formula FROM Teams ORDER BY TeamID',
  );
  if (rows.length === 0) return [];
  return rows[0].values.map((row) => ({
    teamId: Number(row[0] ?? 0),
    teamName: String(row[1] ?? ''),
    teamNameLocKey: row[2] == null ? undefined : String(row[2]),
    isCustomTeam: Number(row[3] ?? 0),
    formula: Number(row[4] ?? 0),
  }));
}
