/**
 * Regulation Engine v1 — Phase 2 (docs/03-ANALYTICS-ENGINES.md §5.8).
 *
 * Question: "Luật mới có lợi hay hại cho tôi? Vote thế nào?"
 *
 * Data reality: Regulations_* columns are CANDIDATE-level and the vote
 * encoding is NOT verified. The engine therefore:
 *   - reports the raw YES/NO tally under the assumption vote=1 means YES
 *     (documented assumption, surfaced in UI);
 *   - does NOT fabricate point/budget impacts — impact stays qualitative
 *     until ChangeGroups semantics are verified against a real save;
 *   - combines with expertise banking (finance engine) for the Research page.
 *
 * Pure function over the SaveModel — no React, no DB, no fetch.
 */

import type { Confidence, Evidence, Assumption, Recommendation } from '../domain/provenance';
import type { EngineResult } from '../domain/types';
import type { SaveModel } from '../domain/types';
import { computeExpertiseBank, type ExpertiseBankRow } from './finance.engine';

export interface ProposalView {
  proposalId: number;
  title: string | null;
  /** Raw state value from the save (semantics not verified). */
  state: number | null;
  seasonId: number | null;
  yes: number;
  no: number;
  unknownVotes: number;
  playerVote: number | null;
  /** Change-group labels/loc-keys (raw). */
  changes: string[];
}

export interface RegulationBoard {
  proposals: ProposalView[];
  expertise: {
    rows: ExpertiseBankRow[];
    playerRank: number | null;
    playerNext: number | null;
    leagueMedianNext: number | null;
  };
  hasRegulationData: boolean;
  hasVoteData: boolean;
}

