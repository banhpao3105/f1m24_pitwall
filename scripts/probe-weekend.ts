import { readFileSync } from 'node:fs';
import { parseF1ManagerSave } from '../src/parser/parse-save';
import { openDatabase } from '../src/parser/sqlite/sqljs-loader';
const SQL_WASM = '/home/z/my-project/node_modules/sql.js/dist/sql-wasm.wasm';
async function main() {
  const raw = readFileSync(process.argv[2]);
  const binary = parseF1ManagerSave(raw);
  const db = await openDatabase(binary.databaseFile, { locateFile: () => SQL_WASM });
  const q = (sql: string): unknown[][] => db.exec(sql)[0]?.values ?? [];
  console.log('races:', q('SELECT RaceID, TrackID, State, WeekendType FROM Races WHERE SeasonID=2027 AND RaceID<=194 ORDER BY RaceID').flat());
  console.log('sprint results 191:', q('SELECT COUNT(*) FROM Races_SprintResults WHERE RaceID=191').flat());
  console.log('quali stage rows 191:', q('SELECT QualifyingStage, COUNT(*) FROM Races_QualifyingResults WHERE RaceID=191 GROUP BY QualifyingStage').flat());
  console.log('quali stage rows 190:', q('SELECT QualifyingStage, COUNT(*) FROM Races_QualifyingResults WHERE RaceID=190 GROUP BY QualifyingStage').flat());
}
void main();
