/**
 * probe-carid-map2 — inspect car-related table columns for TeamID links.
 * Usage: bun scripts/probe-carid-map2.ts <path-to.sav>
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
  for (const t of tables) {
    if (!/Save_CarConfig$|Save_CarAI$|Save_RaceSimCars$|Save_SimpleSimCars|Save_CarRaceEventSummary/.test(t)) continue;
    const cols = q(`SELECT name FROM pragma_table_info('${t}')`).flat() as string[];
    const n = Number(q(`SELECT COUNT(*) FROM "${t}"`).flat()[0]);
    console.log(t, `rows=${n}`, cols.slice(0, 24));
  }
  // Teams order
  console.log('teams:', q('SELECT TeamID, Name, IsCustomTeam FROM Teams ORDER BY rowid').flat());
}

void main();
