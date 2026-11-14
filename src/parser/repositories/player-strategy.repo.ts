/**
 * Save_PlayerStrategyStints repository — the game's own strategist plan
 * (v0.5.1 P2, owner prompt: normalize instead of the Phase 1 null stub).
 *
 * Verified columns (F1M 24 1.11.0, real save):
 *   LoadoutID (0/1 = two cars), StrategyID, StintID, TyreDurability,
 *   TyreType (0=H / 1=M / 2=S — confirmed via TyreDurability H=1.0,
 *   M=0.7845, S=0.5638), TyreSetID, PitWindowStart, AverageStartingLap,
 *   OptimalPitLap, PitWindowEnd, StintTyreStrategy, StintStartTyreWear,
 *   Selected, CurrentStint.
 *
 * Behaviour on real saves: 0 rows before qualifying and after the race;
 * rows only for the CURRENT weekend (the table has no race reference).
 * UNVERIFIED: which driver a LoadoutID maps to (both cars shared one plan
 * on the verified save, so it cannot be derived) — plans are therefore
 * reported per loadout and displayed at TEAM level downstream.
 *
 * Column access is soft (missing columns → null) so older schemas degrade
 * instead of failing the parse (docs/01 §4.1 rule 4).
 */

import type { SqlJsDatabase } from '../sqlite/sqljs-loader';
import { hasTable, tableColumns } from '../schema';

export interface RawStrategyStintRow {
  loadoutId: number;
  strategyId: number;
  stintId: number;
  tyreType: number;
  pitWindowStart?: number;
  pitWindowEnd?: number;
  optimalPitLap?: number;
  averageStartingLap?: number;
  selected?: number;
}

export interface RawStrategyTable {
  tablePresent: boolean;
  rows: RawStrategyStintRow[];
}

function num(row: unknown[], idx: number | null): number | undefined {
  if (idx == null) return undefined;
  const v = row[idx];
  return v == null ? undefined : Number(v);
}

export function getPlayerStrategyStints(db: SqlJsDatabase): RawStrategyTable {
  if (!hasTable(db, 'Save_PlayerStrategyStints')) {
    return { tablePresent: false, rows: [] };
  }
  const cols = new Set(tableColumns(db, 'Save_PlayerStrategyStints'));
  // Mandatory block (verified on 1.11.0) — hard-selected.
  const soft = (column: string): string | null =>
    cols.size === 0 || cols.has(column) ? column : null;
  const sStart = soft('PitWindowStart');
  const sEnd = soft('PitWindowEnd');
  const sOpt = soft('OptimalPitLap');
  const sAvg = soft('AverageStartingLap');
  const sSel = soft('Selected');

  const selectList = [
    'LoadoutID', // 0
    'StrategyID', // 1
    'StintID', // 2
    'TyreType', // 3
    sStart, // 4
    sEnd, // 5
    sOpt, // 6
    sAvg, // 7
    sSel, // 8
  ];
  const res = db.exec(
    `SELECT ${selectList.join(', ')} FROM Save_PlayerStrategyStints ORDER BY LoadoutID, StrategyID, StintID`,
  );
  const rows: RawStrategyStintRow[] = [];
  for (const row of res[0]?.values ?? []) {
    rows.push({
      loadoutId: Number(row[0]),
      strategyId: Number(row[1]),
      stintId: Number(row[2]),
      tyreType: Number(row[3]),
      pitWindowStart: num(row, sStart != null ? 4 : null),
      pitWindowEnd: num(row, sEnd != null ? 5 : null),
      optimalPitLap: num(row, sOpt != null ? 6 : null),
      averageStartingLap: num(row, sAvg != null ? 7 : null),
      selected: num(row, sSel != null ? 8 : null),
    });
  }
  return { tablePresent: true, rows };
}
