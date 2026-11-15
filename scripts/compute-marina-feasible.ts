/**
 * compute-marina-feasible — v0.9.1 DoD cross-check on the REAL save numbers.
 *
 * Mirrors the engine pipeline exactly (evaluateStrategy + ORACLE_DEG + cap
 * S21/M31/H48 + pit 20.7s + the §2 per-car set law) over the FULL order
 * enumeration and prints every number the prompt v0.9.1 §4 locks:
 *   · the pre-fix v0.8.1 prices (S→M→M 94.0 / game 103.7) for reference;
 *   · the post-fix ranked list with per-car feasibility;
 *   · the 22/52 sanity-passed/feasible counts.
 *
 * The tyre data comes from tests/helpers/marinabay-fixture.ts — the
 * owner-verified autosave-4.sav shape (Day 46663, race 204, 62 laps), not
 * an invented stock.
 *
 * Usage: bun scripts/compute-marina-feasible.ts
 */
import { buildTyreLab, evaluateStrategy, ORACLE_DEG } from '../src/engines/tyre.engine';
import { assignSetsForCar } from '../src/engines/grid.engine';
import { buildMarinaBayModel, MARINA_RACE_ID, MARINA_LAPS } from '../tests/helpers/marinabay-fixture';
import type { Compound, StrategyResult } from '../src/engines/tyre.engine';
import type { InventoryCompound } from '../src/engines/grid.engine';

const model = buildMarinaBayModel();
const lab = buildTyreLab(model, MARINA_RACE_ID);
const d = lab.data;

console.log(`save: autosave-4.sav (fixture) — Day 46663, race ${MARINA_RACE_ID} ${d.trackName}, ${MARINA_LAPS} laps, post-quali`);
console.log(`lives (model): S ${d.lives.S} / M ${d.lives.M} / H ${d.lives.H}`);
console.log(`cap (garage):  S ${d.inventory?.maxStint.S} / M ${d.inventory?.maxStint.M} / H ${d.inventory?.maxStint.H}`);
console.log(`deltas: S +0 / M +${d.deltas.M} / H +${d.deltas.H} · pit cost ${d.pitCostS}s`);
console.log('');

console.log('── sau fix (v0.9.1) ──');
for (const [i, s] of d.strategies.entries()) {
  const sets = s.stints
    .map((st) => (st.setUsed ? `#${st.setUsed.tyreSetId}${st.setUsed.fresh ? ' mới' : ' đã dùng'}/${st.setUsed.life}` : '—'))
    .join(' | ');
  console.log(
    `${i + 1}. ${s.order.join('→')} (${s.stints.map((st) => `${st.compound}${st.laps}`).join('/')}) pit ${s.pitLaps.join(',')} · ${s.timeS.toFixed(1)}s · vsBest +${s.vsBestS?.toFixed(1)}s · bộ: ${sets}`,
  );
}
const split = d.carPlans;
console.log(
  `lead: ${split?.lead.plan.order.join('→')} (${split?.lead.plan.stints.map((s) => `${s.compound}(${s.laps})`).join('/')}) pit ${split?.lead.plan.pitLaps.join(',')} · ${split?.lead.plan.timeS.toFixed(1)}s`,
);
console.log(
  `trail: ${split?.trail?.plan.order.join('→')} (${split?.trail?.plan.stints.map((s) => `${s.compound}(${s.laps})`).join('/')}) pit ${split?.trail?.plan.pitLaps.join(',')} · ${split?.trail?.plan.timeS.toFixed(1)}s · tie ${split?.tie}`,
);
console.log(`game plan: ${d.gamePlan?.compounds.join('→')} pit ${d.gamePlan?.pitLaps.join(',')} · ${d.gamePlan?.totalTimeS.toFixed(1)}s`);
for (const a of lab.assumptions.filter((x) => x.text.includes('kho'))) console.log(`note: ${a.text}`);
console.log('');

/* full enumeration mirror — the counts behind "22/52" */
const DRY: Compound[] = ['S', 'M', 'H'];
const orders: Compound[][] = [];
for (const a of DRY) for (const b of DRY) if (a !== b) orders.push([a, b]);
for (const a of DRY) for (const b of DRY) for (const c of DRY) {
  if (new Set([a, b, c]).size < 2) continue;
  orders.push([a, b, c]);
  orders.push([a, b, c, a]);
}
const invCap = { ...d.lives, ...d.inventory!.maxStint };
const minStintLaps = Math.max(5, Math.round(MARINA_LAPS / 12));
const feasibleRows: { order: string; split: string; timeS: number }[] = [];
let sanity = 0;
for (const order of orders) {
  const r = evaluateStrategy(order, MARINA_LAPS, d.lives, d.deltas, d.pitCostS, ORACLE_DEG);
  if (!r) continue;
  if (!r.stints.every((st) => st.laps >= minStintLaps)) continue;
  sanity++;
  const capEval = evaluateStrategy(order, MARINA_LAPS, invCap, d.deltas, d.pitCostS, ORACLE_DEG);
  if (!capEval) continue;
  const ok = d.inventory!.cars.every((car) =>
    assignSetsForCar(car.sets, capEval.stints as { compound: InventoryCompound; laps: number }[]) != null,
  );
  if (ok) {
    feasibleRows.push({
      order: order.join('→'),
      split: capEval.stints.map((st) => `${st.compound}${st.laps}`).join('/'),
      timeS: Math.round(capEval.timeS * 10) / 10,
    });
  }
}
console.log(`── đủ điều kiện chạy: ${feasibleRows.length}/${sanity} plan (sau sanity filter) ──`);
for (const row of feasibleRows) console.log(`  ✓ ${row.order} (${row.split}) · ${row.timeS.toFixed(1)}s`);
const infeasible = sanity - feasibleRows.length;
console.log(`bị loại theo luật §2: ${infeasible} plan (2 stint M hoặc 2 stint H — mỗi xe chỉ có 1 bộ M / 1 bộ H khả dụng)`);
