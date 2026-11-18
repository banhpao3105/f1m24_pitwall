import { buildShanghaiModel, SHANGHAI_RACE_ID } from '../tests/helpers/shanghai-2028-fixture';
import { buildTyreLab, priceManualPlan, evaluateStrategy } from '../src/engines/tyre.engine';

const model = buildShanghaiModel();
const raceId = SHANGHAI_RACE_ID;
const lab = buildTyreLab(model, raceId);
const d = lab.data!;
const rain = [{ startLap: 19, laps: 10 }];

// ranked green plans (top 8)
console.log('ranked green (top 8):');
d.strategies.slice(0, 8).forEach((s, i) => {
  console.log(` #${i}: ${s.order.join('→')} laps ${s.stints.map(x=>x.laps).join('/')} ${s.timeS}s`);
});

// direct prices of the key rain plans
for (const stints of [
  [{compound:'S',laps:18},{compound:'I',laps:10},{compound:'S',laps:28}],
  [{compound:'S',laps:18},{compound:'I',laps:11},{compound:'S',laps:27}],
  [{compound:'S',laps:18},{compound:'I',laps:10},{compound:'M',laps:28}],
  [{compound:'S',laps:18},{compound:'I',laps:10},{compound:'H',laps:28}],
  [{compound:'S',laps:18},{compound:'I',laps:11},{compound:'M',laps:27}],
] as const) {
  const p = priceManualPlan(model, raceId, 0, stints as any, { events: [], rain });
  console.log(
    stints.map(s=>`${s.compound}${s.laps}`).join('/'),
    p.ok ? `${p.plan.timeS}s (wear ${p.plan.wearS ?? 0})` : `ERR ${p.errors.join('|')}`,
  );
}

// which orders' green split has a H/M/S tail fully after lap 28?
console.log('\ngreen splits with tails:');
for (const order of [['S','M','S'],['S','S','M'],['S','M','H'],['S','H','M'],['S','H','S'],['M','S','S'],['H','S','S'],['M','S','M']] as const) {
  const r = evaluateStrategy(order as any, 56, d.lives, d.deltas, d.pitCostS);
  if (r) console.log(` ${order.join('→')} = ${r.stints.map(x=>x.laps).join('/')}`);
}
