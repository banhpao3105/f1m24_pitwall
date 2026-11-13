/**
 * Staff repository — verified columns (F1M 24):
 *   Staff_BasicData: StaffID, FirstName, LastName, CountryID
 * Drivers identified via Staff_GameData linkage comes in Phase 1+; Phase 0
 * only needs counts/names for metadata display.
 */

import type { SqlJsDatabase } from '../sqlite/sqljs-loader';

export interface RawStaff {
  staffId: number;
  firstName: string;
  lastName: string;
  countryId?: number;
}

export function getStaff(db: SqlJsDatabase, limit = 5000): RawStaff[] {
  const rows = db.exec(
    `SELECT StaffID, FirstName, LastName, CountryID FROM Staff_BasicData LIMIT ${Math.max(1, Math.floor(limit))}`,
  );
  if (rows.length === 0) return [];
  return rows[0].values.map((row) => ({
    staffId: Number(row[0] ?? 0),
    firstName: String(row[1] ?? ''),
    lastName: String(row[2] ?? ''),
    countryId: row[3] == null ? undefined : Number(row[3]),
  }));
}

export function getStaffCount(db: SqlJsDatabase): number {
  const rows = db.exec('SELECT COUNT(*) FROM Staff_BasicData');
  return Number(rows[0]?.values[0]?.[0] ?? 0);
}
