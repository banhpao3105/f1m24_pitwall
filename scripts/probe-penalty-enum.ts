/**
 * probe-penalty-enum — dump Races_Enum_PenaltyType + penalty rows context.
 * Usage: bun scripts/probe-penalty-enum.ts <path-to.sav>
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
  console.log('enum cols:', q("SELECT name FROM pragma_table_info('Races_Enum_PenaltyType')").flat());
  console.log('enum rows:', q('SELECT * FROM Races_Enum_PenaltyType').flat());
  console.log('grid penalties:', q('SELECT * FROM Races_GridPenalties').flat());
  // quali grid penalty column distinct values
  console.log('quali GridPenalty distinct:', q('SELECT DISTINCT GridPenalty FROM Races_QualifyingResults').flat());
}
void main();
