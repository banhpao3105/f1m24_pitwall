/**
 * probe-enum-laps — AvailabilityState enum tables + LapsUsedForInSession signal.
 * Usage: bun scripts/probe-enum-laps.ts <path-to.sav>
 */
import { readFileSync } from 'node:fs';
import { parseF1ManagerSave } from '../src/parser/parse-save';
import { openDatabase } from '../src/parser/sqlite/sqljs-loader';

const SQL_WASM = '/home/z/my-project/node_modules/sql.js/dist/sql-wasm.wasm';

async function main() {
  const raw = readFileSync(process.argv[2]);
  const binary = parseF1ManagerSave(raw);
  const db = await openDatabase(binary.databaseFile, { locateFile: () => SQL_WASM });
  const q = (sql: string): unknown[][] => db.exec(sql)[0]?.values ?? [];
  const tables = q("SELECT name FROM sqlite_master WHERE type IN ('table','view') ORDER BY name").flat() as string[];

  const enums = tables.filter((t) => /enum/i.test(t));
  console.log('enum tables:', enums.join(', '));
  for (const e of enums) {
    if (/tyre|allocation|avail/i.test(e)) {
      console.log(e, '->', q(`SELECT * FROM "${e}" LIMIT 12`).flat());
    }
  }
  const cols = q("SELECT name FROM pragma_table_info('Save_CarTyreAllocation')").flat() as string[];
  console.log('alloc cols:', cols.join(', '));
  console.log('LapsUsedForInSession stats:', q(
    `SELECT AvailabilityState, WeekendTyreType, SUM(LapsCompleted), SUM(LapsUsedForInSession), COUNT(*)
     FROM Save_CarTyreAllocation GROUP BY AvailabilityState, WeekendTyreType ORDER BY WeekendTyreType, AvailabilityState`,
  ).flat());
  // per-car per-session usage for cars 20/21
  console.log('car 20/21 usage:', q(
    `SELECT CarID, WeekendTyreType, TyreSetID, AvailabilityState, LapsCompleted, LapsUsedForInSession, SessionLastUsedIn
     FROM Save_CarTyreAllocation WHERE CarID >= 20 AND (LapsCompleted > 0 OR LapsUsedForInSession > 0 OR SessionLastUsedIn NOT IN (11, 0))
     ORDER BY CarID, WeekendTyreType, TyreSetID`,
  ).flat());
}

void main();
