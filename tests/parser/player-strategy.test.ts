/**
 * Save_PlayerStrategyStints parser + gamePlan normalization tests
 * (v0.5.1 P2). The fixture encodes the owner's Suzuka 2027 shape as
 * SYNTHETIC rows (real .sav files are never committed — docs/07):
 * 24 rows = 2 loadouts × 5 candidate strategies (1+2+2+3+4 stints), with
 * the SELECTED plan S→H, pit lap 19, window 16–22 — the plan the game ran
 * at Suzuka and the engine (wrongly) agreed with before v0.5.1.
 */

import { describe, it, expect } from 'vitest';
import { runParsePipeline } from '@/parser/pipeline';
import { buildTyreLab } from '@/engines/tyre.engine';
import { buildGvasSave, FIXTURE_SCHEMA_SQL, locateSqlWasm } from '../helpers/build-gvas';

const DUR = { H: 1.0, M: 0.7845, S: 0.5638 } as const; // verified durability ratios

/** [LoadoutID, StrategyID, StintID, TyreDurability, TyreType, TyreSetID,
 *   PitWindowStart, AverageStartingLap, OptimalPitLap, PitWindowEnd,
 *   StintTyreStrategy, StintStartTyreWear, Selected, CurrentStint] */
function suzukaStrategyRows(): number[][] {
  const rows: number[][] = [];
  const push = (
    loadout: number, strategy: number, stint: number, dur: number,
    tyre: number, wStart: number, avg: number, wEnd: number, selected: number,
  ) => {
    rows.push([
      loadout, strategy, stint, dur, tyre, stint === 0 ? 0 : 6,
      wStart, avg, 0, wEnd, 0, 1, selected, stint === 0 ? 1 : 0,
    ]);
  };
  for (const loadout of [0, 1]) {
    push(loadout, 1, 0, DUR.S, 2, 1, 1, 4, 0); // S-only candidate
    push(loadout, 2, 0, DUR.S, 2, 1, 1, 4, 1); // S→H — SELECTED
    push(loadout, 2, 1, DUR.H, 0, 16, 19, 22, 1); // pit 19, window 16–22
    push(loadout, 3, 0, DUR.M, 1, 1, 1, 4, 0); // M→S
    push(loadout, 3, 1, DUR.S, 2, 29, 32, 35, 0);
    push(loadout, 4, 0, DUR.S, 2, 1, 1, 4, 0); // S→M→S
    push(loadout, 4, 1, DUR.M, 1, 17, 20, 23, 0);
    push(loadout, 4, 2, DUR.S, 2, 34, 37, 40, 0);
    push(loadout, 5, 0, DUR.S, 2, 1, 1, 4, 0); // S→M→S→M
    push(loadout, 5, 1, DUR.M, 1, 17, 20, 23, 0);
    push(loadout, 5, 2, DUR.S, 2, 34, 37, 40, 0);
    push(loadout, 5, 3, DUR.M, 1, 46, 49, 52, 0);
  }
  return rows;
}

const STRATEGY_SQL = [
  `CREATE TABLE "Save_PlayerStrategyStints" ("LoadoutID" INTEGER, "StrategyID" INTEGER, "StintID" INTEGER, "TyreDurability" REAL, "TyreType" INTEGER, "TyreSetID" INTEGER, "PitWindowStart" INTEGER, "AverageStartingLap" INTEGER, "OptimalPitLap" INTEGER, "PitWindowEnd" INTEGER, "StintTyreStrategy" INTEGER, "StintStartTyreWear" REAL, "Selected" INTEGER, "CurrentStint" INTEGER)`,
  ...suzukaStrategyRows().map((r) => `INSERT INTO Save_PlayerStrategyStints VALUES (${r.join(', ')})`),
];

async function parse(sql: string[]) {
  const { bytes } = await buildGvasSave({ sql });
  return runParsePipeline(bytes, {
    fileName: 'fixture.sav',
    fileSizeBytes: bytes.length,
    saveId: 'test-strategy',
    locateFile: locateSqlWasm,
  });
}

describe('Save_PlayerStrategyStints → playerStrategy (v0.5.1 P2)', () => {
  it('normalizes exactly 24 rows into per-loadout strategy candidates', async () => {
    expect(suzukaStrategyRows()).toHaveLength(24);
    const { model } = await parse([...FIXTURE_SCHEMA_SQL, ...STRATEGY_SQL]);
    expect(model.playerStrategy.tablePresent).toBe(true);
    expect(model.playerStrategy.plans).toHaveLength(10); // 5 strategies × 2 loadouts
    const selected = model.playerStrategy.plans.filter((p) => p.selected);
    expect(selected).toHaveLength(2); // one per loadout
    for (const plan of selected) {
      expect(plan.stints.map((s) => s.compound)).toEqual(['S', 'H']);
      expect(plan.stints[1]!.expectedPitLap).toBe(19);
      expect(plan.stints[1]!.pitWindowStart).toBe(16);
      expect(plan.stints[1]!.pitWindowEnd).toBe(22);
    }
  });

  it('attaches the selected plan as gamePlan to the ACTIVE weekend only', async () => {
    const { model } = await parse([...FIXTURE_SCHEMA_SQL, ...STRATEGY_SQL]);
    // Fixture races: 1 = Bahrain (completed), 2 = Imola day 24 (upcoming,
    // 63 laps) — the game plan belongs to race 2, the current weekend.
    const upcoming = buildTyreLab(model, 2);
    expect(upcoming.data.gamePlan).not.toBeNull();
    expect(upcoming.data.gamePlan!.compounds).toEqual(['S', 'H']);
    expect(upcoming.data.gamePlan!.pitLaps).toEqual([19]);
    expect(upcoming.data.gamePlan!.stintLaps).toEqual([18, 45]); // 63-lap race
    expect(upcoming.data.gamePlan!.pitWindows).toEqual([{ start: 16, end: 22 }]);
    expect(upcoming.data.gamePlan!.loadoutsAgree).toBe(true);

    const completed = buildTyreLab(model, 1);
    expect(completed.data.gamePlan).toBeNull();
  });

  it('stays null when the table is missing or empty (pre-quali / post-race)', async () => {
    const { model } = await parse(FIXTURE_SCHEMA_SQL);
    expect(model.playerStrategy.tablePresent).toBe(false);
    expect(model.playerStrategy.plans).toHaveLength(0);
    expect(buildTyreLab(model, 2).data.gamePlan).toBeNull();
  });
});
