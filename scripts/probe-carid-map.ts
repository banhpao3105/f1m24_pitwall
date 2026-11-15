/**
 * probe-carid-map — find any table linking DriverID ↔ CarID (0-21 or 1-2).
 * Usage: bun scripts/probe-carid-map.ts <path-to.sav>
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
  console.log('total tables:', tables.length);

  // any table with both CarID-ish and DriverID-ish columns
  for (const t of tables) {
    try {
      const cols = (q(`SELECT name FROM pragma_table_info('${t}')`).flat() as string[]);
      const hasDriver = cols.some((c) => /driverid|staffid/i.test(c));
      const hasCar = cols.some((c) => /^carid$|carindex/i.test(c));
      if (hasDriver && hasCar) {
        const n = Number(q(`SELECT COUNT(*) FROM "${t}"`).flat()[0]);
        console.log('CANDIDATE:', t, `rows=${n}`, cols.slice(0, 16));
      }
    } catch { /* skip */ }
  }
  // dump names of all sim/car-related tables
  console.log('car-ish tables:', tables.filter((t) => /car|sim/i.test(t)));
}

void main();
