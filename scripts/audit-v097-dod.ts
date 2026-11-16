/**
 * audit-v097-dod — v0.9.7 verification leg on REAL saves.
 *
 * Runs the free-form simulator DoD battery (prompt §1.5) against a real
 * save and prints every locked number for release-step comparison:
 *   · wetPace (the game's own wet ELT medians + deltas + lives);
 *   · the lab baseline (best / lead / trail / game);
 *   · the builder cases — B1–B8 on a Shanghai save, V1–V3 on a Vegas save.
 * (The §2.4 multi-SC printing lands with step 2's whatIfSCVSCMulti.)
 *
 * Numbers only — no row data leaves the machine. On a save without the
 * DoD race (or a pre-weekend save) it says so honestly and prints nothing
 * invented.
 *
 * Usage: bun scripts/audit-v097-dod.ts <path-to.sav> [trackSubstring]
 *   e.g. bun scripts/audit-v097-dod.ts autosave-5.sav shanghai
 *        bun scripts/audit-v097-dod.ts save1.sav vegas
 */
import { readFileSync } from 'node:fs';
import { runParsePipeline } from '../src/parser/pipeline';
import {
  buildTyreLab,
  wetPace,
  priceManualPlan,
  whatIfSCVSC,
  whatIfSCVSCMulti,
} from '../src/engines/tyre.engine';
import type { SaveModel } from '../src/domain/types';
import type { SCVSCScenario } from '../src/engines/tyre.engine';

const SQL_WASM = '/home/z/my-project/node_modules/sql.js/dist/sql-wasm.wasm';

interface BuilderCase {
  name: string;
  stints: { compound: 'S' | 'M' | 'H' | 'I' | 'W'; laps: number }[];
  events?: { mode: 'sc' | 'vsc'; startLap: number; laps: number }[];
  rain?: { startLap: number; laps: number }[];
}

const SHANGHAI_CASES: BuilderCase[] = [
  { name: 'B1', stints: [{ compound: 'S', laps: 19 }, { compound: 'M', laps: 18 }, { compound: 'M', laps: 19 }] },
  { name: 'B2', stints: [{ compound: 'M', laps: 13 }, { compound: 'S', laps: 13 }, { compound: 'M', laps: 13 }, { compound: 'M', laps: 17 }] },
  { name: 'B3', stints: [{ compound: 'S', laps: 28 }, { compound: 'I', laps: 11 }, { compound: 'S', laps: 17 }], rain: [{ startLap: 29, laps: 11 }] },
  { name: 'B4', stints: [{ compound: 'S', laps: 19 }, { compound: 'M', laps: 18 }, { compound: 'S', laps: 19 }], rain: [{ startLap: 29, laps: 11 }] },
  { name: 'B5', stints: [{ compound: 'S', laps: 19 }, { compound: 'I', laps: 18 }, { compound: 'S', laps: 19 }] },
  { name: 'B6', stints: [{ compound: 'H', laps: 56 }] },
  { name: 'B7', stints: [{ compound: 'S', laps: 19 }, { compound: 'M', laps: 18 }] },
  { name: 'B8', stints: [{ compound: 'S', laps: 19 }, { compound: 'M', laps: 18 }, { compound: 'M', laps: 19 }], events: [{ mode: 'sc', startLap: 19, laps: 3 }] },
];

const VEGAS_CASES: BuilderCase[] = [
  { name: 'V1', stints: [{ compound: 'M', laps: 24 }, { compound: 'S', laps: 13 }, { compound: 'S', laps: 13 }] },
  { name: 'V2', stints: [{ compound: 'S', laps: 19 }, { compound: 'M', laps: 15 }, { compound: 'S', laps: 16 }] },
  { name: 'V3', stints: [{ compound: 'M', laps: 19 }, { compound: 'I', laps: 10 }, { compound: 'M', laps: 21 }], rain: [{ startLap: 20, laps: 10 }] },
];

