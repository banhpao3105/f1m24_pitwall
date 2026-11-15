/**
 * v0.6.3 cliff backtest — re-tune DEG_CLIFF.H against the REAL lives
 * (prompt v0.6.3 mục 2), never by guesswork. Only DEG_CLIFF.H moves;
 * DEG_FINAL, DEG_EXP and the 0.6 threshold are frozen.
 *
 * Lives are the corrected save medians (v0.6.2 mapping audit follow-up):
 *   Silverstone 2027 pre-race (race 199, 52 laps, lives 23/34/43,
 *   deltas M 0.71 practice / H 0.89 allocation, pit 20.7):
 *     S1  stintDegPenalty(H, 35, 43) ∈ [50, 90]  (5.0 × 9.2² blew up to 446s)
 *     S2  plan S(17)→H(35) ≥ 100s                 (Ricciardo's plan)
 *     S3  suggested plan is S→M→S (game) or S→M — never S→H
 *   Bahrain mid-weekend (57 laps, lives 33/46/59, model deltas, pit 20.7):
 *     B1  S→M stays best at pit lap 24 (~64.0s)
 *     B2  S→H stays behind S→M
 *   Suzuka (regression): S→S→M stays best, S→H far behind.
 *
 * Real-world anchor for the band: Ricciardo's H35 stint ran ~94.5s/lap vs
 * fresh H ~91.4s ⇒ ≈ 77s of wear after the pace correction; target 50–90s,
 * ships at ≈ 69.7s (cH 0.55).
 *
 * Usage:
 *   bun scripts/tune-deg-cliff.ts           # grid search, prints winners
 *   bun scripts/tune-deg-cliff.ts --verify  # assert the SHIPPED constant
 */

import {
  buildTyreLab,
  evaluateStrategy,
  stintDegPenaltyWith,
  DEG_CLIFF,
  DEG_FINAL,
  type Compound,
  type DegConstants,
  type TyreLab,
} from '../src/engines/tyre.engine';
import { buildSilverstoneModel, SILVERSTONE_RACE_ID } from '../tests/helpers/silverstone-fixture';
import { buildBahrainModel, BAHRAIN_RACE_ID } from '../tests/helpers/bahrain-fixture';

const SIL_LAPS = 52;
/** Real save medians (v0.6.3): S 23 / M 34 / H 43. */
const SIL_LIVES: Record<Compound, number> = { S: 23, M: 34, H: 43 };
const SIL_DELTAS: Record<Compound, number> = { S: 0, M: 0.71, H: 0.89 };
const PIT = 20.7;

const BAH_LAPS = 57;
/** Real save medians (v0.6.3): S 33 / M 46 / H 59. */
const BAH_LIVES: Record<Compound, number> = { S: 33, M: 46, H: 59 };
const BAH_DELTAS: Record<Compound, number> = { S: 0, M: 0.55, H: 1.05 };

/** Suzuka-shaped case (verified v0.5.1 fixture numbers). */
const SUZ_LAPS = 53;
const SUZ_LIVES: Record<Compound, number> = { S: 25, M: 38, H: 58 };
const SUZ_DELTAS: Record<Compound, number> = { S: 0, M: 1.09, H: 1.76 };

function deg(cH: number): DegConstants {
  return {
    final: { ...DEG_FINAL },
    cliff: { S: DEG_CLIFF.S, M: DEG_CLIFF.M, H: cH },
    cliffThreshold: 0.6,
  };
}

interface Report {
  cH: number;
  silDegH35: number; silPlan17_35: number;
  silBest: string; silBestTime: number; silSH: number;
  bahBest: string; bahPit: number; bahBestTime: number;
  bahSH: number; bahSSM: number;
  suzBestTime: number; suzSH: number;
  ok: boolean; problems: string[];
}

