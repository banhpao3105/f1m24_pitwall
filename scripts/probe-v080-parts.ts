/**
 * probe-v080-parts — raw-SQL verification of the v0.8.0 DoD aero table.
 *
 * Runs the exact queries the car-strength engine will be built on:
 *   Parts_CarLoadout (TeamID, LoadoutID, PartType, DesignID, ItemID)
 *   Parts_Designs (DesignID, PartType, DayCompleted, TeamID)
 *   Parts_Designs_StatValues (DesignID, PartStat, Value)
 * and prints, per aero part (3–7) × aero stat, the 11-F1-team values,
 * best (team + value), mean, and the player/Williams columns — so the
 * DoD table in the prompt can be checked line by line on THIS sandbox's
 * save (upload/autosave.sav).
 *
 * Usage: bun scripts/probe-v080-parts.ts <path-to.sav>
 */
import { readFileSync } from 'node:fs';
import { parseF1ManagerSave } from '../src/parser/parse-save';
import { openDatabase } from '../src/parser/sqlite/sqljs-loader';

const SQL_WASM = '/home/z/my-project/node_modules/sql.js/dist/sql-wasm.wasm';

const AERO_PARTS = [3, 4, 5, 6, 7]; // Body, FrontWing, RearWing, SidePods, Floor
const AERO_STATS = new Set([
  'AirFlowFront',
  'AirFlowTolerance',
  'DRSDelta',
  'DragReduction',
  'LowSpeedDownforce',
  'MedSpeedDownforce',
  'HighSpeedDownforce',
  'AirFlowMiddle',
]);
const F1_TEAMS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 32]; // Prema 11 excluded
const PLAYER = 32;
const RIVAL = 6; // Williams

