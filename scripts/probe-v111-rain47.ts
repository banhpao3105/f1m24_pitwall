import { buildShanghaiModel, SHANGHAI_RACE_ID } from '../tests/helpers/shanghai-2028-fixture';
import { recommendUnderScenario, priceManualPlan } from '../src/engines/tyre.engine';
const model = buildShanghaiModel();
const r = recommendUnderScenario(model, SHANGHAI_RACE_ID, 0, { events: [], rain: [{ startLap: 47, laps: 10 }] })!;
const fmt = (p: any) => `${p.order.join('→')} laps ${p.stints.map((s: any) => s.laps).join('/')} pits [${p.pitLaps.join(',')}] ${p.timeS}s`;
console.log('rain [47,56] rec:', fmt(r.recommendation));
r.alternates.forEach((a: any, i: number) => console.log(`alt${i + 1}:`, fmt(a)));
console.log('verdict:', r.verdict, 'delta:', r.deltaS);
// parity check of the DoD-expected plan
for (const stints of [
  [{ compound: 'S', laps: 19 }, { compound: 'S', laps: 27 }, { compound: 'I', laps: 10 }],
  [{ compound: 'S', laps: 27 }, { compound: 'S', laps: 19 }, { compound: 'I', laps: 10 }],
] as const) {
  const p = priceManualPlan(model, SHANGHAI_RACE_ID, 0, stints as any, { events: [], rain: [{ startLap: 47, laps: 10 }] });
  console.log(stints.map((s) => `${s.compound}${s.laps}`).join('/'), p.ok ? `${p.plan.timeS}s` : `ERR ${p.errors.join('|')}`);
}
