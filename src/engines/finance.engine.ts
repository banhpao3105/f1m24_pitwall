/**
 * Finance Engine v1 — Phase 2 (docs/03-ANALYTICS-ENGINES.md §5.6).
 *
 * Question: "Tiền đi đâu? Chi gì sinh điểm? Bank expertise hay chi ngay?"
 *
 * Data reality: Finance_* + Parts_TeamExpertise columns are CANDIDATE-level
 * (adaptive repos). Everything the engine reports is gated on what mapped;
 * unmapped → explicit LOW degradation.
 *
 * Formulas (documented):
 *   - Spend = Σ negative amounts (player team). Positive = income.
 *   - costPerPoint = totalSpend / championship points (team standings).
 *   - Expertise bank = Σ NextSeasonExpertise per team (verified column name
 *     from the old tool, docs/01 §2.1) — ranked across teams.
 *
 * Pure function over the SaveModel — no React, no DB, no fetch.
 */

import type { Confidence, Evidence, Assumption, Recommendation } from '../domain/provenance';
import type { EngineResult } from '../domain/types';
import type { SaveModel } from '../domain/types';

export interface SpendRow {
  category: string;
  /** Negative = net spend, positive = net income (game units). */
  total: number;
  /** Share of absolute spend across categories (0..1) or null. */
  share: number | null;
}

export interface ExpertiseBankRow {
  teamId: number;
  teamName: string;
  /** Σ NextSeasonExpertise across part types (game units). */
  nextSeason: number;
  current: number | null;
  rank: number;
  isPlayer: boolean;
}

export interface FinanceBoard {
  balance: number | null;
  budget: number | null;
  spendByCategory: SpendRow[];
  totalSpend: number | null;
  totalIncome: number | null;
  costPerPoint: number | null;
  expertise: {
    rows: ExpertiseBankRow[];
    playerRank: number | null;
    playerNext: number | null;
    leagueMedianNext: number | null;
  };
  hasBalance: boolean;
  hasTransactions: boolean;
  hasExpertiseData: boolean;
}

export function computeExpertiseBank(model: SaveModel): ExpertiseBankRow[] {
  const byTeam = new Map<number, { next: number; current: number | null }>();
  for (const row of model.parts.expertise) {
    const entry = byTeam.get(row.teamId) ?? { next: 0, current: null };
    if (row.nextSeasonExpertise != null) entry.next += row.nextSeasonExpertise;
    if (row.expertise != null) {
      entry.current = (entry.current ?? 0) + row.expertise;
    }
    byTeam.set(row.teamId, entry);
  }
  const teamName = (id: number): string =>
    model.teams.find((t) => t.teamId === id)?.teamName ?? `Team ${id}`;
  const rows = [...byTeam.entries()].map(([teamId, v]) => ({
    teamId,
    teamName: teamName(teamId),
    nextSeason: Math.round(v.next * 100) / 100,
    current: v.current != null ? Math.round(v.current * 100) / 100 : null,
    rank: 0,
    isPlayer: teamId === model.player.teamId,
  }));
  rows.sort((a, b) => b.nextSeason - a.nextSeason);
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });
  return rows;
}

