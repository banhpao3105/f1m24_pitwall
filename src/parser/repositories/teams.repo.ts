/**
 * Teams repository — verified columns (F1M 24):
 *   Teams: TeamID, TeamName, TeamNameLocKey, IsCustomTeam, Formula
 *   Teams_Colours: TeamID, ColourID, Colour (optional table)
 *
 * v0.5.0 Step 3 (team identity): Teams_Colours is now read so the UI can
 * paint real livery colours. Colour is stored as an integer; the oracle
 * (Gazette v2.2 line ~10036) masks it to 24 bits and hex-encodes it:
 *   rgb = Colour >>> 0 & 0xFFFFFF → "#rrggbb"
 * The lowest ColourID per team wins (oracle: first row in ColourID order).
 * Table missing / no rows → no colours — the UI falls back to neutral.
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

/** teamId → "#rrggbb" (oracle parity). Empty when the table is absent. */
export function getTeamColours(db: SqlJsDatabase): Map<number, string> {
  const map = new Map<number, string>();
  const present = db.exec(
    "SELECT count(*) FROM sqlite_master WHERE type IN ('table','view') AND name = 'Teams_Colours'",
  );
  if (!present[0]?.values?.[0] || Number(present[0].values[0][0]) === 0) return map;
  const rows = db.exec(
    'SELECT TeamID, ColourID, Colour FROM Teams_Colours ORDER BY TeamID, ColourID',
  );
  if (rows.length === 0) return map;
  for (const row of rows[0].values) {
    const teamId = Number(row[0]);
    if (map.has(teamId)) continue; // oracle: first (lowest ColourID) wins
    const raw = row[2];
    if (raw == null) continue;
    const rgb = Number(raw) >>> 0 & 0xffffff;
    map.set(teamId, `#${rgb.toString(16).padStart(6, '0')}`);
  }
  return map;
}
