/**
 * probe-grid-penalties — verify grid derivation vs real StartingPos (race 190)
 * and identify penalty semantics (ReasonForPenalty values vs observed deltas).
 * Usage: bun scripts/probe-grid-penalties.ts <path-to.sav> [raceId]
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

  const season = Number(q('SELECT CurrentSeason FROM Player_State LIMIT 1').flat()[0]);
  const raceId = process.argv[3] ? Number(process.argv[3]) : null;
  const target = raceId ?? Number(
    q(`SELECT RaceID FROM Races WHERE SeasonID=${season} AND State=2 ORDER BY Day DESC LIMIT 1`).flat()[0],
  );
  console.log('race:', target);

  // quali: every row (stage, driver, team, pos, gridPenalty col)
  const quali = q(
    `SELECT QualifyingStage, DriverID, TeamID, FinishingPos, GridPenalty
     FROM Races_QualifyingResults WHERE RaceID=${target} AND RaceFormula=1`,
  );
  console.log('quali rows F1:', quali.length);

  // results: StartingPos
  const res = q(
    `SELECT DriverID, TeamID, StartingPos, FinishingPos, DNF
     FROM Races_Results WHERE RaceID=${target}`,
  );
  const startBy = new Map(res.map((r) => [Number(r[0]), { start: Number(r[2]), team: Number(r[1]), fin: Number(r[3]), dnf: Number(r[4]) }]));

  // final quali pos per driver = highest stage row, then (stage desc, pos asc) order
  const bestStage = new Map<number, { stage: number; pos: number; team: number; gp: number }>();
  for (const r of quali) {
    const stage = Number(r[0]); const d = Number(r[1]); const team = Number(r[2]); const pos = Number(r[3]); const gp = Number(r[4] ?? 0);
    const cur = bestStage.get(d);
    if (!cur || stage > cur.stage) bestStage.set(d, { stage, pos, team, gp });
  }
  const ordered = [...bestStage.entries()]
    .sort((a, b) => b[1].stage - a[1].stage || a[1].pos - b[1].pos);
  const derived = ordered.map(([d, v], i) => ({ driver: d, qualiPos: i + 1, stage: v.stage, gp: v.gp, actualStart: startBy.get(d)?.start, team: v.team }));
  const mismatches = derived.filter((r) => r.actualStart != null && r.actualStart !== r.qualiPos);
  console.log('drivers derived:', derived.length, 'mismatches vs StartingPos:', mismatches.length);
  for (const m of mismatches) console.log(' mismatch:', JSON.stringify(m));

  console.log('grid penalties:', q(
    `SELECT PenaltyID, TeamID, CarID, ReasonForPenalty, SessionReceived, Served, PitLaneStart
     FROM Races_GridPenalties`,
  ).flat());
  const seasonPenalties = q(
    `SELECT g.PenaltyID, g.TeamID, g.CarID, g.ReasonForPenalty, g.SessionReceived, g.Served, g.PitLaneStart
     FROM Races_GridPenalties g`,
  ).flat();
  console.log('all penalties in save:', JSON.stringify(seasonPenalties));

  // teams of the penalized cars + which driver had which seat
  const teams = q('SELECT TeamID, Name, IsCustomTeam FROM Teams ORDER BY TeamID');
  console.log('teams:', JSON.stringify(teams));
}

void main();
