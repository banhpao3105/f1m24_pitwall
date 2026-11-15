/**
 * audit-sc-v092 — v0.9.2 verification leg on a real save.
 *
 * Proves the SC/VSC what-if chain end-to-end on REAL data:
 *   1. the parser surfaces the Races_Tracks SC/pit columns into the model
 *      (D1) — printed straight from SaveModel, not raw SQL;
 *   2. the SC/VSC season history from Races_Results (the context line);
 *   3. the whatIfSCVSC pricing on the next pending race when the lab is
 *      ready (post-quali save) — otherwise it says so honestly and the
 *      pricing leg stays locked by the vitest suite on the MarinaBay
 *      fixture (prompt v0.9.1 §0 discipline).
 *
 * Usage: bun scripts/audit-sc-v092.ts [path-to.sav]
 */
import { readFileSync } from 'node:fs';
import { runParsePipeline } from '../src/parser/pipeline';
import { whatIfSCVSC, buildTyreLab } from '../src/engines/tyre.engine';

const SQL_WASM = '/home/z/my-project/node_modules/sql.js/dist/sql-wasm.wasm';

async function main() {
  const path = process.argv[2] ?? 'upload/autosave.sav';
  const raw = readFileSync(path);
  const { model } = await runParsePipeline(new Uint8Array(raw), {
    fileName: path.split('/').pop() ?? path,
    fileSizeBytes: raw.length,
    saveId: 'audit-v092',
    locateFile: () => SQL_WASM,
  });

  console.log(`save: ${path}  season=${model.meta.seasonId} day=${model.meta.day}`);

  // ── D1: the SC/pit columns as the MODEL carries them ──────────────────────
  console.log('\n== Races_Tracks SC/pit columns surfaced by the parser (SaveModel) ==');
  const seen = new Set<number>();
  for (const r of model.races) {
    if (seen.has(r.trackId) || r.trackPitLaneTimeLossS == null) continue;
    seen.add(r.trackId);
    console.log(
      `  ${r.trackName}: SCChance ${r.trackSafetyCarChance ?? '—'} · ` +
        `Pit ${r.trackPitLaneTimeLossS}s · Green ${r.trackGreenFlagTimeLossS ?? '—'}s · ` +
        `SC ${r.trackSafetyCarTimeLossS ?? '—'}s` +
        (r.trackPitLaneTimeLossS != null && r.trackGreenFlagTimeLossS != null
          ? ` (Pit−Green ${(r.trackPitLaneTimeLossS - r.trackGreenFlagTimeLossS).toFixed(1)})`
          : ''),
    );
  }
  if (seen.size === 0) {
    console.log('  (none — the parser did NOT surface the columns, D1 failed)');
  }

  // ── season interruption history from Races_Results (context line) ────────
  const done = model.races.filter((r) => r.state === 2 && r.results.length > 0);
  const scRaces = done.filter((r) => (r.results[0]?.safetyCarDeployments ?? 0) > 0).length;
  const vscRaces = done.filter((r) => (r.results[0]?.vscDeployments ?? 0) > 0).length;
  console.log(
    `\nSC/VSC history: ${scRaces}/${done.length} completed races with >=1 SC · ` +
      `${vscRaces}/${done.length} with >=1 VSC`,
  );

  // ── the what-if leg on the next pending race ─────────────────────────────
  const next =
    model.races.find((r) => r.seasonId === model.meta.seasonId && r.state !== 2) ??
    model.races.at(-1) ??
    null;
  if (!next) {
    console.log('\nno race to examine');
    return;
  }
  const lab = buildTyreLab(model, next.raceId);
  console.log(
    `\nnext race: id=${next.raceId} ${next.trackName} (${next.laps ?? '?'} laps) — ` +
      `lab ready=${lab.data?.readiness.ready ?? 'n/a'}`,
  );
  if (!lab.data || !lab.data.readiness.ready) {
    console.log('  lab not ready (pre-weekend save) — SC what-if stays OFF, no numbers invented.');
    console.log('  the pricing leg is locked by tests/engines/tyre.scvsc.test.ts (MarinaBay fixture).');
    return;
  }

  const best = lab.data.best;
  const scenario = {
    mode: 'sc' as const,
    startLap: best?.pitLaps[0] ?? 1,
    laps: 3,
  };
  const result = whatIfSCVSC(model, next.raceId, scenario);
  if (!result) {
    console.log('  whatIfSCVSC returned null — track columns missing or no plan.');
    return;
  }
  console.log(
    `\nSC what-if (window laps ${scenario.startLap}–${scenario.startLap + scenario.laps - 1}): ` +
      `pit green ${result.pitCostGreenS}s → SC ${result.pitCostScenarioS}s`,
  );
  for (const row of result.rows.slice(0, 5)) {
    console.log(
      `  ${row.order.join('→')} (${row.stops} pit @ ${row.pitLaps.join(',')}): ` +
        `${row.greenTimeS.toFixed(1)}s → ${row.scenarioTimeS.toFixed(1)}s ` +
        `(−${row.savedS.toFixed(1)}s, ${row.stopsInWindow} in window)`,
    );
  }
  console.log(`  assumptions: ${result.assumptions.map((a) => a.key).join(', ')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