export function buildRegulations(model: SaveModel): EngineResult<RegulationBoard> {
  const playerTeamId = model.player.teamId;

  const proposals: ProposalView[] = model.regulations.map((p) => {
    let yes = 0;
    let no = 0;
    let unknownVotes = 0;
    let playerVote: number | null = null;
    for (const v of p.votes) {
      if (v.teamId === playerTeamId) playerVote = v.vote ?? null;
      if (v.vote === 1) yes += 1;
      else if (v.vote === 0) no += 1;
      else unknownVotes += 1;
    }
    return {
      proposalId: p.proposalId,
      title: p.title ?? null,
      state: p.state ?? null,
      seasonId: p.seasonId ?? null,
      yes,
      no,
      unknownVotes,
      playerVote,
      changes: p.changes.map((c) => c.label ?? `group ${c.groupId ?? '?'}`),
    };
  });

  const hasVoteData = proposals.some((p) => p.yes + p.no + p.unknownVotes > 0);
  const hasRegulationData = model.regulations.length > 0;

  const expRows = computeExpertiseBank(model);
  const playerExp = expRows.find((r) => r.isPlayer) ?? null;
  const medianNext =
    expRows.length > 0
      ? [...expRows.map((r) => r.nextSeason)].sort((a, b) => a - b)[
          Math.floor(expRows.length / 2)
        ]
      : null;

  const confidence: Confidence = hasRegulationData
    ? hasVoteData
      ? 'MEDIUM'
      : 'LOW'
    : 'LOW';

  const evidence: Evidence[] = [];
  if (hasRegulationData) {
    evidence.push({
      source: 'Regulations_Proposals',
      label: `${proposals.length} đề xuất luật trong save`,
    });
  }
  if (hasVoteData) {
    evidence.push({
      source: 'Regulations_TeamVotes',
      label: `Đếm phiếu theo giả định vote=1 là YES (encoding chưa verify trên save thật)`,
    });
  }
  if (expRows.length > 0) {
    evidence.push({
      source: 'Parts_TeamExpertise.NextSeasonExpertise',
      label: `Expertise bank: đội bạn ${playerExp?.nextSeason ?? 'n/a'} (hạng ${playerExp?.rank ?? 'n/a'}/${expRows.length})`,
    });
  }

  const assumptions: Assumption[] = [];
  if (hasVoteData) {
    assumptions.push({
      text: 'Encoding phiếu chưa được xác minh trên save thật — hiển thị tally thô kèm giả định vote=1=YES',
    });
  }
  if (hasRegulationData) {
    assumptions.push({
      text: 'Tác động điểm/budget của luật chưa tính được — cần verify semantics của Regulations_ChangeGroups trước',
    });
  } else {
    assumptions.push({
      text: 'Regulations_* chưa map được bảng/cột — Research chỉ còn expertise banking',
    });
  }

  /* recommendations (6-field standard) */
  const recommendations: Recommendation[] = [];
  const open = proposals.slice(0, 3);
  for (const p of open) {
    const totalVotes = p.yes + p.no + p.unknownVotes;
    const majorityYes = p.yes > totalVotes / 2;
    recommendations.push({
      id: `regulation-vote-${p.proposalId}`,
      title: `Đề xuất #${p.proposalId}${p.title ? ` — ${p.title}` : ''}`,
      action:
        p.playerVote != null
          ? `Đội bạn đã vote (${p.playerVote}) — theo dõi tally tới deadline`
          : majorityYes
            ? 'Đa số đang nghiêng về YES — cân nhắc vote theo nếu không có lý do riêng'
            : 'Chưa rõ đa số — chờ thêm phiếu trước khi chốt, theo dõi tally mỗi tuần game',
      why: `Tally hiện tại: ${p.yes} YES / ${p.no} NO${p.unknownVotes > 0 ? ` / ${p.unknownVotes} không rõ` : ''}${p.changes.length > 0 ? `; nhóm thay đổi: ${p.changes.join(', ')}` : ''}.`,
      confidence: 'LOW',
      evidence,
      assumptions,
      riskIfIgnored: 'Bỏ phiếu muộn hoặc sai chiều có thể thay đổi luật cả mùa — ảnh hưởng thiết kế part đang chạy',
    });
  }
  if (playerExp && medianNext != null && expRows.length > 1) {
    // 0.5.3: same 3-case fix as finance.engine (0.4.1) — `>=` claimed "above
    // median" when the whole league sat at 0 (bank 0, median 0, rank 11/11).
    // Compare strictly and word the tie; title/confidence/evidence unchanged.
    const aboveMedian = playerExp.nextSeason > medianNext;
    const atMedian = playerExp.nextSeason === medianNext;
    const allZero = expRows.every((r) => r.nextSeason === 0);
    recommendations.push({
      id: 'regulation-expertise-bank',
      title: `Expertise banking cho mùa tới: ${playerExp.nextSeason} (hạng ${playerExp.rank}/${expRows.length})`,
      action: aboveMedian
        ? 'Bank đã trên median — không cần đốt R&D chỉ để tăng expertise'
        : atMedian
          ? allZero
            ? 'Cả giải chưa bank expertise nào (toàn bộ 0) — chưa có mặt trận nào thắng/thua; bật R&D bank từ giữa mùa để tạo khoảng cách'
            : 'Bằng median giải — chưa có lợi thế; đẩy R&D cuối mùa để nhích lên trên nhóm giữa'
          : 'Cần thêm R&D trước khi mùa kết thúc để bank lên tối thiểu median giải',
      why: `Σ NextSeasonExpertise của bạn ${playerExp.nextSeason} vs median ${medianNext} — banking quyết định khởi điểm mùa sau (docs/03 §5.6).`,
      confidence: 'MEDIUM',
      evidence,
      assumptions,
    });
  }
  if (recommendations.length === 0) {
    recommendations.push({
      id: 'regulation-nodata',
      title: 'Không có đề xuất luật nào trong save',
      action: 'Quay lại Research sau khi game mở kỳ bỏ phiếu; expertise banking vẫn xem được khi Parts_TeamExpertise map',
      why: `Regulations_Proposals hiện diện: ${model.regulations.length > 0 || hasRegulationData ? 'có bảng' : 'không có bảng/dữ liệu'}; số đề xuất đọc được: ${proposals.length}.`,
      confidence: 'LOW',
      evidence,
      assumptions,
    });
  }

  const warnings: string[] = [];
  if (!hasRegulationData) warnings.push('REGULATION_DATA_UNAVAILABLE');

  return {
    data: {
      proposals,
      expertise: {
        rows: expRows,
        playerRank: playerExp?.rank ?? null,
        playerNext: playerExp?.nextSeason ?? null,
        leagueMedianNext: medianNext,
      },
      hasRegulationData,
      hasVoteData,
    },
    confidence,
    evidence,
    assumptions,
    recommendations,
    warnings,
  };
}
