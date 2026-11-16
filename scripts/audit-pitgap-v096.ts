/**
 * audit-pitgap-v096 — v0.9.6 verification leg on REAL saves.
 *
 * Prints, for the target race(s), the full two-car split + best + game plan
 * on the TRAIL_PIT_GAP = 1 tree (no shared pit lap is a double-stack; gap
 * ≥ 1 is legal). Numbers only — no row data leaves the machine.
 *
 * Usage: bun scripts/audit-pitgap-v096.ts <path-to.sav> [raceId or track substring]
 */
import { readFileSync } from 'node:fs';
import { runParsePipeline } from '../src/parser/pipeline';
import { buildTyreLab } from '../src/engines/tyre.engine';

const SQL_WASM = '/home/z/my-project/node_modules/sql.js/dist/sql-wasm.wasm';

function fmtStints(plan: {
  stints: { compound: string; laps: number; wearS?: number }[];
}): string {
  return plan.stints
    .map((s) => `${s.compound}${s.laps}${s.wearS != null ? `(${s.wearS > 0 ? '+' : ''}${s.wearS})` : ''}`)
    .join('/');
}

async function main() {
  const path = process.argv[2] ?? 'upload/autosave.sav';
  const filter = process.argv[3];
  const raw = readFileSync(path);
  const { model } = await runParsePipeline(new Uint8Array(raw), {
    fileName: path.split('/').pop() ?? path,
    fileSizeBytes: raw.length,
    saveId: 'audit-v096',
    locateFile: () => SQL_WASM,
  });

  console.log(`save: ${path}  season=${model.meta.seasonId} day=${model.meta.day}`);

  const pending = model.races.filter((r) => r.state !== 2);
  const targets = (filter
    ? [...pending, ...model.races].filter((r) =>
        String(r.raceId) === filter || r.trackName.toLowerCase().includes(filter.toLowerCase()),
      )
    : pending
  ).slice(0, 3);

  for (const race of targets) {
    const lab = buildTyreLab(model, race.raceId);
    const d = lab.data;
    console.log(
      `\n== race ${race.raceId} ${race.trackName} (${race.laps ?? '?'} laps, state ${race.state}) — ` +
        `lab ready=${d?.readiness.ready ?? 'n/a'} ==`,
    );
    if (!d || !d.readiness.ready) {
      console.log('  lab NOT ready — nothing to print.');
      continue;
    }
    if (d.best) {
      console.log(
        `  BEST   : ${d.best.order.join('→')} pit ${d.best.pitLaps.join(',')} · ${d.best.timeS.toFixed(1)}s · wear ${d.best.wearS ?? 0}`,
      );
    }
    const cp = d.carPlans;
    if (cp) {
      const lead = cp.lead;
      console.log(
        `  LEAD   : ${lead.plan.order.join('→')} (${fmtStints(lead.plan)}) pit ${lead.plan.pitLaps.join(',')} · ` +
          `${lead.plan.timeS.toFixed(1)}s · wear ${lead.plan.wearS ?? 0} · ${lead.carLabel}`,
      );
      if (cp.trail) {
        const t = cp.trail;
        console.log(
          `  TRAIL  : ${t.plan.order.join('→')} (${fmtStints(t.plan)}) pit ${t.plan.pitLaps.join(',')} · ` +
            `${t.plan.timeS.toFixed(1)}s · wear ${t.plan.wearS ?? 0} · reason ${t.reason}` +
            `${t.shiftedBy != null ? ` · shiftedBy ${t.shiftedBy}` : ''} · ${t.carLabel}` +
            `${t.plan.vsBestS != null ? ` · vsBestS ${t.plan.vsBestS > 0 ? '+' : ''}${t.plan.vsBestS}` : ''}`,
        );
        console.log(`           sets: ${t.plan.stints.map((s) => `#${s.setUsed?.tyreSetId} ${s.setUsed?.fresh ? 'mới' : 'dùng'} đời ${s.setUsed?.life}`).join(' | ')}`);
        const leadPits = lead.plan.pitLaps;
        const minGap = Math.min(...t.plan.pitLaps.map((pl) => Math.min(...leadPits.map((lp) => Math.abs(pl - lp)))));
        console.log(`           min pit gap vs lead: ${minGap} ${minGap === 0 ? '  ← SHARED LAP (double-stack — KHÔNG được phép)' : ''}`);
      } else {
        console.log('  TRAIL  : none');
      }
      console.log(`  tie    : ${cp.tie}`);
    }
    if (d.gamePlan) {
      console.log(
        `  GAME   : ${d.gamePlan.compounds.join('→')} pit ${d.gamePlan.pitLaps.join(',')} · ${d.gamePlan.totalTimeS.toFixed(1)}s`,
      );
    }
    const s13 = d.strategies.find((s) => s.order.join('→') === 'S→M→S' && s.stops === 2);
    const mss = d.strategies.find((s) => s.order.join('→') === 'M→S→S' && s.stops === 2);
    if (s13) console.log(`  ranked S→M→S: ${s13.timeS.toFixed(1)}s wear ${s13.wearS ?? 0} vsBest ${s13.vsBestS}`);
    if (mss) console.log(`  ranked M→S→S: ${mss.timeS.toFixed(1)}s wear ${mss.wearS ?? 0} vsBest ${mss.vsBestS}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
