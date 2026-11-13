/**
 * Car Engine v1 — Phase 2 (docs/03-ANALYTICS-ENGINES.md §5.5).
 *
 * Question: "Xe tôi mạnh/yếu ở đâu? Nâng cấp gì tiếp? Part nào sắp hỏng?"
 *
 * Data reality (Phase 2): Parts_* columns are CANDIDATE-level (adaptive
 * repos). The engine therefore reports what actually mapped and degrades
 * league table to the pace board when design points are unavailable —
 * with the source labelled, never a silent fallback.
 *
 * Model constants (documented, not oracle):
 *   DURABILITY_RISK thresholds on normalized condition (0..1):
 *     HIGH < 0.40 ≤ WATCH < 0.70 ≤ LOW   (model thresholds — changelog entry
 *     required if changed; re-verify against game wear behaviour).
 *
 * Pure function over the SaveModel — no React, no DB, no fetch.
 */

import type { Confidence, Evidence, Assumption, Recommendation } from '../domain/provenance';
import type { EngineResult } from '../domain/types';
import type { SaveModel, PartDesign, PartItem } from '../domain/types';
import { isSupplierPartType } from '../parser/repositories/parts.repo';
import { buildPaceBoard } from './pace.engine';

export const DURABILITY_RISK_HIGH_BELOW = 0.4;
export const DURABILITY_RISK_WATCH_BELOW = 0.7;

export type RiskLevel = 'LOW' | 'WATCH' | 'HIGH' | 'UNKNOWN';

export interface CarLeagueRow {
  teamId: number;
  teamName: string;
  /** Design points total (designs source) or null for pace fallback. */
  score: number | null;
  rank: number | null;
  isPlayer: boolean;
}

export interface PartConditionRow {
  partType: string;
  count: number;
  conditionAvg: number | null;
  conditionMin: number | null;
  risk: RiskLevel;
  isSupplier: boolean;
}

export interface DevQueueRow {
  designId: number;
  partType?: string;
  name?: string;
  points: number;
  cost?: number;
  /** points per 1M currency (docs/03 §5.5: points-per-budget ranking). */
  pointsPerMillion: number | null;
  buildDays?: number;
}

export interface CarLab {
  league: { rows: CarLeagueRow[]; source: 'designs' | 'pace' };
  parts: PartConditionRow[];
  devQueue: DevQueueRow[];
  hasPartsData: boolean;
  hasDesignPoints: boolean;
  supplierNotePresent: boolean;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function riskOf(condition: number | null): RiskLevel {
  if (condition == null) return 'UNKNOWN';
  if (condition < DURABILITY_RISK_HIGH_BELOW) return 'HIGH';
  if (condition < DURABILITY_RISK_WATCH_BELOW) return 'WATCH';
  return 'LOW';
}

/** Design points league: total points per team from mapped designs. */
function designLeague(model: SaveModel): CarLeagueRow[] | null {
  const byTeam = new Map<number, number>();
  for (const d of model.parts.designs) {
    if (d.teamId == null || d.points == null) continue;
    byTeam.set(d.teamId, (byTeam.get(d.teamId) ?? 0) + d.points);
  }
  if (byTeam.size === 0) return null;
  const teamName = (id: number): string =>
    model.teams.find((t) => t.teamId === id)?.teamName ?? `Team ${id}`;
  const rows = [...byTeam.entries()].map(([teamId, score]) => ({
    teamId,
    teamName: teamName(teamId),
    score,
    rank: 0,
    isPlayer: teamId === model.player.teamId,
  }));
  rows.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });
  return rows;
}

function paceLeague(model: SaveModel): CarLeagueRow[] {
  const pace = buildPaceBoard(model);
  return pace.data.rows.map((r) => ({
    teamId: r.teamId,
    teamName: r.teamName,
    score: null,
    rank: r.rank,
    isPlayer: r.isPlayer,
  }));
}

