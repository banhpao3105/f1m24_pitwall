/**
 * Player repository — the ONLY place that knows how Player data lives in
 * SQL (docs/02-ARCHITECTURE.md rule: SQL only inside parser/repositories).
 * Verified columns (F1M 24, build volta24+game+1.11.0):
 *   Player: TeamID, FirstName, LastName, CustomTeamEnabled
 *   Player_State: Day, CurrentSeason
 */

import type { SqlJsDatabase } from '../sqlite/sqljs-loader';

export interface RawPlayer {
  teamId: number;
  firstName: string;
  lastName: string;
  customTeamEnabled: number;
}

export interface RawPlayerState {
  day: number;
  currentSeason: number;
}

export function getPlayer(db: SqlJsDatabase): RawPlayer | null {
  const rows = db.exec(
    'SELECT TeamID, FirstName, LastName, CustomTeamEnabled FROM Player LIMIT 1',
  );
  const row = rows[0]?.values[0];
  if (!row) return null;
  return {
    teamId: Number(row[0] ?? 0),
    firstName: String(row[1] ?? ''),
    lastName: String(row[2] ?? ''),
    customTeamEnabled: Number(row[3] ?? 0),
  };
}

export function getPlayerState(db: SqlJsDatabase): RawPlayerState | null {
  const rows = db.exec(
    'SELECT Day, CurrentSeason FROM Player_State LIMIT 1',
  );
  const row = rows[0]?.values[0];
  if (!row) return null;
  return {
    day: Number(row[0] ?? 0),
    currentSeason: Number(row[1] ?? 0),
  };
}
