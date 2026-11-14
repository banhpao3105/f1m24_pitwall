/**
 * Schema detection — Phase 0 (docs/01-AUDIT-DATA.md §4.3, §A1).
 *
 * Core tables are mandatory: without them the save cannot serve the Pit Wall
 * and we fail with MISSING_CORE_TABLES listing what is absent.
 * Optional tables degrade to confidence LOW fallbacks, never crashes.
 *
 * The A1 inventory (docs/01-AUDIT-DATA.md) was verified against a real
 * F1M 24 save (build volta24+game+1.11.0): all core tables present,
 * 324 tables total.
 */

import type { SqlJsDatabase } from './sqlite/sqljs-loader';

export const CORE_TABLES = [
  'Races',
  'Races_Tracks',
  'Races_Results',
  'Teams',
  'Staff_BasicData',
  'Player',
  'Player_State',
] as const;

/**
 * Optional tables the v1 product uses (docs/01-AUDIT-DATA.md §4.3).
 * Missing groups must be reported via SaveMeta.tablesMissing.
 */
export const OPTIONAL_TABLES = [
  'Races_QualifyingResults',
  'Races_SprintResults',
  'Races_PitStopResults',
  'Races_PitStopTimings',
  'Races_PracticeResults',
  'Races_DriverStandings',
  'Races_TeamStandings',
  'Save_CarTyreAllocation',
  'Save_PlayerStrategyStints',
  'Staff_PerformanceStats',
  'Staff_DriverData',
  'Staff_Contracts',
  'Staff_ContractPatience',
  'Teams_Colours',
  'Countries',
  'Parts_TeamExpertise',
  'Parts_Designs',
  'Parts_Items',
  'Parts_CarLoadout',
  'Regulations_Proposals',
  'Finance_Transactions',
  'Finance_TeamBalance',
  'Seasons',
  'Board_SeasonObjectives',
  'Board_Confidence',
] as const;

export interface SchemaInfo {
  tablesPresent: string[];
  tablesMissingCore: string[];
  tablesMissingOptional: string[];
  tableColumns: Record<string, string[]>;
}

export function listTables(db: SqlJsDatabase): string[] {
  const res = db.exec(
    "SELECT name FROM sqlite_master WHERE type IN ('table','view') ORDER BY name",
  );
  if (res.length === 0) return [];
  return res[0].values.map((row) => String(row[0]));
}

export function hasTable(db: SqlJsDatabase, table: string): boolean {
  const res = db.exec(
    "SELECT count(*) FROM sqlite_master WHERE type IN ('table','view') AND name = ?",
    [table],
  );
  const first = res[0]?.values[0]?.[0];
  return Number(first ?? 0) > 0;
}

/**
 * Column discovery without PRAGMA (PRAGMA table_info proved unreliable on
 * the embedded DB in tooling): parse the CREATE TABLE statement from
 * sqlite_master. Falls back to PRAGMA when the SQL text is unavailable.
 */
export function tableColumns(db: SqlJsDatabase, table: string): string[] {
  const sqlRes = db.exec(
    "SELECT sql FROM sqlite_master WHERE type IN ('table','view') AND name = ?",
    [table],
  );
  const sqlText = sqlRes[0]?.values[0]?.[0];
  if (typeof sqlText === 'string' && sqlText.length > 0) {
    const parsed = parseCreateTableColumns(sqlText);
    if (parsed.length > 0) return parsed;
  }
  try {
    const pragma = db.exec(`PRAGMA table_info(${quoteIdent(table)})`);
    if (pragma.length > 0) {
      return pragma[0].values.map((row) => String(row[1]));
    }
  } catch {
    // fallthrough
  }
  return [];
}

export function detectSchema(db: SqlJsDatabase): SchemaInfo {
  const present = new Set(listTables(db));
  const missingCore = CORE_TABLES.filter((t) => !present.has(t));
  const missingOptional = OPTIONAL_TABLES.filter((t) => !present.has(t));
  const tableColumns: Record<string, string[]> = {};
  for (const t of CORE_TABLES) {
    if (present.has(t)) tableColumns[t] = tableColumnsOf(db, t);
  }
  return {
    tablesPresent: Array.from(present),
    tablesMissingCore: [...missingCore],
    tablesMissingOptional: [...missingOptional],
    tableColumns,
  };
}

function tableColumnsOf(db: SqlJsDatabase, table: string): string[] {
  return tableColumns(db, table);
}

function parseCreateTableColumns(sql: string): string[] {
  const open = sql.indexOf('(');
  const close = sql.lastIndexOf(')');
  if (open < 0 || close <= open) return [];
  const body = sql.slice(open + 1, close);
  const columns: string[] = [];
  let depth = 0;
  let token = '';
  const flush = () => {
    const t = token.trim().replace(/^["`[\]]+|["`[\]]+$/g, '');
    if (t.length > 0) {
      const first = t.split(/\s+/)[0];
      const upper = first.toUpperCase();
      if (
        upper !== 'PRIMARY' &&
        upper !== 'UNIQUE' &&
        upper !== 'CHECK' &&
        upper !== 'FOREIGN' &&
        upper !== 'CONSTRAINT'
      ) {
        columns.push(first.replace(/^["`[\]]+|["`[\]]+$/g, ''));
      }
    }
    token = '';
  };
  for (const ch of body) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      flush();
    } else {
      token += ch;
    }
  }
  flush();
  return columns;
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}