/** Player-team part condition grouped by part type. */
function partConditions(model: SaveModel): PartConditionRow[] {
  const playerTeamId = model.player.teamId;
  const teamNameOf = (id: number): string | undefined =>
    model.teams.find((t) => t.teamId === id)?.teamName;
  // Attribute items to the player team by explicit TeamID, or by design link.
  const designsById = new Map<number, PartDesign>();
  for (const d of model.parts.designs) designsById.set(d.designId, d);
  const playerItems: PartItem[] = model.parts.items.filter((it) => {
    if (it.teamId != null) return it.teamId === playerTeamId;
    if (it.designId != null) {
      return designsById.get(it.designId)?.teamId === playerTeamId;
    }
    return false;
  });
  const byType = new Map<string, PartItem[]>();
  for (const it of playerItems) {
    const type = it.partType ?? designsById.get(it.designId ?? -1)?.partType ?? 'unknown';
    (byType.get(type) ?? byType.set(type, []).get(type)!).push(it);
  }
  const rows: PartConditionRow[] = [];
  for (const [partType, items] of byType) {
    const conditions = items
      .map((it) => it.condition)
      .filter((c): c is number => c != null);
    const avg =
      conditions.length > 0
        ? conditions.reduce((s, c) => s + c, 0) / conditions.length
        : null;
    rows.push({
      partType,
      count: items.length,
      conditionAvg: avg != null ? Math.round(avg * 100) / 100 : null,
      conditionMin:
        conditions.length > 0 ? Math.min(...conditions) : null,
      risk: riskOf(avg),
      isSupplier: isSupplierPartType(partType),
    });
  }
  rows.sort((a, b) => {
    const order: Record<RiskLevel, number> = { HIGH: 0, WATCH: 1, UNKNOWN: 2, LOW: 3 };
    return order[a.risk] - order[b.risk] || a.partType.localeCompare(b.partType);
  });
  void teamNameOf;
  return rows;
}

function devQueue(model: SaveModel): DevQueueRow[] {
  const playerTeamId = model.player.teamId;
  const rows: DevQueueRow[] = model.parts.designs
    .filter((d) => d.teamId === playerTeamId && d.points != null)
    .map((d) => ({
      designId: d.designId,
      partType: d.partType,
      name: d.name,
      points: d.points as number,
      cost: d.cost,
      pointsPerMillion:
        d.cost != null && d.cost > 0
          ? Math.round(((d.points as number) / d.cost) * 1_000_000)
          : null,
      buildDays: d.buildDays,
    }));
  rows.sort((a, b) => {
    const pa = a.pointsPerMillion ?? -1;
    const pb = b.pointsPerMillion ?? -1;
    if (pa !== pb) return pb - pa;
    return b.points - a.points;
  });
  return rows;
}

