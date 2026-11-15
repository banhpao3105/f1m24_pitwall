/**
 * Car config repository (v0.7.0) — Save_CarConfig carries one row per F1
 * car with (LoadoutID, TeamID). Verified on real 1.11 saves (autosave +
 * race-193 weekend saves, re-verified on the Monza 2027 pre-race save4.db
 * during the v0.7.1 diagnosis): the 22 rows are exactly the pairs
 * {(0, t), (1, t) : t = 1..11} — LoadoutID is 0/1 PER TEAM (seat 1 / seat
 * 2), NOT a global car index 0..21, and the stored TeamID column is that
 * F1 team INDEX (1–11), not the Teams.TeamID FK. The 11th F1 team is the
 * custom team (TeamID 32), whose cars are CarID 20/21 (owner-verified on
 * the Monza 2027 saves: the player's allocation rows sit exactly there).
 *
 * ⚠️ Remaining assumption (v0.7.1, stated honestly): the sequential index
 * 1..11 is read as "the Nth F1 team in `Teams` ordered by TeamID
 * ascending" — team 11 = TeamID 32 (CustomTeam → CarID 20/21). The basis
 * is strong (exactly 11 F1 teams, a complete 1..11 index, 22 unique
 * pairs, and the player's allocation landing on CarID 20/21 of team 11)
 * but it is a correlation, not proven correspondence — the check below
 * verifies SHAPE, and build-model flags the mapping unverified whenever
 * the shape does not match.
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
  /** 0 or 1 — the seat WITHIN the team (v0.7.1: NOT the CarID 0–21). */
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

/**
 * v0.7.1 — the shape check the sequential-team layout must satisfy: the
 * rows must be EXACTLY the set {(t, 0), (t, 1) : t ∈ 1..11} — 22 unique
 * pairs, every team index 1..11 present with both seats, nothing else.
 *
 * History (the bug this replaces): v0.7.0 tested
 * `teamIndex === floor(loadoutId / 2) + 1`, which evaluates to 1 for EVERY
 * real row (LoadoutID is 0/1 per team) and therefore failed on the second
 * row of any real save — `carTeamsVerified` was permanently false and the
 * whole inventory/penalty stack silently ran on the fallback path.
 */
export function carConfigPairsVerified(rows: RawCarConfigRow[]): boolean {
  if (rows.length !== 22) return false;
  const expected = new Set<string>();
  for (let t = 1; t <= 11; t++) {
    expected.add(`${t}:0`);
    expected.add(`${t}:1`);
  }
  const seen = new Set<string>();
  for (const row of rows) {
    const key = `${row.teamIndex}:${row.loadoutId}`;
    if (!expected.has(key) || seen.has(key)) return false;
    seen.add(key);
  }
  return seen.size === 22;
}
