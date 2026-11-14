/**
 * Drivers repository — verified columns (F1M 24):
 *   Staff_BasicData: StaffID, FirstName, LastName
 *   Staff_DriverData: StaffID, DriverCode
 *   Staff_Contracts: StaffID, ContractType, TeamID, StartDay
 * ContractType = 0 → driver contract (docs/01-AUDIT-DATA.md §4.2).
 */

import type { SqlJsDatabase } from '../sqlite/sqljs-loader';

export interface RawDriver {
  staffId: number;
  firstName: string;
  lastName: string;
  code?: string;
  /** Team from the most recent driver contract (ContractType=0). */
  contractTeamId?: number;
}

export function getDrivers(db: SqlJsDatabase): RawDriver[] {
  const hasDriverData = hasTable(db, 'Staff_DriverData');
  const rows = db.exec(`
    SELECT s.StaffID, s.FirstName, s.LastName
           ${hasDriverData ? ', dd.DriverCode' : ', NULL'}
    FROM Staff_BasicData s
    ${hasDriverData ? 'JOIN Staff_DriverData dd ON dd.StaffID = s.StaffID' : ''}
    ORDER BY s.StaffID
  `);
  if (rows.length === 0) return [];

  const contracts = new Map<number, number>();
  try {
    const cRows = db.exec(`
      SELECT StaffID, TeamID, StartDay
      FROM Staff_Contracts
      WHERE ContractType = 0
      ORDER BY StartDay
    `);
    for (const row of cRows[0]?.values ?? []) {
      contracts.set(Number(row[0]), Number(row[1] ?? 0)); // later StartDay overwrites
    }
  } catch {
    // Staff_Contracts optional — degrade to results-based team mapping
  }

  return rows[0].values.map((row) => ({
    staffId: Number(row[0] ?? 0),
    firstName: String(row[1] ?? ''),
    lastName: String(row[2] ?? ''),
    code: cleanDriverCode(row[3]),
    contractTeamId: contracts.get(Number(row[0] ?? 0)),
  }));
}

/**
 * v0.5.0: real saves store DriverCode as a localization key —
 * "[DriverCode_Ver]" — while user-created drivers carry plain text ("VER").
 * Decode mirrors cleanStaffName: strip the brackets + the DriverCode_
 * prefix and keep the readable tail. Plain codes pass through untouched.
 */
export function cleanDriverCode(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  const token = String(raw).trim();
  if (token.length === 0) return undefined;
  const m = token.match(/^\[([^\]]+)\]$/);
  if (!m) return token; // plain code ("VER") — already displayable
  const key = m[1];
  /* 0.5.3: string-literal shape ("[STRING_LITERAL:Value=|LLO|]", real save
   * staffId 600+) — the DriverCode_ fallback below would otherwise keep
   * the whole key as garbage. The captured value is the literal code. */
  const literal = key.match(/^STRING_LITERAL:Value=\|(.+)\|$/);
  if (literal) return literal[1].trim();
  const tail = key.startsWith('DriverCode_') ? key.slice('DriverCode_'.length) : key;
  const decoded = tail.replace(/\d+$/, ''); // "Mini1" → "Mini" (oracle parity)
  return decoded.length > 0 ? decoded : undefined;
}

function hasTable(db: SqlJsDatabase, table: string): boolean {
  const res = db.exec(
    "SELECT count(*) FROM sqlite_master WHERE type IN ('table','view') AND name = ?",
    [table],
  );
  return Number(res[0]?.values[0]?.[0] ?? 0) > 0;
}
