import { buildShanghaiModel, SHANGHAI_RACE_ID } from '../tests/helpers/shanghai-2028-fixture';
import { priceManualPlan } from '../src/engines/tyre.engine';
const model = buildShanghaiModel();
const rid = SHANGHAI_RACE_ID;
const p = (stints: Array<[string, number]>, events: any[] = [], rain: any[] = []) => {
  const r = priceManualPlan(model, rid, 0, stints.map(([c, l]) => ({ compound: c as any, laps: l })), { events, rain });
  console.log(stints.map(([c, l]) => `${c}${l}`).join('/'), r.ok ? `${r.plan.timeS}s vsBest ${r.plan.vsBestS}` : `ERR ${r.errors.join('|')}`);
};
// boundary drags (green)
p([['S', 25], ['S', 13], ['M', 18]]);      // b0 19→25: DoD 90.2 +7.1
p([['S', 19], ['S', 11], ['M', 26]]);      // b1 38→30: DoD 90.0
p([['S', 19], ['S', 25], ['M', 12]]);      // b1 →44: DoD 87.4
p([['S', 4], ['S', 34], ['M', 18]]);       // b0 min: 4/34/18
p([['S', 34], ['S', 4], ['M', 18]]);       // b0 max: 34/4/18
// SC [19,21] band → [25,27]: lead stays green 83.1
p([['S', 19], ['S', 19], ['M', 18]], [{ mode: 'sc', startLap: 25, laps: 3 }]);
// SC band right edge [19,38]: both pits in window → 68.6
p([['S', 19], ['S', 19], ['M', 18]], [{ mode: 'sc', startLap: 19, laps: 20 }]);
// rain band [47,56]: 1 error stint M
p([['S', 19], ['S', 19], ['M', 18]], [], [{ startLap: 47, laps: 10 }]);
