/**
 * probe-penalty-apply — for races 191/192 (save1): compare derived quali grid
 * vs actual StartingPos for every driver; flag mismatches and their teams.
 * Usage: bun scripts/probe-penalty-apply.ts <path-to.sav>
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
  for (const rid of [191, 192]) {
    const quali = q(`SELECT QualifyingStage, DriverID, TeamID, FinishingPos FROM Races_QualifyingResults WHERE RaceID=${rid} AND RaceFormula=1`);
    const res = q(`SELECT DriverID, TeamID, StartingPos FROM Races_Results WHERE RaceID=${rid}`);
    const startBy = new Map(res.map((r) => [Number(r[0]), { start: Number(r[2]), team: Number(r[1]) }]));
    const bestStage = new Map<number, { stage: number; pos: number; team: number }>();
    for (const r of quali) {
      const stage = Number(r[0]); const d = Number(r[1]); const team = Number(r[2]); const pos = Number(r[3]);
      const cur = bestStage.get(d);
      if (!cur || stage > cur.stage) bestStage.set(d, { stage, pos, team });
    }
    const ordered = [...bestStage.entries()].sort((a, b) => b[1].stage - a[1].stage || a[1].pos - b[1].pos);
    console.log(`race ${rid}: penalties rows =`, q(`SELECT * FROM Races_GridPenalties`).flat().length);
    ordered.forEach(([d, v], i) => {
      const s = startBy.get(d);
      const derived = i + 1;
      if (s && s.start !== derived) {
        console.log(`  MISMATCH driver ${d} team ${v.team} qualiP${derived} → startP${s.start} (moved ${s.start - derived})`);
      }
    });
  }
  console.log('grid penalties cols:', q("SELECT name FROM pragma_table_info('Races_GridPenalties')").flat());
}
void main();