function evaluateCase(cH: number): Report {
  const d = deg(cH);
  const problems: string[] = [];

  /* Silverstone */
  const silDegH35 = stintDegPenaltyWith(d, 'H', 35, SIL_LIVES.H);
  const silS = stintDegPenaltyWith(d, 'S', 17, SIL_LIVES.S);
  const silPlan17_35 = SIL_DELTAS.H * 35 + silS + silDegH35 + PIT;
  const silModel = buildSilverstoneModel();
  const silLab = buildTyreLab(silModel, SILVERSTONE_RACE_ID, { degOverride: d });
  const sil = silLab.data as TyreLab;
  const silBest = sil.best ? sil.best.order.join('→') : '—';
  const silBestTime = sil.best?.timeS ?? NaN;
  /* S→H may fall out of the top 6 — that only means it is even further
     behind; evaluate it directly so the margin check stays meaningful. */
  const silSH = evaluateStrategy(['S', 'H'], SIL_LAPS, SIL_LIVES, SIL_DELTAS, PIT, d)!.timeS;

  if (silDegH35 < 50) problems.push(`S1 degH35=${silDegH35.toFixed(1)} < 50`);
  if (silDegH35 > 90) problems.push(`S1 degH35=${silDegH35.toFixed(1)} > 90`);
  if (silPlan17_35 < 100) problems.push(`S2 plan17/35=${silPlan17_35.toFixed(1)} < 100`);
  if (silBest !== 'S→M→S' && silBest !== 'S→M') problems.push(`S3 best=${silBest}`);
  if (silSH <= silBestTime) problems.push(`S3b S→H ${silSH.toFixed(1)} ≤ best ${silBestTime.toFixed(1)}`);
  if (silSH < silBestTime + 7) problems.push(`S3c S→H margin ${silSH - silBestTime < 0 ? 'negative' : (silSH - silBestTime).toFixed(1)} < 7`);

  /* Bahrain */
  const bahModel = buildBahrainModel();
  const bahLab = buildTyreLab(bahModel, BAHRAIN_RACE_ID, { degOverride: d });
  const bah = bahLab.data as TyreLab;
  const bahBest = bah.best ? bah.best.order.join('→') : '—';
  const bahPit = bah.best?.pitLaps[0] ?? -1;
  const bahBestTime = bah.best?.timeS ?? NaN;
  const bahSH = evaluateStrategy(['S', 'H'], BAH_LAPS, BAH_LIVES, BAH_DELTAS, PIT, d)!.timeS;
  const bahSSM = Math.min(
    ...bah.strategies.filter((s) => ['S→S→M', 'S→M→S'].includes(s.order.join('→'))).map((s) => s.timeS),
  );
  if (bahBest !== 'S→M') problems.push(`B1 best=${bahBest}`);
  if (bahPit !== 24) problems.push(`B1 pit=${bahPit} ≠ 24`);
  if (bahBestTime < 63 || bahBestTime >= 65) problems.push(`B1 time=${bahBestTime.toFixed(1)} ∉ [63, 65)`);
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
    cH,
    silDegH35, silPlan17_35, silBest, silBestTime, silSH,
    bahBest, bahPit, bahBestTime, bahSH, bahSSM,
    suzBestTime: suzBest, suzSH,
    ok: problems.length === 0, problems,
  };
}

function printReport(r: Report): void {
  console.log(
    `cH=${r.cH} | ` +
    `SIL degH35=${r.silDegH35.toFixed(1)} plan17/35=${r.silPlan17_35.toFixed(1)} best=${r.silBest} ${r.silBestTime.toFixed(1)}s (S→H ${r.silSH.toFixed(1)}) | ` +
    `BAH best=${r.bahBest}@${r.bahPit} ${r.bahBestTime.toFixed(1)}s (S→H ${r.bahSH.toFixed(1)}, SSM ${Number.isFinite(r.bahSSM) ? r.bahSSM.toFixed(1) : '—'}) | ` +
    `SUZ best S→S→M ${r.suzBestTime.toFixed(1)} S→H ${r.suzSH.toFixed(1)} | ` +
    (r.ok ? 'OK' : `FAIL: ${r.problems.join('; ')}`),
  );
}

/* shipped constant quick check */
const shipped = evaluateCase(DEG_CLIFF.H);
console.log('SHIPPED CONSTANT:');
printReport(shipped);

if (process.argv.includes('--verify')) {
  if (!shipped.ok) {
    console.error('\nSHIPPED CONSTANT FAILS THE BACKTEST');
    process.exit(1);
  }
  console.log('\nShipped constant satisfies every backtest constraint.');
  process.exit(0);
}

/* 1-D grid search over DEG_CLIFF.H — everything else is frozen (v0.6.3). */
console.log('\nGRID SEARCH (DEG_CLIFF.H only):');
const results: Report[] = [];
for (const cH of [0.2, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.9, 1.0, 1.25, 1.5, 2, 3, 5]) {
  results.push(evaluateCase(cH));
}
const ok = results.filter((r) => r.ok);
/* selection metric: the tightest rival gap — Silverstone S→H margin, Bahrain
   S→H margin, Bahrain 2-stop margin. */
const score = (r: Report): number =>
  Math.min(
    r.silSH - r.silBestTime,
    r.bahSH - r.bahBestTime,
    r.bahSSM - r.bahBestTime,
  );
ok.sort((a, b) => score(a) - score(b));
console.log(`\n${ok.length}/${results.length} constants pass all constraints.`);
console.log('PASSING CONSTANTS (sorted by min rival gap):');
for (const r of ok.reverse()) {
  console.log(
    `  cH=${r.cH} | SIL degH35 ${r.silDegH35.toFixed(1)} best ${r.silBestTime.toFixed(2)} S→H gap ${(r.silSH - r.silBestTime).toFixed(2)} plan17/35 ${r.silPlan17_35.toFixed(1)} | BAH ${r.bahBest}@${r.bahPit} ${r.bahBestTime.toFixed(2)} S→H gap ${(r.bahSH - r.bahBestTime).toFixed(2)} SSM gap ${(r.bahSSM - r.bahBestTime).toFixed(2)} | SUZ SSM ${r.suzBestTime.toFixed(1)} S→H ${r.suzSH.toFixed(1)}`,
  );
}
const failing = results.filter((r) => !r.ok);
if (failing.length > 0) {
  console.log('\nFAILING CONSTANTS:');
  for (const r of failing) {
    console.log(`  cH=${r.cH}: ${r.problems.join('; ')}`);
  }
}
