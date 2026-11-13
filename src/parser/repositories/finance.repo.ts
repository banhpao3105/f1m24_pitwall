/**
 * Finance repository — schema-adaptive (Phase 2).
 *
 * Tables (docs/01 A1): Finance_TeamBalance, Finance_Transactions.
 * No column for either table has been introspected yet — all candidates.
 * Amounts stay in game units (model contract: money = number, format at UI).
 */

import type { SqlJsDatabase } from '../sqlite/sqljs-loader';
import {
  readTable,
  buildColumnMap,
  colIndex,
  readNum,
  readStr,
  pkCandidates,
} from './adaptive';
import type { FinanceTransactionRow } from '../../domain/types';

const BALANCE_TABLE = 'Finance_TeamBalance';
const TRANSACTIONS_TABLE = 'Finance_Transactions';

const BALANCE_CANDIDATES: Record<string, string[]> = {
  teamId: ['TeamID'],
  day: ['Day', 'BalanceDay'],
  balance: ['Balance', 'Amount', 'Value', 'Credits', 'CurrentBalance', 'Money'],
  budget: ['Budget', 'SeasonBudget', 'BudgetCap', 'CostCap'],
};

const TX_CANDIDATES: Record<string, string[]> = {
  txId: pkCandidates(TRANSACTIONS_TABLE),
  teamId: ['TeamID'],
  day: ['Day', 'TransactionDay', 'Date'],
  amount: ['Amount', 'Value', 'Cost', 'Money', 'Delta'],
  category: ['TransactionType', 'Category', 'Type', 'Reason'],
  note: ['Description', 'Note', 'Details', 'Label'],
};

export interface RawFinance {
  /** Latest balance row per team (highest Day) — player's row picked by caller. */
  latestBalance: { teamId: number; day?: number; balance?: number; budget?: number }[];
  transactions: FinanceTransactionRow[];
  tablesPresent: { balance: boolean; transactions: boolean };
}

export function getFinanceSnapshot(db: SqlJsDatabase): RawFinance {
  const bal = readTable(db, BALANCE_TABLE);
  const bMap = buildColumnMap(bal.columns, BALANCE_CANDIDATES);
  const perTeam = new Map<
    number,
    { teamId: number; day?: number; balance?: number; budget?: number }
  >();
  if (bal.present && bMap.teamId) {
    const tIdx = colIndex(bal.columns, bMap.teamId);
    const dIdx = colIndex(bal.columns, bMap.day);
    const bIdx = colIndex(bal.columns, bMap.balance);
    const gIdx = colIndex(bal.columns, bMap.budget);
    for (const row of bal.rows) {
      const teamId = readNum(row, tIdx);
      if (teamId == null) continue;
      const day = readNum(row, dIdx);
      const cur = perTeam.get(teamId);
      // Latest row per team wins (largest Day; ties keep the last seen).
      if (!cur || (day != null && (cur.day == null || day >= cur.day))) {
        perTeam.set(teamId, {
          teamId,
          day,
          balance: readNum(row, bIdx),
          budget: readNum(row, gIdx),
        });
      }
    }
  }

  const tx = readTable(db, TRANSACTIONS_TABLE);
  const tMap = buildColumnMap(tx.columns, TX_CANDIDATES);
  const transactions: FinanceTransactionRow[] = tx.present
    ? tx.rows.flatMap((row) => {
        const idIdx = colIndex(tx.columns, tMap.txId);
        const txId = readNum(row, idIdx);
        if (txId == null) return [];
        return [
          {
            txId,
            teamId: readNum(row, colIndex(tx.columns, tMap.teamId)),
            day: readNum(row, colIndex(tx.columns, tMap.day)),
            amount: readNum(row, colIndex(tx.columns, tMap.amount)),
            category: tMap.category
              ? readStr(row, colIndex(tx.columns, tMap.category))
              : undefined,
            note: tMap.note ? readStr(row, colIndex(tx.columns, tMap.note)) : undefined,
          },
        ];
      })
    : [];

  return {
    latestBalance: [...perTeam.values()],
    transactions,
    tablesPresent: { balance: bal.present, transactions: tx.present },
  };
}
