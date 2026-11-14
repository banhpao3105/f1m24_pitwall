/**
 * v0.6.1 cliff backtest — tune DEG_CLIFF / DEG_FINAL.H against the two
 * verified saves (prompt mục 5), never by guesswork.
 *
 *   Silverstone 2027 pre-race (race 199, 52 laps, lives 23/35/53,
 *   deltas M 0.71 practice / H 0.89 allocation, pit 20.7):
 *     S1  stintDegPenalty(H, 35, 53) ≥ 40            (was 9.2s)
 *     S2  plan S(17)→H(35) ≥ 100s                     (Ricciardo's plan)
 *     S3  suggested plan is S→M→S (game) or S→M 1-stop — never S→H
 *   Bahrain mid-weekend (57 laps, lives 33/50/77, model deltas, pit 20.7):
 *     B1  S→M stays best at pit lap 23 (61.1s pre-cliff)
 *     B2  S→H stays behind S→M (71.6s pre-cliff)
 *   Suzuka (regression): S→S→M stays best, S→H far behind.
 *
 * Usage:
 *   bun scripts/tune-deg-cliff.ts           # grid search, prints winners
 *   bun scripts/tune-deg-cliff.ts --verify  # assert the SHIPPED constants
 */

import {
  buildTyreLab,
  evaluateStrategy,
  stintDegPenaltyWith,
  ORACLE_DEG,
  DEG_CLIFF,
  DEG_FINAL,
  type Compound,
  type DegConstants,
  type TyreLab,
} from '../src/engines/tyre.engine';
import { buildSilverstoneModel, SILVERSTONE_RACE_ID } from '../tests/helpers/silverstone-fixture';
import { buildBahrainModel, BAHRAIN_RACE_ID } from '../tests/helpers/bahrain-fixture';
import type { SaveModel } from '../src/domain/types';

const SIL_LAPS = 52;
const SIL_LIVES: Record<Compound, number> = { S: 23, M: 35, H: 53 };
const SIL_DELTAS: Record<Compound, number> = { S: 0, M: 0.71, H: 0.89 };
const PIT = 20.7;

const BAH_LAPS = 57;
const BAH_LIVES: Record<Compound, number> = { S: 33, M: 50, H: 77 };
const BAH_DELTAS: Record<Compound, number> = { S: 0, M: 0.55, H: 1.05 };

/** Suzuka-shaped case (verified v0.5.1 fixture numbers). */
const SUZ_LAPS = 53;
const SUZ_LIVES: Record<Compound, number> = { S: 25, M: 38, H: 58 };
const SUZ_DELTAS: Record<Compound, number> = { S: 0, M: 1.09, H: 1.76 };

function deg(cS: number, cM: number, cH: number, finalH: number): DegConstants {
  return {
    final: { S: 3.0, M: 2.0, H: finalH },
    cliff: { S: cS, M: cM, H: cH },
    cliffThreshold: 0.6,
  };
}

interface Report {
  cS: number; cM: number; cH: number; finalH: number;
  silDegH35: number; silPlan17_35: number;
  silBest: string; silBestTime: number; silMargin: number;
  silSH: number;
  bahBest: string; bahPit: number; bahBestTime: number; bahMargin: number;
  bahSH: number; bahSSM: number;
  suzBestTime: number; suzSH: number;
  ok: boolean; problems: string[];
}

