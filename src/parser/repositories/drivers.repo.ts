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
    code: row[3] == null || String(row[3]).length === 0 ? undefined : String(row[3]),
    contractTeamId: contracts.get(Number(row[0] ?? 0)),
  }));
}

function hasTable(db: SqlJsDatabase, table: string): boolean {
  const res = db.exec(
    "SELECT count(*) FROM sqlite_master WHERE type IN ('table','view') AND name = ?",
    [table],
  );
  return Number(res[0]?.values[0]?.[0] ?? 0) > 0;
}