export function buildCarLab(model: SaveModel): EngineResult<CarLab> {
  const dLeague = designLeague(model);
  const league = dLeague ?? paceLeague(model);
  const leagueSource: 'designs' | 'pace' = dLeague ? 'designs' : 'pace';
  const parts = partConditions(model);
  const queue = devQueue(model);

  const hasPartsData =
    model.parts.tablesPresent.designs || model.parts.tablesPresent.items;
  const hasDesignPoints = queue.length > 0;
  const supplierPresent = parts.some((p) => p.isSupplier);

  const confidence: Confidence =
    hasPartsData && hasDesignPoints
      ? 'HIGH'
      : hasPartsData || hasDesignPoints
        ? 'MEDIUM'
        : 'LOW';

  const evidence: Evidence[] = [];
  if (dLeague) {
    evidence.push({
      source: 'Parts_Designs.Points',
      label: `League xe xếp theo tổng design points của ${dLeague.length} đội (cột Points đã map)`,
    });
  } else {
    evidence.push({
      source: 'Races_Results.FastestLap (pace fallback)',
      label: 'Thiếu design points — league xe tạm xếp theo pace board (ghi rõ ở UI)',
    });
  }
  if (model.parts.tablesPresent.items) {
    evidence.push({
      source: 'Parts_Items.Condition',
      label: `Condition ${parts.length} nhóm part của đội bạn (cột Condition đã map)`,
    });
  }
  evidence.push({
    source: 'Parts_Designs/Items',
    label: `Bảng Parts có sẵn: designs=${model.parts.tablesPresent.designs}, items=${model.parts.tablesPresent.items}, expertise=${model.parts.tablesPresent.expertise}`,
  });

  const assumptions: Assumption[] = [];
  if (!hasPartsData) {
    assumptions.push({
      text: 'Parts_* chưa map được cột/bảng — Car Lab chạy ở chế độ suy giảm; introspect save thật để chốt candidate columns',
    });
  } else {
    assumptions.push({
      text: `Ngưỡng rủi ro durability là hằng số mô hình: HIGH < ${DURABILITY_RISK_HIGH_BELOW}, WATCH < ${DURABILITY_RISK_WATCH_BELOW} (condition chuẩn hoá 0..1)`,
    });
  }

  /* recommendations (6-field standard) */
  const recommendations: Recommendation[] = [];
  const highRisk = parts.find((p) => p.risk === 'HIGH');
  const watchRisk = parts.find((p) => p.risk === 'WATCH');
  if (highRisk) {
    recommendations.push({
      id: 'car-durability-high',
      title: `Part ${highRisk.partType} nguy cơ hỏng cao`,
      action: `Kiểm tra/thay ${highRisk.partType} trước chặng tới (condition trung bình ${(highRisk.conditionAvg ?? 0) * 100}%)`,
      why: `Condition trung bình ${highRisk.conditionAvg} dưới ngưỡng HIGH ${DURABILITY_RISK_HIGH_BELOW}; ${highRisk.count} part trong nhóm${highRisk.isSupplier ? ' — đây là supplier part (bank reset mỗi mùa, không carry-over)' : ''}.`,
      confidence: hasPartsData ? 'MEDIUM' : 'LOW',
      evidence,
      assumptions,
      riskIfIgnored: 'Part hỏng giữa chặng → DNF hoặc phạt lưới ở chặng kế tiếp',
    });
  } else if (watchRisk) {
    recommendations.push({
      id: 'car-durability-watch',
      title: `Theo dõi ${watchRisk.partType} (condition ${(watchRisk.conditionAvg ?? 0) * 100}%)`,
      action: `Đưa ${watchRisk.partType} vào kế hoạch thay trong 2–3 chặng tới`,
      why: `Condition trong vùng WATCH (${DURABILITY_RISK_HIGH_BELOW}–${DURABILITY_RISK_WATCH_BELOW}); chưa khẩn cấp nhưng không để tuột vào HIGH.`,
      confidence: 'MEDIUM',
      evidence,
      assumptions,
    });
  }
  const topQueue = queue.find((q) => q.pointsPerMillion != null) ?? queue[0];
  if (topQueue) {
    recommendations.push({
      id: 'car-dev-queue',
      title: `Nâng cấp tiếp theo: ${topQueue.partType ?? topQueue.name ?? `design #${topQueue.designId}`}`,
      action: `Ưu tiên thiết kế ${topQueue.partType ?? topQueue.name ?? 'part này'} — ${topQueue.points} pts${topQueue.cost ? ` / ${Math.round(topQueue.cost / 1_000_000)}M credits` : ''}`,
      why:
        topQueue.pointsPerMillion != null
          ? `Points-per-budget cao nhất trong dev queue: ${topQueue.pointsPerMillion} pts/1M credits (docs/03 §5.5 xếp theo hiệu quả, không phải điểm tuyệt đối).`
          : 'Không map được cột cost — xếp theo điểm tuyệt đối; introspect để bật points-per-budget.',
      confidence: hasDesignPoints ? (topQueue.pointsPerMillion != null ? 'MEDIUM' : 'LOW') : 'LOW',
      evidence,
      assumptions,
      expectedGain: `+${topQueue.points} design points (ước lượng từ save)`,
    });
  }
  if (recommendations.length === 0) {
    recommendations.push({
      id: 'car-nodata',
      title: 'Car Lab đang chạy ở chế độ suy giảm',
      action: 'Nạp save trong race weekend (khi Parts data được game ghi đầy đủ) hoặc introspect save để chốt schema Parts_*',
      why: `Thiếu bảng/cột Parts: designs=${model.parts.tablesPresent.designs}, items=${model.parts.tablesPresent.items}. League xe đang dùng pace fallback — vẫn dùng được nhưng không có part grid/durability/dev queue.`,
      confidence: 'LOW',
      evidence,
      assumptions,
    });
  }

  const warnings: string[] = [];
  if (!hasPartsData) warnings.push('PARTS_DATA_UNAVAILABLE');

  return {
    data: {
      league: { rows: league, source: leagueSource },
      parts,
      devQueue: queue,
      hasPartsData,
      hasDesignPoints,
      supplierNotePresent: supplierPresent,
    },
    confidence,
    evidence,
    assumptions,
    recommendations,
    warnings,
  };
}
