/**
 * Schema-adaptive table reader — Phase 2.
 *
 * Problem: Parts_*, Finance_*, Staff_* detail and Regulations_* columns have
 * NOT been captured in an introspected fixture (tests/fixtures/schema only
 * stores table names), and the Gazette oracle HTML is no longer available in
 * the working environment.
 *
 * Strategy (docs/01-AUDIT-DATA.md §4.3 + §4.5 degradation rules):
 *   1. `readTable` SELECTs * from the table (guarded by hasTable) and hands
 *      back the ACTUAL header sql.js reports — no guessed column names in SQL.
 *   2. Each repo declares candidate column names per concept (from planning
 *      docs + F1M 23/24 naming conventions). `buildColumnMap` binds a concept
 *      only when the column really exists (case-insensitive).
 *   3. Unmapped concepts stay `undefined` — engines degrade to confidence
 *      LOW with an explicit assumption. Never fabricated numbers.
 *
 * Verification status: CANDIDATE. Re-verify candidates with
 * `bun scripts/introspect-save.ts <save>` (dumps every table's columns
 * since Phase 2) and adjust the candidate lists — engine logic stays put.
 */

import type { SqlJsDatabase } from '../sqlite/sqljs-loader';
import { hasTable } from '../schema';

/** concept → actual column name. */
export type ColumnMap = Record<string, string>;

export interface TableData {
  present: boolean;
  /** Actual column names from the SELECT (empty when table/columns missing). */
  columns: string[];
  rows: unknown[][];
}

export function readTable(db: SqlJsDatabase, table: string): TableData {
  if (!hasTable(db, table)) return { present: false, columns: [], rows: [] };
  try {
    const res = db.exec(`SELECT * FROM "${table.replace(/"/g, '""')}"`);
    if (res.length === 0) return { present: true, columns: [], rows: [] };
    return { present: true, columns: res[0].columns, rows: res[0].values };
  } catch {
    // Unreadable table (corrupt page etc.) — degrade, never throw upstream.
    return { present: true, columns: [], rows: [] };
  }
}

/**
 * Binds each concept to the first candidate column that exists
 * (case-insensitive). Unmatched concepts are simply absent from the map.
 */
export function buildColumnMap(
  columns: string[],
  candidates: Record<string, string[]>,
): ColumnMap {
  const lower = new Map(columns.map((c) => [c.toLowerCase(), c]));
  const map: ColumnMap = {};
  for (const [concept, names] of Object.entries(candidates)) {
    for (const name of names) {
      const actual = lower.get(name.toLowerCase());
      if (actual) {
        map[concept] = actual;
        break;
      }
    }
  }
  return map;
}

export function colIndex(columns: string[], col: string | undefined): number {
  if (!col) return -1;
  return columns.indexOf(col);
}

export function readNum(row: unknown[], idx: number): number | undefined {
  if (idx < 0) return undefined;
  const v = row[idx];
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function readStr(row: unknown[], idx: number): string | undefined {
  if (idx < 0) return undefined;
  const v = row[idx];
  return v == null ? undefined : String(v);
}

/** Reads a concept as string, falling back to the numeric form ("3"). */
export function readNumOrStr(
  row: unknown[],
  columns: string[],
  map: ColumnMap,
  concept: string,
): string | undefined {
  const idx = colIndex(columns, map[concept]);
  if (idx < 0) return undefined;
  const v = row[idx];
  if (v == null) return undefined;
  return typeof v === 'number' ? String(v) : String(v);
}

/** Primary-key candidates for a table (F1M convention: "<SingularEntity>ID"). */
export function pkCandidates(table: string): string[] {
  // 0.4.1 bug fix (verified against a real 1.11.0 save): F1M24 names the PK
  // after the SINGULAR entity — Parts_Designs → DesignID, Parts_Items →
  // ItemID, Regulations_Proposals → ProposalID. The old "<Table>ID" guesses
  // never matched, so every Parts/Regulations row was silently dropped.
  const last = table.split('_').pop() ?? table;
  const singular = last.endsWith('s') ? last.slice(0, -1) : last;
  return [`${table}ID`, `${table}_ID`, `${singular}ID`, 'ID', 'Id'];
}
