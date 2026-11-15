/**
 * probe-v090-pitcost — raw-SQL reconnaissance for the v0.9.0 what-if SC/VSC work.
 *
 * Questions this probe answers (roadmap v0.9 §2.2.3 — semantics verification):
 *   Q1. What does Races_Tracks actually carry? (full column list + the 4
 *       columns per track: PitLaneTimeLoss, GreenFlagTimeLoss,
 *       SafetyCarTimeLoss, SafetyCarChance)
 *   Q2. Is there per-lap timing data for completed races in the save at all?
 *       (table recon: anything matching lap/timing/session/stint)
 *   Q3. Races_PitStopTimings — stationary time distribution per race.
 *
 * Prints to console only; nothing row-level is written to fixtures.
 *
 * Usage: bun scripts/probe-v090-pitcost.ts [path-to.sav]
 */
import { readFileSync } from 'node:fs';
import { parseF1ManagerSave } from '../src/parser/parse-save';
import { openDatabase } from '../src/parser/sqlite/sqljs-loader';

const SQL_WASM = '/home/z/my-project/node_modules/sql.js/dist/sql-wasm.wasm';

function cols(db: Awaited<ReturnType<typeof openDatabase>>, table: string): string[] {
  try {
    const res = db.exec(`PRAGMA table_info("${table.replace(/"/g, '""')}")`);
    return res[0]?.values.map((r) => String(r[1])) ?? [];
  } catch {
    return [];
  }
}

function rows(db: Awaited<ReturnType<typeof openDatabase>>, sql: string): unknown[][] {
  try {
    return db.exec(sql)[0]?.values ?? [];
  } catch (err) {
    console.log(`  !! query failed: ${sql}\n     ${err}`);
    return [];
  }
}

