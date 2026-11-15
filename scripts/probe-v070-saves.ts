/**
 * probe-v070-saves — v0.7.0 step 0 verification: identify the local saves.
 * Dumps (no personal data): meta day/season, next race, allocation row count,
 * practice/quali row counts for the next race, grid-penalties presence.
 * Usage: bun scripts/probe-v070-saves.ts <path-to.sav>
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

  const meta = q("SELECT CurrentSeason, Day FROM Player_State LIMIT 1").flat();
  console.log('season/day:', meta);
  console.log('player:', q("SELECT TeamID FROM Player LIMIT 1").flat());

  const races = q(`SELECT r.RaceID, r.TrackID, r.State, r.Day, t.Laps, r.SeasonID FROM Races r LEFT JOIN Races_Tracks t ON t.TrackID = r.TrackID WHERE r.SeasonID = ${meta[0]} ORDER BY r.Day`);
  console.log('races this season (first 8):', races.slice(0, 8));
  const next = races.find((r) => Number(r[2]) !== 2);
  console.log('next race:', next);

  if (next) {
    const rid = Number(next[0]);
    console.log('allocation rows:', q('SELECT COUNT(*) FROM Save_CarTyreAllocation').flat());
    console.log('practice rows next race:', q(`SELECT COUNT(*), COUNT(DISTINCT PracticeSession) FROM Races_PracticeResults WHERE RaceID = ${rid}`).flat());
    console.log('quali rows next race (all stages):', q(`SELECT COUNT(*), COUNT(DISTINCT QualifyingStage) FROM Races_QualifyingResults WHERE RaceID = ${rid}`).flat());
  }
  const lastDone = [...races].filter((r) => Number(r[2]) === 2).at(-1);
  if (lastDone) {
    const lid = Number(lastDone[0]);
    console.log('last completed race:', lastDone);
    console.log('quali rows last race:', q(`SELECT QualifyingStage, COUNT(*) FROM Races_QualifyingResults WHERE RaceID = ${lid} GROUP BY QualifyingStage`).flat());
    console.log('grid penalties rows:', q('SELECT COUNT(*) FROM Races_GridPenalties').flat());
    console.log('penalties detail:', q('SELECT PenaltyID, TeamID, CarID, ReasonForPenalty, SessionReceived, Served, PitLaneStart FROM Races_GridPenalties').flat());
  }
  console.log('player strategy rows:', q('SELECT COUNT(*) FROM Save_PlayerStrategyStints').flat());
  console.log('allocation columns:', q("SELECT name FROM pragma_table_info('Save_CarTyreAllocation')").flat());
  console.log('practice columns:', q("SELECT name FROM pragma_table_info('Races_PracticeResults')").flat());
  console.log('quali columns:', q("SELECT name FROM pragma_table_info('Races_QualifyingResults')").flat());
}

void main();