function evaluateCase(cS: number, cM: number, cH: number, finalH: number): Report {
  const d = deg(cS, cM, cH, finalH);
  const problems: string[] = [];

  /* Silverstone */
  const silDegH35 = stintDegPenaltyWith(d, 'H', 35, 53);
  const silS = stintDegPenaltyWith(d, 'S', 17, 23);
  const silPlan17_35 = SIL_DELTAS.H * 35 + silS + silDegH35 + PIT;
  const silModel = buildSilverstoneModel();
  const silLab = buildTyreLab(silModel, SILVERSTONE_RACE_ID, { degOverride: d });
  const sil = silLab.data as TyreLab;
  const silBest = sil.best ? sil.best.order.join('→') : '—';
  const silBestTime = sil.best?.timeS ?? NaN;
  const runnerUp = sil.strategies[1]?.timeS ?? NaN;
  const silMargin = runnerUp - silBestTime;
  /* S→H may fall out of the top 6 — that only means it is even further
     behind; evaluate it directly so the margin check stays meaningful. */
  const silSH = evaluateStrategy(['S', 'H'], SIL_LAPS, SIL_LIVES, SIL_DELTAS, PIT, d)!.timeS;

  if (silDegH35 < 40) problems.push(`S1 degH35=${silDegH35.toFixed(1)} < 40`);
  if (silPlan17_35 < 100) problems.push(`S2 plan17/35=${silPlan17_35.toFixed(1)} < 100`);
  if (silBest !== 'S→M→S' && silBest !== 'S→M') problems.push(`S3 best=${silBest}`);
  if (silSH <= silBestTime) problems.push(`S3b S→H ${silSH.toFixed(1)} ≤ best ${silBestTime.toFixed(1)}`);

  /* Bahrain */
  const bahModel = buildBahrainModel();
  const bahLab = buildTyreLab(bahModel, BAHRAIN_RACE_ID, { degOverride: d });
  const bah = bahLab.data as TyreLab;
  const bahBest = bah.best ? bah.best.order.join('→') : '—';
  const bahPit = bah.best?.pitLaps[0] ?? -1;
  const bahBestTime = bah.best?.timeS ?? NaN;
  const bahRunner = bah.strategies[1]?.timeS ?? NaN;
  const bahMargin = bahRunner - bahBestTime;
  const bahSH = evaluateStrategy(['S', 'H'], BAH_LAPS, BAH_LIVES, BAH_DELTAS, PIT, d)!.timeS;
  const bahSSM = Math.min(
    ...bah.strategies.filter((s) => ['S→S→M', 'S→M→S'].includes(s.order.join('→'))).map((s) => s.timeS),
  );
  if (bahBest !== 'S→M') problems.push(`B1 best=${bahBest}`);
  if (bahPit !== 23) problems.push(`B1 pit=${bahPit} ≠ 23`);
  if (!(bahSH > bahBestTime)) problems.push(`B2 S→H ${bahSH.toFixed(1)} ≤ best`);
  if (!(bahBestTime < bahSSM)) problems.push(`B1b S→S→M ${bahSSM.toFixed(1)} ≤ best ${bahBestTime.toFixed(1)}`);

  /* Suzuka direction */
  const suzBest = evaluateStrategy(['S', 'S', 'M'], SUZ_LAPS, SUZ_LIVES, SUZ_DELTAS, PIT, d)!.timeS;
  const suzOrders: Compound[][] = [['S', 'M'], ['S', 'H'], ['M', 'H'], ['H', 'M'], ['H', 'S'], ['M', 'S']];
  let suzOther = Infinity;
  for (const o of suzOrders) {
    suzOther = Math.min(suzOther, evaluateStrategy(o, SUZ_LAPS, SUZ_LIVES, SUZ_DELTAS, PIT, d)!.timeS);
  }
  const suzSH = evaluateStrategy(['S', 'H'], SUZ_LAPS, SUZ_LIVES, SUZ_DELTAS, PIT, d)!.timeS;
  if (!(suzBest < suzOther)) problems.push(`Z1 Suzuka other ${suzOther.toFixed(1)} ≤ S→S→M ${suzBest.toFixed(1)}`);
  if (!(suzSH - suzBest >= 15)) problems.push(`Z1b Suzuka S→H margin ${suzSH - suzBest < 0 ? 'negative' : (suzSH - suzBest).toFixed(1)} < 15`);

  return {
    cS, cM, cH, finalH,
    silDegH35, silPlan17_35, silBest, silBestTime, silMargin, silSH,
    bahBest, bahPit, bahBestTime, bahMargin, bahSH, bahSSM,
    suzBestTime: suzBest, suzSH,
    ok: problems.length === 0, problems,
  };
}

function printReport(r: Report): void {
  console.log(
    `cS=${r.cS} cM=${r.cM} cH=${r.cH} fH=${r.finalH} | ` +
    `SIL degH35=${r.silDegH35.toFixed(1)} plan17/35=${r.silPlan17_35.toFixed(1)} best=${r.silBest} ${r.silBestTime.toFixed(1)}s (margin ${r.silMargin.toFixed(2)}, S→H ${r.silSH.toFixed(1)}) | ` +
    `BAH best=${r.bahBest}@${r.bahPit} ${r.bahBestTime.toFixed(1)}s (margin ${r.bahMargin.toFixed(2)}, S→H ${r.bahSH.toFixed(1)}, SSM ${Number.isFinite(r.bahSSM) ? r.bahSSM.toFixed(1) : '—'}) | ` +
    `SUZ best S→S→M ${r.suzBestTime.toFixed(1)} S→H ${r.suzSH.toFixed(1)} | ` +
    (r.ok ? 'OK' : `FAIL: ${r.problems.join('; ')}`),
  );
}

