/**
 * audit-inventory-v072 — v0.7.2 verification leg on a real save.
 *
 * Prints the per-car tyre aggregates (InventoryCar.aggregate), the team
 * aggregate and the caps straight from the engine, so the live UI cards
 * (?view=tyres) can be compared against the engine output on the SAME
 * save. Monza DoD numbers themselves are locked by the vitest suite
 * (the save4.sav is not in this sandbox; upload/save1.sav is a live
 * pre-race weekend).
 *
 * Usage: bun scripts/audit-inventory-v072.ts <path-to.sav>
 */
import { readFileSync } from 'node:fs';
import { runParsePipeline } from '../src/parser/pipeline';
import { assessReadiness, buildTyreInventory } from '../src/engines/grid.engine';
import { buildTyreLab } from '../src/engines/tyre.engine';

const SQL_WASM = '/home/z/my-project/node_modules/sql.js/dist/sql-wasm.wasm';

const fmtAgg = (a: {
  compound: string; fresh: number; freshLife: number | null;
  used: number; usedWear: [number, number] | null; usedLife: [number, number] | null;
}): string => {
  const span = (r: [number, number] | null, s = '') =>
    r ? (Math.round(r[0]) === Math.round(r[1]) ? `${Math.round(r[0])}${s}` : `${Math.round(r[0])}–${Math.round(r[1])}${s}`) : '—';
  return `${a.compound}: mới ×${a.fresh} (đời ${a.freshLife ?? '—'}) · đã dùng ×${a.used} (mòn ${span(a.usedWear ? [a.usedWear[0] * 100, a.usedWear[1] * 100] : null, '%')}, đời ${span(a.usedLife)})`;
};

async function main() {
  const path = process.argv[2] ?? 'upload/save1.sav';
  const raw = readFileSync(path);
  const { model } = await runParsePipeline(new Uint8Array(raw), {
    fileName: path.split('/').pop() ?? path,
    fileSizeBytes: raw.length,
    saveId: 'audit-v072',
    locateFile: () => SQL_WASM,
  });

  const race =
    model.races
      .filter((r) => r.seasonId === model.meta.seasonId && r.state !== 2)
      .sort((a, b) => a.day - b.day)[0] ?? null;
  if (!race) { console.log('no upcoming race'); return; }

  const readiness = assessReadiness(model, race.raceId);
  const lab = buildTyreLab(model, race.raceId);
  const inventory = lab.data.inventory ?? buildTyreInventory(model, lab.data.lives, race.raceId);
  console.log(`save: ${path} — day ${model.meta.day}, race ${race.raceId} ${race.trackName} (state ${race.state}), laps ${race.laps}`);
  console.log(`carTeamsVerified: ${model.gridPenalties?.carTeamsVerified ?? 'n/a'} · readiness.ready: ${readiness.ready}`);
  if (!inventory) { console.log('inventory: null'); return; }

  console.log(`cap maxStint: S ${inventory.maxStint.S} / M ${inventory.maxStint.M} / H ${inventory.maxStint.H} (perCar: ${inventory.perCar})`);
  console.log('');
  for (const car of inventory.cars) {
    console.log(`${car.label} (CarID ${car.carId}, seatVerified ${car.seatVerified}):`);
    for (const a of car.aggregate.filter((x) => ['S', 'M', 'H'].includes(x.compound))) {
      console.log('  ' + fmtAgg(a));
    }
  }
  console.log('Cả đội (teamAggregate):');
  for (const a of inventory.teamAggregate.filter((x) => ['S', 'M', 'H'].includes(x.compound))) {
    console.log('  ' + fmtAgg(a));
  }
}

void main();
