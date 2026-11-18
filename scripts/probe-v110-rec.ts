/**
 * probe-v110-rec — v0.11.0 step 1 verification leg on the SYNTHETIC
 * Shanghai 2028 fixture (owner-verified SQL numbers of autosave-5.sav,
 * race 212 — the fixture reproduces the real save's numbers exactly).
 *
 * Prints the DoD battery for `recommendUnderScenario`:
 *   · SC [25,27]  → S→M→S pit 25/38, 80.2s (lead 83.1s, −2.9s, switch);
 *   · SC [19,21]  → S→S→M pit 19/38, 75.8s (−7.3s, switch);
 *   · rain [19,28] → S18/I10/S28 pit 18/28, 154.1s; alternates
 *     S18/I11/S27 157.9s + S18/I10/M28 164.6s; lead infeasible;
 *   · empty scenario → null;
 *   · parity: the recommendation priced through `priceManualPlan` with the
 *     same stints + scenario must equal the search's own price.
 *
 * Usage: bun scripts/probe-v110-rec.ts
 */
import { buildShanghaiModel, SHANGHAI_RACE_ID } from '../tests/helpers/shanghai-2028-fixture';
import {
  recommendUnderScenario,
  priceManualPlan,
  buildTyreLab,
} from '../src/engines/tyre.engine';

const model = buildShanghaiModel();
const raceId = SHANGHAI_RACE_ID;

const lab = buildTyreLab(model, raceId);
console.log('lab ready:', lab.data?.readiness.ready, 'laps:', lab.data?.laps);
console.log('lead plan:', lab.data?.carPlans?.lead.plan.order, lab.data?.carPlans?.lead.plan.pitLaps, lab.data?.carPlans?.lead.plan.timeS);
console.log('best plan:', lab.data?.best?.order, lab.data?.best?.pitLaps, lab.data?.best?.timeS);

const fmt = (r: ReturnType<typeof recommendUnderScenario>) => {
  if (!r) return 'null';
  const rec = r.recommendation;
  const lines = [
    `verdict=${r.verdict} delta=${r.deltaS} currentGreen=${r.currentGreenS}`,
    `rec: ${rec.order.join('→')} pits [${rec.pitLaps.join(',')}] ${rec.timeS}s wear=${rec.wearS ?? 0}`,
    ...r.alternates.map(
      (a, i) => `alt${i + 1}: ${a.order.join('→')} pits [${a.pitLaps.join(',')}] ${a.timeS}s`,
    ),
    r.currentUnderScenario.feasible
      ? `current: ${r.currentUnderScenario.plan.order.join('→')} ${r.currentUnderScenario.plan.timeS}s`
      : `current INFEASIBLE: ${r.currentUnderScenario.errors.join(' | ')}`,
    `assumptions: ${r.assumptions.map((a) => a.key).join(',')}`,
  ];
  return lines.join('\n');
};

const t0 = performance.now();
const sc2527 = recommendUnderScenario(model, raceId, 0, {
  events: [{ mode: 'sc', startLap: 25, laps: 3 }],
  rain: [],
});
const t1 = performance.now();
console.log('\n=== SC [25,27] ===', `(${(t1 - t0).toFixed(1)}ms)`);
console.log(fmt(sc2527));

const sc1921 = recommendUnderScenario(model, raceId, 0, {
  events: [{ mode: 'sc', startLap: 19, laps: 3 }],
  rain: [],
});
console.log('\n=== SC [19,21] ===');
console.log(fmt(sc1921));

const rain = recommendUnderScenario(model, raceId, 0, {
  events: [],
  rain: [{ startLap: 19, laps: 10 }],
});
console.log('\n=== RAIN [19,28] ===');
console.log(fmt(rain));

console.log('\n=== EMPTY ===', recommendUnderScenario(model, raceId, 0, { events: [], rain: [] }));

/* parity — the search's own price vs a straight priceManualPlan call */
if (sc2527) {
  const p = priceManualPlan(
    model,
    raceId,
    0,
    sc2527.recommendation.stints.map((s) => ({ compound: s.compound, laps: s.laps })),
    { events: [{ mode: 'sc', startLap: 25, laps: 3 }], rain: [] },
  );
  console.log(
    '\nparity SC[25,27]: search', sc2527.recommendation.timeS,
    'priceManualPlan', p.ok ? p.plan.timeS : p.errors,
  );
}
if (rain) {
  const p = priceManualPlan(
    model,
    raceId,
    0,
    rain.recommendation.stints.map((s) => ({ compound: s.compound, laps: s.laps })),
    { events: [], rain: [{ startLap: 19, laps: 10 }] },
  );
  console.log(
    'parity rain: search', rain.recommendation.timeS,
    'priceManualPlan', p.ok ? p.plan.timeS : p.errors,
  );
}
