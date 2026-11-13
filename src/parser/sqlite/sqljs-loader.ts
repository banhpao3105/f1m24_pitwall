/**
 * sql.js WASM loader — Phase 0 (docs/02-ARCHITECTURE.md §3.1, §3.6).
 *
 * The WASM binary is self-hosted at /sql-wasm/sql-wasm.wasm (copied from the
 * pinned sql.js npm package) — never loaded from a CDN, per §3.6 (CORS +
 * version drift). Initialisation is cached: exactly one WASM instance per
 * page/worker lifetime.
 *
 * In Node (vitest), callers pass `locateFile` pointing into node_modules.
 */

import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';

export type SqlJsDatabase = Database;
export type { SqlJsStatic };

let cached: Promise<SqlJsStatic> | null = null;

export interface SqlJsLoadOptions {
  /** Override WASM resolution (required in Node, optional in browser). */
  locateFile?: (file: string, prefix?: string) => string;
}

export function loadSqlJs(options: SqlJsLoadOptions = {}): Promise<SqlJsStatic> {
  if (cached) return cached;
  cached = initSqlJs({
    locateFile:
      options.locateFile ??
      ((file: string) => {
        // Absolute origin required: inside a Turbopack blob worker the
        // document base is blob:…, so a leading-slash path would resolve
        // against the blob URL and fail to fetch the WASM binary.
        const origin =
          typeof self !== 'undefined' && self.location?.origin
            ? self.location.origin
            : '';
        return `${origin}/sql-wasm/${file}`;
      }),
  });
  return cached;
}

export async function openDatabase(
  bytes: Uint8Array,
  options: SqlJsLoadOptions = {},
): Promise<SqlJsDatabase> {
  const SQL = await loadSqlJs(options);
  return new SQL.Database(bytes);
}

/** Runs a SELECT and returns rows as arrays of unknown values. */
export function queryAll(db: SqlJsDatabase, sql: string, bind?: unknown[]): unknown[][] {
  const res = db.exec(sql, bind as never[] | undefined);
  if (res.length === 0) return [];
  return res[0].values;
}
