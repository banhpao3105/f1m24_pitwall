/**
 * Staff detail repository — schema-adaptive (Phase 2).
 *
 * Tables (docs/01 A1): Staff_Contracts, Staff_PerformanceStats,
 * Staff_ContractPatience. DriverCode already handled in drivers.repo.
 *
 * Verified facts from the planning docs:
 *   - `Staff_Contracts.ContractType = 0` = driver contract (docs/01 §4.2).
 *   - `Staff_ContractPatience` carries suitability/opinion/acceptance
 *     threshold (0..1) — lower threshold = easier to sign (docs/03 §5.7).
 */

import type { SqlJsDatabase } from '../sqlite/sqljs-loader';
import {
  readTable,
  buildColumnMap,
  colIndex,
  readNum,
} from './adaptive';
import type {
  StaffContractRow,
  StaffPerformanceRow,
  ContractPatienceRow,
} from '../../domain/types';

const CONTRACTS_TABLE = 'Staff_Contracts';
const PERFORMANCE_TABLE = 'Staff_PerformanceStats';
const PATIENCE_TABLE = 'Staff_ContractPatience';

const CONTRACT_CANDIDATES: Record<string, string[]> = {
  staffId: ['StaffID'],
  teamId: ['TeamID'],
  contractType: ['ContractType'],
  salary: ['Salary', 'WeeklySalary', 'Cost', 'Wage', 'Pay'],
  endDay: ['EndDay', 'ContractEndDay', 'ExpiryDay', 'EndDate', 'End'],
  durationDays: ['Duration', 'DurationDays', 'Length', 'Years'],
  // Phase 3 (Gazette transfers): verified F1M24 columns StartDay/EndSeason.
  startDay: ['StartDay'],
  endSeason: ['EndSeason'],
};

const PERFORMANCE_CANDIDATES: Record<string, string[]> = {
  staffId: ['StaffID'],
  rating: ['Rating', 'OverallRating', 'Overall'],
  morale: ['Morale', 'MoraleLevel'],
};

const PATIENCE_CANDIDATES: Record<string, string[]> = {
  staffId: ['StaffID', 'StaffID_1'],
  // F1M24 (verified 1.11.0): one row per (StaffID, TeamID) — 11 teams.
  teamId: ['TeamID', 'TeamID_1'],
  suitability: ['Suitability', 'SuitabilityRating'],
  opinion: ['Opinion', 'OpinionRating', 'TeamOpinionRating'],
  threshold: ['Threshold', 'ContractAcceptanceThreshold', 'AcceptanceThreshold', 'Patience', 'PatienceThreshold'],
};

export interface RawStaffDetail {
  contracts: StaffContractRow[];
  performance: StaffPerformanceRow[];
  patience: ContractPatienceRow[];
  tablesPresent: { contracts: boolean; performance: boolean; patience: boolean };
}

export function getStaffDetail(db: SqlJsDatabase): RawStaffDetail {
  const con = readTable(db, CONTRACTS_TABLE);
  const cMap = buildColumnMap(con.columns, CONTRACT_CANDIDATES);
  const contracts: StaffContractRow[] = con.present
    ? con.rows.flatMap((row) => {
        const staffId = readNum(row, colIndex(con.columns, cMap.staffId));
        if (staffId == null) return [];
        return [
          {
            staffId,
            teamId: readNum(row, colIndex(con.columns, cMap.teamId)),
            contractType: readNum(row, colIndex(con.columns, cMap.contractType)),
            salary: readNum(row, colIndex(con.columns, cMap.salary)),
            endDay: readNum(row, colIndex(con.columns, cMap.endDay)),
            durationDays: readNum(row, colIndex(con.columns, cMap.durationDays)),
            startDay: readNum(row, colIndex(con.columns, cMap.startDay)),
            endSeason: readNum(row, colIndex(con.columns, cMap.endSeason)),
          },
        ];
      })
    : [];

  const perf = readTable(db, PERFORMANCE_TABLE);
  const pMap = buildColumnMap(perf.columns, PERFORMANCE_CANDIDATES);
  const performance: StaffPerformanceRow[] = perf.present
    ? perf.rows.flatMap((row) => {
        const staffId = readNum(row, colIndex(perf.columns, pMap.staffId));
        if (staffId == null) return [];
        return [
          {
            staffId,
            rating: readNum(row, colIndex(perf.columns, pMap.rating)),
            morale: readNum(row, colIndex(perf.columns, pMap.morale)),
          },
        ];
      })
    : [];

  const pat = readTable(db, PATIENCE_TABLE);
  const aMap = buildColumnMap(pat.columns, PATIENCE_CANDIDATES);
  const patience: ContractPatienceRow[] = pat.present
    ? pat.rows.flatMap((row) => {
        const staffId = readNum(row, colIndex(pat.columns, aMap.staffId));
        if (staffId == null) return [];
        return [
          {
            staffId,
            teamId: readNum(row, colIndex(pat.columns, aMap.teamId)),
            suitability: readNum(row, colIndex(pat.columns, aMap.suitability)),
            opinion: readNum(row, colIndex(pat.columns, aMap.opinion)),
            threshold: readNum(row, colIndex(pat.columns, aMap.threshold)),
          },
        ];
      })
    : [];

  return {
    contracts,
    performance,
    patience,
    tablesPresent: {
      contracts: con.present,
      performance: perf.present,
      patience: pat.present,
    },
  };
}
