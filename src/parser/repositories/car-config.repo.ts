/**
 * Car config repository (v0.7.0) — Save_CarConfig carries one row per F1
 * car with (LoadoutID, TeamID). Verified on real 1.11 saves (autosave +
 * race-193 weekend saves): the 22 rows map LoadoutID 0..21 onto a STRICTLY
 * sequential team index 1..11, i.e. the Nth F1 team in Teams order owns
 * LoadoutID 2(N−1) and 2(N−1)+1. The stored TeamID column is that F1 team
 * INDEX (1–11), not the Teams.TeamID FK — the 11th F1 team is the custom
 * team (TeamID 32), whose cars are CarID 20/21 (owner-verified on the
 * Monza 2027 saves: the player's allocation rows sit exactly there).
 *
 * This table is the VERIFICATION SIGNAL for the CarID → team mapping the
 * tyre inventory and grid penalties depend on. The mapping itself is built
 * in normalize/build-model.ts from Teams (formula === 1, TeamID order);
 * when Save_CarConfig exists it must agree with that order, otherwise the
 * mapping is flagged unverified and the UI falls back to team-level labels.
 */

import type { SqlJsDatabase } from '../sqlite/sqljs-loader';
import { tableColumns } from '../schema';

export interface RawCarConfigRow {
  /** 0–21 — matches Save_CarTyreAllocation.CarID. */
  loadoutId: number;
  /** F1 team INDEX 1–11 as stored (see file header). */
  teamIndex: number;
}

export function getCarConfig(db: SqlJsDatabase): RawCarConfigRow[] {
  const cols = tableColumns(db, 'Save_CarConfig').map((c) => c.toLowerCase());
  if (!cols.includes('loadoutid') || !cols.includes('teamid')) return [];
  const rows = db.exec('SELECT LoadoutID, TeamID FROM Save_CarConfig ORDER BY LoadoutID');
  if (rows.length === 0) return [];
  return rows[0].values.map((row) => ({
    loadoutId: Number(row[0] ?? 0),
    teamIndex: Number(row[1] ?? 0),
  }));
}
