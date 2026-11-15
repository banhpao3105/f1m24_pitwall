/**
 * probe-inventory-map — verify CarID→Team mapping (Save_CarConfig) and the
 * practice-laps signal (allocation LapsCompleted vs Races_PracticeResults
 * LapCount) for driver-level mapping, on a save with a live weekend.
 * Usage: bun scripts/probe-inventory-map.ts <path-to.sav>
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

  console.log('car config (LoadoutID → TeamID):', q('SELECT LoadoutID, TeamID FROM Save_CarConfig ORDER BY LoadoutID').flat());
  console.log('teams rowid order:', q('SELECT TeamID, TeamName FROM Teams ORDER BY rowid').flat());

  const season = Number(q('SELECT CurrentSeason FROM Player_State LIMIT 1').flat()[0]);
  const inProgress = q(`SELECT RaceID, TrackID, State FROM Races WHERE SeasonID=${season} AND State=1`).flat();
  console.log('in-progress race:', inProgress);
  if (inProgress.length === 0) return;
  const rid = Number(inProgress[0]);

  console.log('allocation rows:', Number(q('SELECT COUNT(*) FROM Save_CarTyreAllocation').flat()[0]));
  const avail = q('SELECT AvailabilityState, WeekendTyreType, COUNT(*), MIN(FrontLeftWear), MAX(FrontLeftWear) FROM Save_CarTyreAllocation GROUP BY AvailabilityState, WeekendTyreType ORDER BY WeekendTyreType, AvailabilityState').flat();
  console.log('availability×type:', JSON.stringify(avail));

  // practice laps per driver per session (player team drivers)
  const practice = q(
    `SELECT PracticeSession, DriverID, TeamID, LapCount, BestLapTime
     FROM Races_PracticeResults WHERE RaceID=${rid} AND RaceFormula=1 ORDER BY PracticeSession, DriverID`,
  );
  console.log(`practice rows race ${rid}:`, practice.length);
  const playerTeam = Number(q('SELECT TeamID FROM Player LIMIT 1').flat()[0]);
  console.log('player team:', playerTeam);
  for (const r of practice.filter((p) => Number(p[2]) === playerTeam)) {
    console.log('  player driver practice:', JSON.stringify(r));
  }

  // allocation LapsCompleted by car × session for the player's cars (last 2 CarIDs)
  const allocLaps = q(
    `SELECT CarID, SessionLastUsedIn, SUM(LapsCompleted), COUNT(*)
     FROM Save_CarTyreAllocation WHERE LapsCompleted > 0
     GROUP BY CarID, SessionLastUsedIn ORDER BY CarID, SessionLastUsedIn`,
  );
  console.log('allocation lap usage per car×session:', JSON.stringify(allocLaps));

  // full inventory for the two player cars
  const inv = q(
    `SELECT CarID, WeekendTyreType, TyreSetID, FrontLeftWear, AvailabilityState,
            EstimatedLapLifeRemaining, EstimatedLapTime, LapsCompleted, SessionLastUsedIn
     FROM Save_CarTyreAllocation WHERE CarID >= 20 ORDER BY CarID, WeekendTyreType, TyreSetID`,
  );
  console.log('player-car inventory rows:', inv.length);
  for (const r of inv.slice(0, 60)) console.log('  ', JSON.stringify(r));
}

void main();
