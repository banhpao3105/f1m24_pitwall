/**
 * v0.8.0 parser fix — Parts_CarLoadout maps the REAL F1M24 columns.
 *
 * Bug (found while researching the aero strength feature): the repo keyed
 * `LOADOUT_CANDIDATES.carId = ['CarID']`, but the real table is
 * (TeamID, LoadoutID, PartType, DesignID, ItemID) — there is NO CarID
 * column, so EVERY row was dropped and `model.parts.loadouts` was always
 * empty on real saves (no code consumed it, so nothing noticed).
 *
 * Locked here against the verified 1.11.0 schema:
 *   - all 5 columns map; rows survive (198 on the real save — row count is
 *     asserted live by scripts/audit-carstrength-v080.ts),
 *   - NULL DesignID rows are KEPT (the engine's 'latest' fallback needs
 *     them — dropping would silently turn fallback teams 'unknown'),
 *   - numeric PartStat resolves through Parts_Enum_Stats (the old code
 *     labelled every stat "stat-1", erasing stat identity),
 *   - DayCompleted maps (the fallback filter needs it),
 *   - the old guessed schema (CarID/SlotType) now degrades to no rows —
 *     honestly empty, never fabricated.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import initSqlJs from 'sql.js';
import path from 'node:path';
import { getPartsSnapshot } from '@/parser/repositories/parts.repo';
import type { SqlJsDatabase } from '@/parser/sqlite/sqljs-loader';

const WASM = path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
let SQL: Awaited<ReturnType<typeof initSqlJs>>;

beforeAll(async () => {
  SQL = await initSqlJs({ locateFile: () => WASM });
});

function dbFrom(statements: string[]): SqlJsDatabase {
  const db = new SQL.Database();
  for (const s of statements) db.exec(s);
  return db;
}

const REAL_LOADOUT_SCHEMA =
  'CREATE TABLE Parts_CarLoadout (TeamID INTEGER, LoadoutID INTEGER, PartType INTEGER, DesignID INTEGER, ItemID INTEGER);';

describe('Parts_CarLoadout — the real F1M24 schema (v0.8.0)', () => {
  it('maps TeamID/LoadoutID/PartType/DesignID/ItemID and keeps NULL DesignID rows', () => {
    const db = dbFrom([
      REAL_LOADOUT_SCHEMA,
      `CREATE TABLE Parts_Enum_Type (Value INTEGER, Name TEXT);`,
      `INSERT INTO Parts_Enum_Type VALUES (3, 'Body'), (4, 'FrontWing'), (5, 'RearWing');`,
      // player rows (installed) + one AI row with a NULL DesignID (fallback)
      `INSERT INTO Parts_CarLoadout VALUES (32, 1, 3, 724, 2901);`,
      `INSERT INTO Parts_CarLoadout VALUES (32, 2, 3, 724, 2902);`,
      `INSERT INTO Parts_CarLoadout VALUES (3, 1, 4, NULL, 2881);`,
      `INSERT INTO Parts_CarLoadout VALUES (6, 1, 5, NULL, NULL);`,
    ]);
    const snap = getPartsSnapshot(db);
    expect(snap.tablesPresent.loadouts).toBe(true);
    expect(snap.loadouts).toHaveLength(4);
    expect(snap.loadouts[0]).toEqual({ teamId: 32, loadoutId: 1, partType: 'Body', designId: 724, itemId: 2901 });
    expect(snap.loadouts[1]).toEqual({ teamId: 32, loadoutId: 2, partType: 'Body', designId: 724, itemId: 2902 });
    expect(snap.loadouts[2]).toEqual({ teamId: 3, loadoutId: 1, partType: 'FrontWing', designId: undefined, itemId: 2881 });
    expect(snap.loadouts[3]).toEqual({ teamId: 6, loadoutId: 1, partType: 'RearWing', designId: undefined, itemId: undefined });
  });

  it('the old guessed schema (CarID/SlotType) degrades to NO rows — never fabricated', () => {
    const db = dbFrom([
      `CREATE TABLE Parts_CarLoadout (CarID INTEGER, Parts_ItemsID INTEGER, SlotType TEXT);`,
      `INSERT INTO Parts_CarLoadout VALUES (2, 5, 'FrontWing');`,
    ]);
    const snap = getPartsSnapshot(db);
    expect(snap.tablesPresent.loadouts).toBe(true);
    expect(snap.loadouts).toEqual([]);
  });
});

describe('Parts_Designs_StatValues — PartStat identity (v0.8.0)', () => {
  it('resolves numeric PartStat through Parts_Enum_Stats (old code said "stat-1")', () => {
    const db = dbFrom([
      `CREATE TABLE Parts_Designs (DesignID INTEGER, TeamID INTEGER, PartType INTEGER, DayCompleted INTEGER);`,
      `INSERT INTO Parts_Designs VALUES (722, 32, 4, 46100);`,
      `CREATE TABLE Parts_Designs_StatValues (DesignID INTEGER, PartStat INTEGER, Value REAL, UnitValue REAL, DesignFocus INTEGER, ExpertiseGain REAL, ExpertiseEffect REAL);`,
      // the real column set, numeric PartStat — AirFlowFront(0), AirFlowTolerance(1)
      `INSERT INTO Parts_Designs_StatValues VALUES (722, 0, 808.8837, 0, 0, 0, 0);`,
      `INSERT INTO Parts_Designs_StatValues VALUES (722, 1, 441.944, 0, 0, 0, 0);`,
      `CREATE TABLE Parts_Enum_Stats (Value INTEGER, Name TEXT);`,
      `INSERT INTO Parts_Enum_Stats VALUES (0, 'AirFlowFront'), (1, 'AirFlowTolerance'), (13, 'AirFlowMiddle');`,
    ]);
    const snap = getPartsSnapshot(db);
    expect(snap.designs[0].dayCompleted).toBe(46100);
    expect(snap.designs[0].stats).toEqual([
      { name: 'AirFlowFront', value: 808.8837 },
      { name: 'AirFlowTolerance', value: 441.944 },
    ]);
  });

  it('unmapped PartStat values get an honest placeholder, not a silent guess', () => {
    const db = dbFrom([
      `CREATE TABLE Parts_Designs (DesignID INTEGER, TeamID INTEGER, PartType INTEGER);`,
      `INSERT INTO Parts_Designs VALUES (1, 3, 7);`,
      `CREATE TABLE Parts_Designs_StatValues (DesignID INTEGER, PartStat INTEGER, Value REAL);`,
      `INSERT INTO Parts_Designs_StatValues VALUES (1, 99, 12.5);`,
    ]);
    const snap = getPartsSnapshot(db);
    expect(snap.designs[0].stats).toEqual([{ name: 'PartStat 99', value: 12.5 }]);
  });

  it('textual stat columns still map (older candidates keep working)', () => {
    const db = dbFrom([
      `CREATE TABLE Parts_Designs (DesignID INTEGER, TeamID INTEGER);`,
      `INSERT INTO Parts_Designs VALUES (5, 1);`,
      `CREATE TABLE Parts_Designs_StatValues (DesignID INTEGER, Stat TEXT, Value REAL);`,
      `INSERT INTO Parts_Designs_StatValues VALUES (5, 'Airflow', 78.5);`,
    ]);
    const snap = getPartsSnapshot(db);
    expect(snap.designs[0].stats).toEqual([{ name: 'Airflow', value: 78.5 }]);
  });
});
