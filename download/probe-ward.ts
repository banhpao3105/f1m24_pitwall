import { readFileSync } from 'node:fs';
import { parseF1ManagerSave } from '../src/parser/parse-save';
import { openDatabase } from '../src/parser/sqlite/sqljs-loader';
const SAVE = process.argv[2] ?? 'upload/autosave.sav';
const SQL_WASM = '/home/z/my-project/node_modules/sql.js/dist/sql-wasm.wasm';
async function main() {
  const binary = parseF1ManagerSave(readFileSync(SAVE));
  const db = await openDatabase(binary.databaseFile, { locateFile: () => SQL_WASM });
  const q = (sql: string): unknown[][] => db.exec(sql)[0]?.values ?? [];
  console.log('== names containing Ward ==');
  console.log(q(`SELECT StaffID, FirstName, LastName, IsGeneratedStaff FROM Staff_BasicData
    WHERE LastName LIKE '%Ward%' OR FirstName LIKE '%Pato%'`));
}
main().catch((e) => { console.error('PROBE FAILED:', e); process.exit(1); });