async function main() {
  const path = process.argv[2] ?? 'upload/autosave.sav';
  const raw = readFileSync(path);
  const binary = parseF1ManagerSave(new Uint8Array(raw));
  const db = await openDatabase(binary.databaseFile, { locateFile: () => SQL_WASM });

  console.log(`save: ${path}  game=${binary.metadata.gameVersion}`);

  // ---------- Q0b: season context + next race + SC/VSC history ----------
  const state = rows(db, `SELECT Day, CurrentSeason FROM Player_State`);
  console.log(
    `\nPlayer_State: day=${state[0]?.[0]} currentSeason=${state[0]?.[1]}`,
  );
  const next = rows(
    db,
    `SELECT r.RaceID, r.TrackID, t.Name, t.Laps, r.Day, t.SafetyCarChance,
            t.PitLaneTimeLoss, t.GreenFlagTimeLoss, t.SafetyCarTimeLoss
     FROM Races r LEFT JOIN Races_Tracks t ON t.TrackID = r.TrackID
     WHERE r.SeasonID = (SELECT CurrentSeason FROM Player_State) AND r.State = 0
     ORDER BY r.Day LIMIT 1`,
  );
  if (next[0]) {
    console.log(
      `next race: id=${next[0][0]} track=${next[0][1]} (${next[0][2]}) laps=${next[0][3]} day=${next[0][4]} SCChance=${next[0][5]} Pit=${next[0][6]} Green=${next[0][7]} SC=${next[0][8]}`,
    );
  }
  const scHist = rows(
    db,
    `SELECT COUNT(*) AS races, SUM(sc > 0), SUM(vs > 0) FROM (
       SELECT Season, RaceID,
              MAX(SafetyCarDeployments) AS sc,
              MAX(VirtualSafetyCarDeployments) AS vs
       FROM Races_Results GROUP BY Season, RaceID)`,
  );
  console.log(
    `Races_Results SC history: ${scHist[0]?.[0]} races with results, ${scHist[0]?.[1]} with >=1 SC, ${scHist[0]?.[2]} with >=1 VSC`,
  );

  // ---------- Q0: table recon ----------
  const tables = rows(db, `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).map(
    (r) => String(r[0]),
  );
  console.log(`\n== tables: ${tables.length} total ==`);
  const interesting = tables.filter((t) =>
    /^(Races_|.*Track.*|.*Lap.*|.*Timing.*|.*Session.*|.*Stint.*|.*SafetyCar.*|.*RaceControl.*|.*Incident.*)$/i.test(t),
  );
  for (const t of interesting) console.log(`  ${t}  [${cols(db, t).join(', ')}]`);

  // ---------- Q1: Races_Tracks full dump ----------
  console.log(`\n== Races_Tracks ==`);
  const trackCols = cols(db, 'Races_Tracks');
  console.log(`columns (${trackCols.length}): ${trackCols.join(', ')}`);
  const trackRows = rows(
    db,
    `SELECT * FROM Races_Tracks ORDER BY TrackID`,
  );
  for (const r of trackRows) {
    const obj: Record<string, unknown> = {};
    trackCols.forEach((c, i) => (obj[c] = r[i]));
    console.log(JSON.stringify(obj));
  }

  // ---------- Q2: all Races_* tables + races table recon ----------
  console.log(`\n== all Races_* tables (name, rowcount) ==`);
  for (const t of tables.filter((t) => t.startsWith('Races_'))) {
    const c = rows(db, `SELECT COUNT(*) FROM "${t.replace(/"/g, '""')}"`)[0]?.[0];
    console.log(`  ${t}: ${c} rows  [${cols(db, t).join(', ')}]`);
  }
  console.log(`\n== Races (main) columns + sample ==`);
  console.log(`  [${cols(db, 'Races').join(', ')}]`);
  const racesRows = rows(
    db,
    `SELECT ID, SeasonID, TrackID, State FROM Races WHERE SeasonID=(SELECT CurrentSeason FROM Player_State) ORDER BY ID`,
  );
  for (const r of racesRows) console.log(`  race ${r[0]} season=${r[1]} track=${r[2]} state=${r[3]}`);

  // ---------- Q3: Races_PitStopTimings per-stop stationary ----------
  console.log(`\n== Races_PitStopTimings ==`);
  const ptCols = cols(db, 'Races_PitStopTimings');
  console.log(`columns: ${ptCols.join(', ')}`);
  const stages = rows(db, `SELECT PitStopStage, COUNT(*), AVG(Duration) FROM Races_PitStopTimings GROUP BY PitStopStage ORDER BY PitStopStage`);
  console.log(`  per-stage (stage, n, avg duration):`);
  for (const r of stages) console.log(`    stage=${r[0]} n=${r[1]} avg=${Number(r[2]).toFixed(3)}`);
  // stationary = sum of all stages except jack-up/raise + release? Print per-stop totals first.
  const perStop = rows(
    db,
    `SELECT SeasonID, RaceID, TeamID, DriverID, PitStopID, Lap, SUM(Duration), COUNT(*)
     FROM Races_PitStopTimings GROUP BY SeasonID, RaceID, TeamID, DriverID, PitStopID ORDER BY RaceID, PitStopID`,
  );
  const totals = perStop.map((r) => Number(r[6]));
  totals.sort((a, b) => a - b);
  const q = (p: number) => totals[Math.floor(p * (totals.length - 1))];
  const avg = totals.reduce((s, v) => s + v, 0) / (totals.length || 1);
  console.log(
    `  per-stop SUM(Duration): n=${totals.length} min=${totals[0]} p25=${q(0.25)} median=${q(0.5)} p75=${q(0.75)} p90=${q(0.9)} max=${totals[totals.length - 1]} avg=${avg.toFixed(3)}`,
  );
  const hist: Record<string, number> = {};
  for (const v of totals) {
    const b = (Math.floor(v * 2) / 2).toFixed(1);
    hist[b] = (hist[b] ?? 0) + 1;
  }
  console.log(`  histogram (0.5s bins): ${JSON.stringify(hist)}`);
  // stages included in a typical (fast) stop — look at the stages of stops under 4s
  const fastStopStages = rows(
    db,
    `SELECT PitStopStage, COUNT(*), AVG(Duration) FROM Races_PitStopTimings
     WHERE (SeasonID, RaceID, TeamID, DriverID, PitStopID) IN (
       SELECT SeasonID, RaceID, TeamID, DriverID, PitStopID FROM Races_PitStopTimings
       GROUP BY SeasonID, RaceID, TeamID, DriverID, PitStopID HAVING SUM(Duration) < 4)
     GROUP BY PitStopStage ORDER BY PitStopStage`,
  );
  console.log(`  stages present in stops with SUM<4s (stage, n, avg):`);
  for (const r of fastStopStages) console.log(`    stage=${r[0]} n=${r[1]} avg=${Number(r[2]).toFixed(3)}`);
}

main().catch((err) => {
  console.error('PROBE FAILED:', err);
  process.exit(1);
});
