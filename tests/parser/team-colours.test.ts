/**
 * Teams_Colours parser test — v0.5.0 Step 3 (team identity).
 * Locks the oracle parity of the colour decode: Colour is an integer,
 * masked to 24 bits and hex-encoded (#rrggbb); the lowest ColourID per
 * team wins; a missing table degrades to an empty map.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import initSqlJs from 'sql.js';
import path from 'node:path';
import { getTeamColours } from '@/parser/repositories/teams.repo';
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

describe('getTeamColours', () => {
  it('decodes integer colours to #rrggbb and prefers the lowest ColourID', () => {
    const db = dbFrom([
      `CREATE TABLE Teams_Colours (TeamID INTEGER, ColourID INTEGER, Colour INTEGER);`,
      // teal-ish 0x2ee6c8 = 3073736
      `INSERT INTO Teams_Colours VALUES (1, 0, 3073736), (1, 1, 16711680), (2, 0, 16744448);`,
    ]);
    const map = getTeamColours(db);
    expect(map.get(1)).toBe('#2ee6c8');
    expect(map.get(2)).toBe('#ff8000'); // 16744448 & 0xFFFFFF = ff8000
  });

  it('handles negative (32-bit signed) colour values via >>>0', () => {
    const db = dbFrom([
      `CREATE TABLE Teams_Colours (TeamID INTEGER, ColourID INTEGER, Colour INTEGER);`,
      // -52480 == 0xFFFF3300 signed → masked 0xff3300
      `INSERT INTO Teams_Colours VALUES (7, 0, -52480);`,
    ]);
    const map = getTeamColours(db);
    expect(map.get(7)).toBe('#ff3300');
  });

  it('returns an empty map when Teams_Colours does not exist', () => {
    const db = dbFrom([`CREATE TABLE Teams (TeamID INTEGER);`]);
    expect(getTeamColours(db).size).toBe(0);
  });
});