async function main() {
  const path = process.argv[2] ?? 'upload/autosave.sav';
  const raw = readFileSync(path);
  const binary = parseF1ManagerSave(new Uint8Array(raw));
  const db = await openDatabase(binary.databaseFile, { locateFile: () => SQL_WASM });

  // save state
  const state = db.exec(`SELECT Day, CurrentSeason FROM Player_State`)[0];
  console.log(`Player_State day=${state.values[0][0]} season=${state.values[0][1]}`);
  const races = db.exec(
    `SELECT COUNT(*) FROM Races WHERE SeasonID=(SELECT CurrentSeason FROM Player_State) AND State=2`,
  )[0];
  console.log(`races completed this season: ${races.values[0][0]}`);

  // enum tables
  const typeEnum = db.exec(`SELECT Value, Name FROM Parts_Enum_Type`)[0];
  const typeNames = new Map(typeEnum.values.map((r) => [Number(r[0]), String(r[1])]));
  const statEnum = db.exec(`SELECT Value, Name FROM Parts_Enum_Stats`)[0];
  const statNames = new Map(statEnum.values.map((r) => [Number(r[0]), String(r[1])]));
  console.log(`Parts_Enum_Type: ${[...typeNames.entries()].map(([v, n]) => `${v}=${n}`).join(', ')}`);
  console.log(
    `Parts_Enum_Stats: ${[...statNames.entries()].map(([v, n]) => `${v}=${n}`).join(', ')}`,
  );

  // loadout shape
  const lod = db.exec(`SELECT TeamID, LoadoutID, PartType, DesignID, ItemID FROM Parts_CarLoadout`)[0];
  console.log(`\nParts_CarLoadout rows: ${lod.values.length}`);
  const playerL1 = lod.values.filter((r) => Number(r[0]) === PLAYER && Number(r[1]) === 1);
  console.log(`CustomTeam L1: ${playerL1.map((r) => `${typeNames.get(Number(r[2]))}→${r[3]}`).join(', ')}`);
  const playerL2 = lod.values.filter((r) => Number(r[0]) === PLAYER && Number(r[1]) === 2);
  const sameL = JSON.stringify(playerL1) === JSON.stringify(playerL2);
  console.log(`CustomTeam L1 == L2: ${sameL}`);
  const nullDesign = lod.values.filter((r) => r[3] == null);
  console.log(`rows with NULL DesignID: ${nullDesign.length} → ${nullDesign.map((r) => `T${r[0]} L${r[1]} ${typeNames.get(Number(r[2]))}`).join('; ')}`);

  // designs + stat values
  const dsg = db.exec(`SELECT DesignID, PartType, DayCompleted, TeamID FROM Parts_Designs`)[0];
  const designById = new Map(
    dsg.values.map((r) => [Number(r[0]), { partType: Number(r[1]), day: r[2], teamId: Number(r[3]) }]),
  );
  const sv = db.exec(`SELECT DesignID, PartStat, Value FROM Parts_Designs_StatValues`)[0];
  const statsByDesign = new Map<number, Map<string, number>>();
  for (const [did, stat, value] of sv.values) {
    const name = statNames.get(Number(stat)) ?? String(stat);
    const m = statsByDesign.get(Number(did)) ?? new Map<string, number>();
    m.set(name, Number(value));
    statsByDesign.set(Number(did), m);
  }

  // resolve each team's current part per aero type (L1 installed, else latest completed)
  const resolve = (teamId: number, partType: number): { designId: number; source: string } | null => {
    const inst = lod.values.find(
      (r) => Number(r[0]) === teamId && Number(r[1]) === 1 && Number(r[2]) === partType && r[3] != null,
    );
    if (inst) return { designId: Number(inst[3]), source: 'installed' };
    let best: { id: number; day: number } | null = null;
    for (const [id, d] of designById) {
      if (d.teamId !== teamId || d.partType !== partType) continue;
      const day = Number(d.day ?? 0);
      if (day <= 0) continue;
      if (!best || day > best.day) best = { id, day };
    }
    return best ? { designId: best.id, source: 'latest' } : null;
  };

  console.log(`\nfallbacks (installed missing at L1):`);
  for (const t of F1_TEAMS) {
    for (const p of AERO_PARTS) {
      const inst = lod.values.find(
        (r) => Number(r[0]) === t && Number(r[1]) === 1 && Number(r[2]) === p && r[3] != null,
      );
      if (!inst) {
        const r = resolve(t, p);
        console.log(`  ${typeNames.get(p)} team ${t} → design ${r?.designId} (${r?.source}, DayCompleted ${r ? designById.get(r.designId)?.day : '?'})`);
      }
    }
  }

  // the aero table
  console.log(`\naero table (11 F1 teams, aero parts 3–7):`);
  const rows: string[] = [];
  for (const p of AERO_PARTS) {
    for (const stat of [...AERO_STATS]) {
      const vals: { teamId: number; value: number }[] = [];
      for (const t of F1_TEAMS) {
        const r = resolve(t, p);
        if (!r) continue;
        const v = statsByDesign.get(r.designId)?.get(stat);
        if (v != null) vals.push({ teamId: t, value: v });
      }
      if (vals.length === 0) continue;
      const best = vals.reduce((a, b) => (b.value > a.value ? b : a));
      const mean = vals.reduce((s, x) => s + x.value, 0) / vals.length;
      const player = vals.find((x) => x.teamId === PLAYER);
      const rival = vals.find((x) => x.teamId === RIVAL);
      const pct = (v: number) => (v / best.value) * 100;
      rows.push(
        [
          typeNames.get(p),
          stat,
          player ? player.value.toFixed(1) : '—',
          `${typeNames.get(best.teamId)} ${best.value.toFixed(1)}`,
          mean.toFixed(1),
          player ? `${pct(player.value).toFixed(1)}%` : '—',
          player ? `${(player.value / mean * 100).toFixed(1)}%` : '—',
          rival ? rival.value.toFixed(1) : '—',
        ].join(' | '),
      );
    }
  }
  for (const r of rows) console.log(r);
  console.log(`\ntotal aero rows: ${rows.length}`);
  db.close();
}
main().catch((e) => {
  console.error('FAIL', e);
  process.exit(1);
});
