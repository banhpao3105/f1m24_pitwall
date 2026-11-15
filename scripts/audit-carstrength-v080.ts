/**
 * audit-carstrength-v080 — v0.8.0 verification leg on REAL saves.
 *
 * The post-Monza DoD save (Day 46636) is not in this sandbox, so the DoD
 * table itself is locked by the vitest fixture (tests/helpers/
 * car-strength-fixture.ts). THIS script proves the fixed parser + engine
 * against whatever REAL save is available:
 *
 *   - Parts_CarLoadout now parses to 198 rows (was 0 — the CarID bug),
 *   - CustomTeam L1 designs match the verified ids (Body 724, FrontWing
 *     722, RearWing 723, SidePods 650, Floor 692 on save1.sav),
 *   - the engine emits 22 aero rows whose PLAYER values equal the DoD
 *     table (the AI teams' parts sit at this save's own dev state, so
 *     best/mean/rival are this save's own numbers — printed for the live
 *     UI comparison at ?view=cars).
 *
 * Usage: bun scripts/audit-carstrength-v080.ts <path-to.sav>
 */
import { readFileSync } from 'node:fs';
import { runParsePipeline } from '../src/parser/pipeline';
import { buildCarStrength } from '../src/engines/car-strength.engine';

const SQL_WASM = '/home/z/my-project/node_modules/sql.js/dist/sql-wasm.wasm';

/** DoD player values (post-Monza save) — player parts are identical on the
 *  saves in this sandbox, so these must reproduce exactly. */
const DOD_PLAYER: Record<string, number> = {
  'Body/DRSDelta': 676.2,
  'Body/DragReduction': 690.0,
  'Body/AirFlowMiddle': 636.4,
  'FrontWing/AirFlowFront': 808.9,
  'FrontWing/AirFlowTolerance': 441.9,
  'FrontWing/LowSpeedDownforce': 754.5,
  'FrontWing/MedSpeedDownforce': 340.2,
  'FrontWing/HighSpeedDownforce': 317.7,
  'RearWing/AirFlowTolerance': 372.2,
  'RearWing/DRSDelta': 782.4,
  'RearWing/DragReduction': 775.5,
  'RearWing/LowSpeedDownforce': 222.0,
  'RearWing/MedSpeedDownforce': 678.4,
  'RearWing/HighSpeedDownforce': 298.1,
  'SidePods/AirFlowFront': 308.3,
  'SidePods/DragReduction': 419.9,
  'SidePods/AirFlowMiddle': 697.2,
  'Floor/AirFlowTolerance': 454.9,
  'Floor/DragReduction': 537.3,
  'Floor/LowSpeedDownforce': 674.1,
  'Floor/MedSpeedDownforce': 688.5,
  'Floor/HighSpeedDownforce': 690.8,
};

async function main() {
  const path = process.argv[2] ?? 'upload/save1.sav';
  const raw = readFileSync(path);
  const { model } = await runParsePipeline(new Uint8Array(raw), {
    fileName: path.split('/').pop() ?? path,
    fileSizeBytes: raw.length,
    saveId: 'audit-v080',
    locateFile: () => SQL_WASM,
  });

  console.log(`save: ${path} — day ${model.meta.day}, player ${model.player.teamName} (${model.player.teamId})`);
  console.log(`loadouts: ${model.parts.loadouts.length} rows (was 0 before the v0.8.0 fix)`);
  const l1 = model.parts.loadouts.filter((l) => l.teamId === model.player.teamId && l.loadoutId === 1);
  console.log(
    `player L1: ${l1.map((l) => `${l.partType}→${l.designId ?? 'NULL'}`).join(', ')}`,
  );

  const board = buildCarStrength(model);
  console.log(
    `\nengine: ${board.data.rows.length} aero rows, confidence ${board.confidence}, f1Teams ${board.data.f1TeamCount}, fallbacks ${board.data.fallbackCount}, rival ${board.data.rows[0]?.rivalTeamName ?? '—'}, warnings [${board.warnings.join(', ')}]`,
  );

  let mismatches = 0;
  for (const row of board.data.rows) {
    const keyStr = `${row.part}/${row.stat}`;
    const dod = DOD_PLAYER[keyStr];
    const v = row.playerValue != null ? Number(row.playerValue.toFixed(1)) : null;
    const ok = dod != null && v != null && Math.abs(v - dod) < 0.05;
    if (!ok) mismatches += 1;
    console.log(
      `${ok ? ' OK ' : 'FAIL'} ${keyStr}: player ${v} (DoD ${dod ?? '—'}) · best ${row.bestTeamName} ${row.bestValue?.toFixed(1)} (${row.bestSource}) · TB ${row.meanValue?.toFixed(1)} · ${row.pctBest}% / ${row.pctMean}% · ${row.rivalTeamName} ${row.rivalValue?.toFixed(1)}`
    );
  }
  console.log(`\nplayer-value check vs DoD: ${22 - mismatches}/22 OK`);
  if (mismatches > 0) process.exit(1);
}

void main();