export function buildFinance(model: SaveModel): EngineResult<FinanceBoard> {
  const playerTeamId = model.player.teamId;
  const playerPoints =
    model.standings.teams.find((t) => t.id === playerTeamId)?.points ?? null;

  const hasBalance = model.finance.tablesPresent.balance && model.finance.balance != null;
  const hasTransactions =
    model.finance.tablesPresent.transactions && model.finance.transactions.length > 0;

  /* spend by category (player team, negative amounts = spend) */
  const spendByCategory: SpendRow[] = [];
  let totalSpend: number | null = null;
  let totalIncome: number | null = null;
  if (hasTransactions) {
    const txs = model.finance.transactions.filter((t) => t.teamId === playerTeamId);
    const byCat = new Map<string, number>();
    for (const t of txs) {
      if (t.amount == null) continue;
      const cat = t.category ?? 'unknown';
      byCat.set(cat, (byCat.get(cat) ?? 0) + t.amount);
    }
    const absTotal =
      [...byCat.values()].reduce((s, v) => s + Math.abs(v), 0) || 1;
    for (const [category, total] of byCat) {
      spendByCategory.push({
        category,
        total,
        share: Math.round((Math.abs(total) / absTotal) * 100) / 100,
      });
    }
    spendByCategory.sort((a, b) => a.total - b.total); // biggest spend first
    const negatives = txs.filter((t) => (t.amount ?? 0) < 0);
    const positives = txs.filter((t) => (t.amount ?? 0) > 0);
    totalSpend =
      negatives.length > 0
        ? Math.round(negatives.reduce((s, t) => s + Math.abs(t.amount ?? 0), 0))
        : 0;
    totalIncome =
      positives.length > 0
        ? Math.round(positives.reduce((s, t) => s + (t.amount ?? 0), 0))
        : 0;
  }

  const costPerPoint =
    totalSpend != null && totalSpend > 0 && playerPoints != null && playerPoints > 0
      ? Math.round((totalSpend / playerPoints) * 100) / 100
      : null;

  /* expertise banking */
  const expRows = computeExpertiseBank(model);
  const playerExp = expRows.find((r) => r.isPlayer) ?? null;
  const medianNext =
    expRows.length > 0
      ? [...expRows.map((r) => r.nextSeason)].sort((a, b) => a - b)[
          Math.floor(expRows.length / 2)
        ]
      : null;

  const confidence: Confidence =
    (hasBalance || hasTransactions) && expRows.length > 0
      ? 'HIGH'
      : hasBalance || hasTransactions || expRows.length > 0
        ? 'MEDIUM'
        : 'LOW';

  const evidence: Evidence[] = [];
  if (hasBalance) {
    evidence.push({
      source: 'Finance_TeamBalance',
      label: `Balance đội bạn: ${model.finance.balance} (dòng mới nhất theo Day)`,
    });
  }
  if (hasTransactions) {
    evidence.push({
      source: 'Finance_Transactions',
      label: `${model.finance.transactions.length} giao dịch đã map (cột Amount/Category)`,
    });
  }
  if (expRows.length > 0) {
    evidence.push({
      source: 'Parts_TeamExpertise.NextSeasonExpertise',
      label: `Expertise bank mùa sau: đội bạn ${playerExp?.nextSeason ?? 'n/a'}, median giải ${medianNext}`,
    });
  }

  const assumptions: Assumption[] = [];
  if (!hasBalance && !hasTransactions) {
    assumptions.push({
      text: 'Finance_* chưa map được cột/bảng — finance snapshot rỗng; introspect save thật để chốt candidate columns',
    });
  }
  if (hasTransactions && totalSpend === 0) {
    assumptions.push({ text: 'Không có giao dịch âm nào — có thể dấu amount ngược với giả định (spend = amount âm)' });
  }
  if (expRows.length === 0) {
    assumptions.push({ text: 'Parts_TeamExpertise chưa map được — expertise banking không khả dụng' });
  }

  /* recommendations (6-field standard) */
  const recommendations: Recommendation[] = [];
  if (playerExp && medianNext != null && expRows.length > 1) {
    const aboveMedian = playerExp.nextSeason >= medianNext;
    recommendations.push({
      id: 'finance-expertise-bank',
      title: `Expertise bank mùa sau: ${playerExp.nextSeason} (hạng ${playerExp.rank}/${expRows.length})`,
      action: aboveMedian
        ? 'Giữ bank — vốn expertise của bạn đã trên median giải, chi R&D thêm vào cuối mùa chỉ tăng giá trị đã lớn'
        : 'Đẩy R&D cuối mùa để nâng NextSeasonExpertise lên tối thiểu bằng median giải',
      why: `Tổng NextSeasonExpertise của bạn ${playerExp.nextSeason} vs median giải ${medianNext} (nguồn: Parts_TeamExpertise.NextSeasonExpertise — cột đã xác minh từ bản cũ).`,
      confidence: expRows.length >= 5 ? 'HIGH' : 'MEDIUM',
      evidence,
      assumptions,
      riskIfIgnored: aboveMedian
        ? undefined
        : 'Vào mùa mới bạn xuất phát sau các đội về expertise — mất thời gian đuổi đầu mùa',
    });
  }
  if (costPerPoint != null) {
    recommendations.push({
      id: 'finance-cost-per-point',
      title: `Cost-per-point: ${costPerPoint} / điểm`,
      action:
        costPerPoint > 2_000_000
          ? 'Rà lại nhóm chi lớn nhất (xem spend by category) — mỗi điểm đang quá đắt so với mặt bằng'
          : 'Hiệu quả chi tiêu chấp nhận được — giữ cơ cấu chi hiện tại',
      why: `Tổng chi ${totalSpend} / ${playerPoints} điểm standings (nguồn: Finance_Transactions + standings tự tính đã verify).`,
      confidence: 'MEDIUM',
      evidence,
      assumptions,
    });
  }
  if (recommendations.length === 0) {
    recommendations.push({
      id: 'finance-nodata',
      title: 'Finance snapshot chưa có dữ liệu',
      action: 'Nạp save vào race weekend hoặc introspect save để chốt cột Finance_*; sau đó snapshot + cost-per-point tự bật',
      why: `Bảng Finance có sẵn: balance=${model.finance.tablesPresent.balance}, transactions=${model.finance.transactions.length} dòng map được.`,
      confidence: 'LOW',
      evidence,
      assumptions,
    });
  }

  const warnings: string[] = [];
  if (!hasBalance && !hasTransactions) warnings.push('FINANCE_DATA_UNAVAILABLE');

  return {
    data: {
      balance: model.finance.balance ?? null,
      budget: model.finance.budget ?? null,
      spendByCategory,
      totalSpend,
      totalIncome,
      costPerPoint,
      expertise: {
        rows: expRows,
        playerRank: playerExp?.rank ?? null,
        playerNext: playerExp?.nextSeason ?? null,
        leagueMedianNext: medianNext,
      },
      hasBalance,
      hasTransactions,
      hasExpertiseData: expRows.length > 0,
    },
    confidence,
    evidence,
    assumptions,
    recommendations,
    warnings,
  };
}
