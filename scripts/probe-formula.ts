import { readFileSync } from 'node:fs';
import { parseF1ManagerSave } from '../src/parser/parse-save';
import { openDatabase } from '../src/parser/sqlite/sqljs-loader';
const SQL_WASM = '/home/z/my-project/node_modules/sql.js/dist/sql-wasm.wasm';
async function main() {
  const raw = readFileSync(process.argv[2]);
  const binary = parseF1ManagerSave(raw);
  const db = await openDatabase(binary.databaseFile, { locateFile: () => SQL_WASM });
  console.log(db.exec('SELECT TeamID, TeamName, Formula, IsCustomTeam FROM Teams ORDER BY TeamID')[0].values.filter((r) => Number(r[3]) === 1 || Number(r[2]) === 1 || Number(r[0]) === 32 || Number(r[0]) <= 12).map((r) => r.join('|')));
}
void main();