/* shipped constants quick check */
const shipped = evaluateCase(DEG_CLIFF.S, DEG_CLIFF.M, DEG_CLIFF.H, DEG_FINAL.H);
console.log('SHIPPED CONSTANTS:');
printReport(shipped);

if (process.argv.includes('--verify')) {
  if (!shipped.ok) {
    console.error('\nSHIPPED CONSTANTS FAIL THE BACKTEST');
    process.exit(1);
  }
  console.log('\nShipped constants satisfy every backtest constraint.');
  process.exit(0);
}

/* grid search — margins first, then the OK filter */
console.log('\nGRID SEARCH (sorted by min margin):');
const results: Report[] = [];
for (const cS of [0, 0.005, 0.01, 0.02, 0.03, 0.04, 0.05, 0.08]) {
  for (const cM of [0, 0.0025, 0.005, 0.01, 0.015, 0.02, 0.05]) {
    for (const cH of [1.5, 2, 3, 4, 5, 6, 8]) {
      for (const finalH of [1.8, 2.0, 2.2, 2.4, 2.6, 2.8, 3.0, 3.2]) {
        results.push(evaluateCase(cS, cM, cH, finalH));
      }
    }
  }
}
const ok = results.filter((r) => r.ok);
/* true selection metric: gap vs the S→H rival on both saves + the Bahrain
   S→S→M margin + the tightest Bahrain pit-lap alternative gap */
const score = (r: Report): number =>
  Math.min(
    r.silSH - r.silBestTime,
    r.bahSH - r.bahBestTime,
    r.bahSSM - r.bahBestTime,
  );
ok.sort((a, b) => score(a) - score(b));
console.log(`\n${ok.length}/${results.length} combos pass all constraints.`);
console.log('TOP 15 by min(SIL S→H gap, BAH S→H gap, BAH SSM margin):');
for (const r of ok.slice(-15).reverse()) {
  console.log(
    `cS=${r.cS} cM=${r.cM} cH=${r.cH} fH=${r.finalH} | SIL best=${r.silBest} ${r.silBestTime.toFixed(2)} S→H gap ${(r.silSH - r.silBestTime).toFixed(2)} degH35 ${r.silDegH35.toFixed(1)} plan17/35 ${r.silPlan17_35.toFixed(1)} | BAH ${r.bahBest}@${r.bahPit} ${r.bahBestTime.toFixed(2)} S→H gap ${(r.bahSH - r.bahBestTime).toFixed(2)} SSM gap ${(r.bahSSM - r.bahBestTime).toFixed(2)} | SUZ SSM ${r.suzBestTime.toFixed(1)} S→H ${r.suzSH.toFixed(1)}`,
  );
}

/* diagnosis — which constraint blocks the most combos */
const tally: Record<string, number> = {};
for (const r of results) for (const p of r.problems) {
  const key = p.replace(/=.*?(;|$)/, '=…$1');
  tally[key] = (tally[key] ?? 0) + 1;
}
console.log('\nFAILURE TALLY:');
for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 8)) {
  console.log(`  ${v.toLocaleString()}  ${k}`);
}
/* near misses on Silverstone margin */
const nearSIL = results
  .filter((r) => r.problems.every((p) => !p.startsWith('S1') && !p.startsWith('S2')))
  .sort((a, b) => (b.silBest === 'S→M→S' || b.silBest === 'S→M' ? 1 : 0) - (a.silBest === 'S→M→S' || a.silBest === 'S→M' ? 1 : 0) || a.silSH - a.silBestTime - (b.silSH - b.silBestTime));
console.log('\nNEAR-MISS SILVERSTONE (best plan & S→H gap):');
for (const r of nearSIL.slice(0, 8)) {
  console.log(
    `  cS=${r.cS} cM=${r.cM} cH=${r.cH} fH=${r.finalH} best=${r.silBest} ${r.silBestTime.toFixed(2)} S→H=${r.silSH.toFixed(2)} gap=${(r.silSH - r.silBestTime).toFixed(2)} | ${r.problems.join('; ')}`,
  );
}
