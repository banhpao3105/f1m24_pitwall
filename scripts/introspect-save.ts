/**
 * introspect-save — Phase 0 (docs/01-AUDIT-DATA.md §4.3 + A1 §A1.5).
 *
 * Dumps the schema of a real .sav (table list + columns of known tables +
 * row counts of core tables) into a commit-safe JSON fixture under
 * tests/fixtures/schema/. NO row data is dumped — personal data stays local.
 *
 * Usage: bun scripts/introspect-save.ts <path-to.sav> [out-name]
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename } from 'node:path';
import { parseF1ManagerSave } from '../src/parser/parse-save';
import { openDatabase, type SqlJsDatabase } from '../src/parser/sqlite/sqljs-loader';
import { listTables, tableColumns } from '../src/parser/schema';
import { CORE_TABLES, OPTIONAL_TABLES } from '../src/parser/schema';

const SAVE_PATH = process.argv[2];
const OUT_NAME = process.argv[3] ?? basename(SAVE_PATH ?? 'save').replace(/\.sav$/i, '');

if (!SAVE_PATH) {
  console.error('Usage: bun scripts/introspect-save.ts <path-to.sav> [out-name]');
  process.exit(1);
}

const SQL_WASM = '/home/z/my-project/node_modules/sql.js/dist/sql-wasm.wasm';

interface TableSchema {
  name: string;
  columns: string[];
}

interface Introspection {
  fixtureId: string;
  gameVersion: string;
  gameVersionWithBuild: string;
  saveGameVersion: number;
  engineVersion: string;
  saveGameClassName: string;
  sourceFileName: string;
  introspectedAt: string;
  totalTablesAndViews: number;
  coreTables: TableSchema[];
  optionalTables: TableSchema[];
  coreTableRowCounts: Record<string, number>;
  missingOptional: string[];
  /**
   * Phase 2: columns of EVERY table (name only, no row data — personal
   * data stays local). This is the verification source for the adaptive
   * repo candidate columns (src/parser/repositories/adaptive.ts).
   */
  allTableColumns?: Record<string, string[]>;
}

function safeCount(db: SqlJsDatabase, table: string): number | null {
  try {
    const res = db.exec(`SELECT COUNT(*) FROM "${table.replace(/"/g, '""')}"`);
    return Number(res[0]?.values[0]?.[0] ?? 0);
  } catch {
    return null;
  }
}

async function main() {
  const raw = readFileSync(SAVE_PATH);
  const binary = parseF1ManagerSave(raw);
  const db = await openDatabase(binary.databaseFile, {
    locateFile: () => SQL_WASM,
  });

  const tables = listTables(db);
  const present = new Set(tables);

  const coreTables = CORE_TABLES.filter((t) => present.has(t)).map((t) => ({
    name: t,
    columns: tableColumns(db, t),
  }));
  const optionalTables = OPTIONAL_TABLES.filter((t) => present.has(t)).map((t) => ({
    name: t,
    columns: tableColumns(db, t),
  }));
  const missingOptional = OPTIONAL_TABLES.filter((t) => !present.has(t));

  const coreTableRowCounts: Record<string, number> = {};
  for (const t of CORE_TABLES) {
    if (present.has(t)) {
      coreTableRowCounts[t] = safeCount(db, t) ?? -1;
    }
  }

  // Phase 2 — dump every table's columns so the adaptive candidate lists
  // (Parts_*, Finance_*, Staff_*, Regulations_*) can be verified and locked.
  const allTableColumns: Record<string, string[]> = {};
  for (const t of tables) {
    const cols = tableColumns(db, t);
    if (cols.length > 0) allTableColumns[t] = cols;
  }

  const introspection: Introspection = {
    fixtureId: OUT_NAME,
    gameVersion: binary.metadata.gameVersion,
    gameVersionWithBuild: binary.metadata.gameVersionWithBuild,
    saveGameVersion: binary.metadata.saveGameVersion,
    engineVersion: binary.metadata.engineVersion,
    saveGameClassName: binary.metadata.saveGameClassName,
    sourceFileName: basename(SAVE_PATH),
    introspectedAt: new Date().toISOString(),
    totalTablesAndViews: tables.length,
    coreTables,
    optionalTables,
    coreTableRowCounts,
    missingOptional,
    allTableColumns,
  };

  mkdirSync('tests/fixtures/schema', { recursive: true });
  const outPath = `tests/fixtures/schema/${OUT_NAME}-schema.json`;
  writeFileSync(outPath, JSON.stringify(introspection, null, 2) + '\n');
  console.log(`written: ${outPath}`);
  console.log(`game=${introspection.gameVersion} build=${introspection.gameVersionWithBuild}`);
  console.log(`tables+views=${tables.length} core=${coreTables.length} optional=${optionalTables.length} missingOptional=${missingOptional.length} allColumns=${Object.keys(allTableColumns).length}`);
}

main().catch((err) => {
  console.error('INTROSPECT FAILED:', err);
  process.exit(1);
});
