/**
 * audit-monza-v071 — v0.7.1 verification harness (bước 4).
 *
 * Runs the FIXED engine stack end-to-end on a real save and prints every
 * DoD number the v0.7.1 prompt locks: the CarConfig verification, the
 * player-scoped tyre inventory (aggregate + per-car caps), the derived
 * grid with applied/unresolved penalties, the readiness/practice pipeline
 * numbers, and the ranked plans' totals (lead / trail / game plan).
 *
 * v0.7.1 note: the Monza pre-race save4.db is not in the sandbox anymore —
 * the Monza-DoD numbers (57.6 / 57.6 / 75.0) run through the SAME engines
 * in the vitest suite against the owner-verified Monza fixture
 * (tests/engines/grid.engine.test.ts). This script is the REAL-SAVE leg of
 * the audit: point it at any real .sav (e.g. upload/save1.sav, a live
 * pre-race weekend) and read the DoD numbers straight from the engine.
 *
 * Usage: bun scripts/audit-monza-v071.ts <path-to.sav>
 */
import { readFileSync } from 'node:fs';
import { runParsePipeline } from '../src/parser/pipeline';
import { buildTyreLab } from '../src/engines/tyre.engine';
import { assessReadiness, buildTyreInventory, resolveCarDrivers } from '../src/engines/grid.engine';
import type { SaveModel } from '../src/domain/types';

const SQL_WASM = '/home/z/my-project/node_modules/sql.js/dist/sql-wasm.wasm';

async function main() {
  const path = process.argv[2] ?? 'upload/save1.sav';
  const raw = readFileSync(path);
  const { model } = await runParsePipeline(new Uint8Array(raw), {
    fileName: path.split('/').pop() ?? path,
    fileSizeBytes: raw.length,
    saveId: 'audit-v071',
    locateFile: () => SQL_WASM,
  });

  const season = model.meta.seasonId;
  const race =
    model.races
      .filter((r) => r.seasonId === season && r.state !== 2)
      .sort((a, b) => a.day - b.day)[0] ?? null;
  if (!race) {
    console.log('no upcoming race in this save');
    return;
  }

  console.log(`save: ${path} — day ${model.meta.day}, season ${season}`);
  console.log(
    `race ${race.raceId} ${race.trackName} (state ${race.state}), laps ${race.laps}, player team ${model.player.teamId}`,
  );

  /* ── bước 1: the CarConfig verification ── */
  console.log('\n== Bước 1 — Save_CarConfig verification ==');
  console.log('carTeamsVerified:', model.gridPenalties?.carTeamsVerified ?? '(no gridPenalties section)');
  console.log(
    'warnings:',
    model.meta.warnings.filter((w) => w.includes('CAR_TEAM')),
  );

  /* ── bước 2: the player-scoped inventory ── */
  console.log('\n== Bước 2 — tyre inventory (player cars only) ==');
  const readiness = assessReadiness(model, race.raceId);
  const lives = { S: 26, M: 39, H: 60 }; // field-median envelope for display
  const inventory = readiness.ready
    ? buildTyreInventory(model, lives, race.raceId)
    : null;
  if (inventory) {
    console.log('perCar:', inventory.perCar, '| cars:', inventory.cars.map((c) => `${c.carId}(${c.label})`).join(', '));
    for (const a of inventory.teamAggregate.filter((x) => ['S', 'M', 'H'].includes(x.compound))) {
      console.log(
        `  ${a.compound}: mới ×${a.fresh}${a.freshLife != null ? ` (đời ${a.freshLife})` : ''} · đã dùng ×${a.used}`,
      );
    }
    console.log('maxStint (team):', inventory.maxStint);
    /* v0.7.1 bước 2 sẽ expose perCarMaxStint — in thêm khi có */
  } else {
    console.log('inventory: null (gate closed or no player-car mapping)');
  }

  /* ── bước 3: the grid, honestly ── */
  console.log('\n== Bước 3 — grid (quali order + pending penalties only) ==');
  console.log('appliedPenalties:', readiness.derivedGrid?.appliedPenalties, '| unresolved:', readiness.derivedGrid?.unresolvedPenalties);
  const playerDrivers = new Set(model.drivers.filter((d) => d.teamId === model.player.teamId).map((d) => d.staffId));
  for (const g of readiness.grid ?? []) {
    if (playerDrivers.has(g.driverId) || g.gridPos !== g.qualiPos) {
      console.log(`  P${g.gridPos}${g.gridPos !== g.qualiPos ? ` (quali P${g.qualiPos})` : ''} — ${g.driverName}`);
    }
  }

  /* ── bước 5: the practice pipeline ── */
  console.log('\n== Bước 5 — practice pipeline (one source) ==');
  console.log('readiness.practiceSessions (F1 sessions in save):', readiness.practiceSessions);

  /* ── the full lab ── */
  const lab = buildTyreLab(model, race.raceId);
  console.log('\n== Tyre Lab ==');
  console.log('TyreLab.practiceSessions:', lab.data.practiceSessions);
  console.log('gate ready:', lab.data.readiness.ready, '| missing:', lab.data.readiness.missing);
  if (lab.data.best) {
    console.log(
      'lead plan:',
      lab.data.best.stints.map((s) => `${s.compound}(${s.laps})`).join('→'),
      'pit', lab.data.best.pitLaps.join('/'),
      '=', lab.data.best.timeS, 's (model', lab.data.best.modelTimeS, 's)',
    );
  }
  if (lab.data.carPlans?.trail) {
    const t = lab.data.carPlans.trail;
    console.log(
      'trail plan:',
      t.plan.stints.map((s) => `${s.compound}(${s.laps})`).join('→'),
      'pit', t.plan.pitLaps.join('/'),
      '=', t.plan.timeS, 's | reason:', t.reason,
    );
  }
  if (lab.data.gamePlan) {
    console.log(
      'game plan:',
      lab.data.gamePlan.compounds.join('→'),
      'pit', lab.data.gamePlan.pitLaps.join('/'),
      '= web-modelled', lab.data.gamePlan.totalTimeS, 's',
    );
  }
  const seat = resolveCarDrivers(model, race.raceId);
  console.log('seat mapping verified:', seat.verified, '| fallback cars:', seat.fallbackCars);
  console.log('\nevidence:');
  for (const e of lab.evidence) console.log(`  [${e.source}] ${e.label}`);
}

void main();