function printCase(
  model: SaveModel,
  raceId: number,
  carIndex: number,
  c: BuilderCase,
): void {
  const r = priceManualPlan(model, raceId, carIndex, c.stints, {
    events: c.events,
    rain: c.rain,
  });
  if (!r.ok) {
    console.log(`  ${c.name}: INFEASIBLE — ${JSON.stringify(r.errors)}`);
    return;
  }
  const p = r.plan;
  const sets = p.stints
    .map(
      (s) =>
        `#${s.setUsed?.tyreSetId}${s.setUsed?.fresh ? 'f' : 'u'}${s.setUsed?.life}${s.wearS != null ? ` w${s.wearS > 0 ? '+' : ''}${s.wearS}` : ''}`,
    )
    .join(', ');
  console.log(
    `  ${c.name}: ${p.order.join('→')} · ${p.timeS}s · wear ${p.wearS ?? 'absent'} · ` +
      `vsBest ${p.vsBestS != null ? (p.vsBestS > 0 ? '+' : '') + p.vsBestS : '—'} · ` +
      `base ${p.baseTimeS}s · pits [${p.pitLaps.join(',')}] · sets ${sets}`,
  );
  for (const a of r.assumptions) console.log(`        · ${a}`);
}

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error('Usage: bun scripts/audit-v097-dod.ts <path-to.sav> [trackSubstring]');
    process.exit(1);
  }
  const filter = (process.argv[3] ?? '').toLowerCase();
  const raw = readFileSync(path);
  const { model } = await runParsePipeline(new Uint8Array(raw), {
    fileName: path.split('/').pop() ?? path,
    fileSizeBytes: raw.length,
    saveId: 'audit-v097',
    locateFile: () => SQL_WASM,
  });

  console.log(`save: ${path}  season=${model.meta.seasonId} day=${model.meta.day}`);

  /* v0.9.9 — resolve the audit race within the CURRENT season only, and
     prefer an in-progress race (state 1). The old selection filtered
     pending races across EVERY season, so a mid-2028 save matched an
     old-season copy of the track (race 128 Shanghai, state 0) where the
     lab gate is closed — printing "lab NOT ready" and auditing nothing.
     Wrong-race selection is a script bug, not a data problem. */
  const seasonPending = model.races.filter(
    (r) => r.seasonId === model.meta.seasonId && r.state !== 2,
  );
  const named = filter
    ? seasonPending.filter((r) => r.trackName.toLowerCase().includes(filter))
    : seasonPending;
  const target = named.find((r) => r.state === 1) ?? named[0] ?? null;
  if (!target) {
    console.log(
      `no pending race matching "${filter}" in season ${model.meta.seasonId} — nothing to audit`,
    );
    return;
  }

  console.log(
    `\n== race ${target.raceId} ${target.trackName} (${target.laps ?? '?'} laps, state ${target.state}) ==`,
  );

  const wp = wetPace(model);
  if (wp) {
    console.log(
      `  wetPace: S ${wp.elt.S.toFixed(2)} · I ${wp.elt.I?.toFixed(2) ?? '—'} (+${wp.deltas.I}) · ` +
        `W ${wp.elt.W?.toFixed(2) ?? '—'} (+${wp.deltas.W}) · lives I ${wp.lives.I ?? '—'} / W ${wp.lives.W ?? '—'} · ` +
        `n I ${wp.samples.I} / W ${wp.samples.W}`,
    );
  } else {
    console.log('  wetPace: null (no fresh wet allocation — I/W refuses honestly)');
  }

  const lab = buildTyreLab(model, target.raceId);
  const d = lab.data;
  if (!d || !d.readiness.ready) {
    console.log('  lab NOT ready — builder cases need a post-quali save.');
    return;
  }
  const lead = d.carPlans?.lead;
  const trail = d.carPlans?.trail;
  console.log(
    `  baseline: best ${d.best?.timeS.toFixed(1)}s (${d.best?.order.join('→')}) · ` +
      `lead ${lead ? `${lead.plan.timeS.toFixed(1)}s (${lead.plan.order.join('→')})` : '—'} · ` +
      `trail ${trail ? `${trail.plan.timeS.toFixed(1)}s (${trail.plan.order.join('→')})` : '—'} · ` +
      `game ${d.gamePlan ? `${d.gamePlan.totalTimeS.toFixed(1)}s` : '—'} · ` +
      `deltas M ${d.deltas.M > 0 ? '+' : ''}${d.deltas.M} / H ${d.deltas.H > 0 ? '+' : ''}${d.deltas.H}`,
  );

  const track = target.trackName.toLowerCase();
  const cases = [
    ...(track.includes('shanghai') ? SHANGHAI_CASES.map((c) => ({ ...c, car: 0 })) : []),
    ...(track.includes('vegas') ? VEGAS_CASES.map((c) => ({ ...c, car: 1 })) : []),
  ];
  if (cases.length === 0) {
    console.log('  (no §1.5 builder cases mapped for this track)');
  } else {
    console.log(`  builder cases (${cases.length}):`);
    for (const c of cases) printCase(model, target.raceId, c.car, c);
  }

  /* ── §2.4 — the multi-SC/VSC DoD battery ───────────────────────────────── */
  const multiCases: { name: string; scenarios: SCVSCScenario[] }[] = [];
  if (track.includes('shanghai')) {
    multiCases.push(
      { name: 'M1  SC[17,19]+VSC[37,39]', scenarios: [{ mode: 'sc', startLap: 17, laps: 3 }, { mode: 'vsc', startLap: 37, laps: 3 }] },
      { name: 'M2  SC[17,19]+VSC[18,20] (overlap)', scenarios: [{ mode: 'sc', startLap: 17, laps: 3 }, { mode: 'vsc', startLap: 18, laps: 3 }] },
      { name: 'M3  SC[17,19] (single, must equal whatIfSCVSC)', scenarios: [{ mode: 'sc', startLap: 17, laps: 3 }] },
    );
  }
  if (track.includes('marina')) {
    multiCases.push(
      { name: 'MB2 SC[17,19] (single, must equal whatIfSCVSC)', scenarios: [{ mode: 'sc', startLap: 17, laps: 3 }] },
      { name: 'MB3 SC[17,19]+VSC[27,44]', scenarios: [{ mode: 'sc', startLap: 17, laps: 3 }, { mode: 'vsc', startLap: 27, laps: 18 }] },
    );
  }
  for (const mc of multiCases) {
    const single = whatIfSCVSC(model, target.raceId, mc.scenarios[0]!);
    const multi = whatIfSCVSCMulti(model, target.raceId, mc.scenarios);
    if (!multi) {
      console.log(`  ${mc.name}: null (no track cols / lab not ready)`);
      continue;
    }
    console.log(
      `  ${mc.name}: pitCosts sc ${multi.pitCosts.sc} / vsc ${multi.pitCosts.vsc}`,
    );
    for (const r of multi.rows) {
      const same =
        single && mc.scenarios.length === 1
          ? single.rows.find((s) => s.order.join('→') === r.order.join('→'))
          : undefined;
      const ident =
        same != null &&
        same.scenarioTimeS === r.scenarioTimeS &&
        same.savedS === r.savedS &&
        same.stopsInWindow === r.stopsInWindows
          ? '  == single'
          : '';
      console.log(
        `      ${r.order.join('→')} ${r.greenTimeS.toFixed(1)} → ${r.scenarioTimeS.toFixed(1)} ` +
          `(saved ${r.savedS}, ${r.stopsInWindows} in windows)${ident}`,
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
