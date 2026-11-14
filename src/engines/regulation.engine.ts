/**
 * Regulation Engine v2 — Phase 2 (docs/03 §5.8) + v0.6.0 vote fix.
 *
 * v0.6.0 (verified on the project owner's Miami 2027 save, autosave-3.sav):
 * Regulations_TeamVotes has NO Vote/YES-NO column — its third column,
 * GroupID, is the OPTION GROUP the team voted for. The old engine counted
 * vote===1 as YES and landed on "0 YES / 0 NO / 11 không rõ" for every
 * proposal. The tally is now per option group:
 *   #1: 8 teams → Rear Wing Major — bản 02 vs 3 → bản 01
 *   #4: 8 → Airflow Minor — bản 02 vs 3 → bản 01
 *   #5: 7/7 High Engine Limits · #6: 9/9 Alt Prize Share
 *   #7: 6 → Chassis Redesign — bản 02 vs 5 → bản 01 (player chose 35 = 02)
 *   #2: 0 phiếu · #3: 1 phiếu (player only, nhóm 6)
 *
 * Proposal names come from the group LocKey (no more "Đề xuất không tên").
 * Recommendations: max 3 proposals with TargetSeason >= current season,
 * ordered by VoteDay DESC (not the old first-three-by-array-order).
 * Legacy YES/NO schemas still tally under the documented vote=1=YES rule.
 *
 * Expertise banking definition unchanged (finance engine); the Research UI
 * shows BOTH columns — total expertise vs banked (NextSeasonExpertise).
 *
 * Pure function over the SaveModel — no React, no DB, no fetch.
 */

import type { Confidence, Evidence, Assumption, Recommendation } from '../domain/provenance';
import type { EngineResult } from '../domain/types';
import type { SaveModel } from '../domain/types';
import { computeExpertiseBank, type ExpertiseBankRow } from './finance.engine';

export interface ProposalOptionTally {
  groupId: number;
  label: string;
  votes: number;
  /** True when this is the option the player's team voted for. */
  isPlayerChoice: boolean;
}

export interface ProposalView {
  proposalId: number;
  /** Proposal title; falls back to the option label base (LocKey-derived). */
  title: string | null;
  /** Display name of the proposal kind (Regulations_Enum_ChangeType, 0.5.3). */
  changeTypeLabel: string | null;
  /** Raw state value from the save (semantics not verified). */
  state: number | null;
  seasonId: number | null;
  /** v0.6.0 — the season the regulation takes effect. */
  targetSeason: number | null;
  /** v0.6.0 — day of the vote (recency ordering). */
  voteDay: number | null;
  /** Group-based tally (the verified Miami encoding). Empty on legacy saves. */
  tally: ProposalOptionTally[];
  totalVotes: number;
  /** Legacy YES/NO tally (saves that still carry a Vote column). */
  yes: number;
  no: number;
  unknownVotes: number;
  /** The option group the player's team voted for. */
  playerGroupId: number | null;
  /** Legacy raw vote value. */
  playerVote: number | null;
  /** Change-group labels (raw). */
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

/** "Chassis Redesign — bản 02" → "Chassis Redesign" (proposal title base). */
function optionBase(label: string): string {
  const m = /^(.*?)\s+— bản \d+$/.exec(label);
  return m ? m[1] : label;
}

export function buildRegulations(model: SaveModel): EngineResult<RegulationBoard> {
  const playerTeamId = model.player.teamId;

  const proposals: ProposalView[] = model.regulations.map((p) => {
    let yes = 0;
    let no = 0;
    let unknownVotes = 0;
    let playerVote: number | null = null;
    let playerGroupId: number | null = null;

    for (const v of p.votes) {
      if (v.teamId === playerTeamId) {
        playerVote = v.vote ?? null;
        playerGroupId = v.groupId ?? null;
      }
      if (v.groupId != null) continue; // group tally handles these below
      if (v.vote === 1) yes += 1;
      else if (v.vote === 0) no += 1;
      else unknownVotes += 1;
    }

    /* group-based tally — votes land on the option group they chose */
    const voteCounts = new Map<number, number>();
    for (const v of p.votes) {
      if (v.groupId == null) continue;
      voteCounts.set(v.groupId, (voteCounts.get(v.groupId) ?? 0) + 1);
    }
    const optionLabel = new Map<number, string>();
    for (const c of p.changes) {
      if (c.groupId != null) {
        optionLabel.set(
          c.groupId,
          c.label ?? `Nhóm thay đổi ${c.groupId} (không có chi tiết trong save)`,
        );
      }
    }
    const tallyGroupIds = new Set<number>([...voteCounts.keys(), ...optionLabel.keys()]);
    const tally: ProposalOptionTally[] = [...tallyGroupIds].map((groupId) => ({
      groupId,
      label: optionLabel.get(groupId) ?? `Nhóm thay đổi #${groupId} (phiếu không khớp nhóm nào)`,
      votes: voteCounts.get(groupId) ?? 0,
      isPlayerChoice: playerGroupId === groupId,
    }));
    tally.sort((a, b) => b.votes - a.votes || a.groupId - b.groupId);

    /* title: stored title → first option label base (LocKey/content-derived,
     * v0.6.0) → ChangeType name → null (the UI's last-resort text) */
    const fallbackTitle =
      p.title ??
      (p.changes.length > 0 && p.changes[0].label ? optionBase(p.changes[0].label) : null) ??
      p.changeTypeLabel ??
      null;

    return {
      proposalId: p.proposalId,
      title: fallbackTitle,
      changeTypeLabel: p.changeTypeLabel ?? null,
      state: p.state ?? null,
      seasonId: p.seasonId ?? null,
      targetSeason: p.targetSeason ?? null,
      voteDay: p.voteDay ?? null,
      tally,
      totalVotes: tally.reduce((s, t) => s + t.votes, 0),
      yes,
      no,
      unknownVotes,
      playerGroupId,
      playerVote,
      changes: p.changes.map((c) =>
        c.label ?? `Nhóm thay đổi ${c.groupId ?? '?'} (không có chi tiết trong save)`,
      ),
    };
  });

  const hasGroupVotes = proposals.some((p) => p.totalVotes > 0);
  const hasLegacyVotes = proposals.some((p) => p.yes + p.no + p.unknownVotes > 0);
  const hasVoteData = hasGroupVotes || hasLegacyVotes;
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
  if (hasGroupVotes) {
    evidence.push({
      source: 'Regulations_TeamVotes.GroupID',
      label: 'Mỗi đội chọn 1 nhóm phương án (GroupID) — tally theo nhóm; verify trên save Miami 2027 (v0.6.0)',
    });
  }
  if (hasLegacyVotes) {
    evidence.push({
      source: 'Regulations_TeamVotes.Vote',
      label: `Đếm phiếu theo giả định vote=1 là YES (schema cũ, không có GroupID)`,
    });
  }
  if (expRows.length > 0) {
    evidence.push({
      source: 'Parts_TeamExpertise.NextSeasonExpertise',
      label: `Expertise bank: đội bạn ${playerExp?.nextSeason ?? 'n/a'} (hạng ${playerExp?.rank ?? 'n/a'}/${expRows.length}); tổng expertise hiện tại lấy từ cùng bảng (cột Expertise)`,
    });
  }

  const assumptions: Assumption[] = [];
  if (hasGroupVotes) {
    assumptions.push({
      text: 'Tally = số đội chọn từng nhóm phương án (Regulations_TeamVotes.GroupID) — không phải YES/NO; đề xuất không phiếu nào hiển thị 0 phiếu',
    });
  }
  if (hasLegacyVotes) {
    assumptions.push({
      text: 'Encoding phiếu YES/NO chưa được xác minh trên save thật — hiển thị tally thô kèm giả định vote=1=YES',
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

  /* recommendations (6-field standard) — v0.6.0: only LIVE proposals
   * (TargetSeason >= current season), most recent VoteDay first, max 3.
   * When the save carries no TargetSeason at all (old schemas), every
   * proposal is eligible (degradation, documented in the assumption). */
  const recommendations: Recommendation[] = [];
  const anyTargetSeason = proposals.some((p) => p.targetSeason != null);
  const seasonId = model.meta.seasonId;
  const eligible = (
    anyTargetSeason
      ? proposals.filter((p) => (p.targetSeason ?? Number.NEGATIVE_INFINITY) >= seasonId)
      : proposals.slice()
  ).sort((a, b) => (b.voteDay ?? -1) - (a.voteDay ?? -1));
  const open = eligible.slice(0, 3);

  for (const p of open) {
    const hasLegacy = p.yes + p.no + p.unknownVotes > 0;
    const tallyClause =
      p.tally.length > 0 && p.totalVotes > 0
        ? p.tally.map((t) => `${t.votes} đội chọn ${t.label}`).join(' vs ')
        : hasLegacy
          ? `Tally hiện tại: ${p.yes} YES / ${p.no} NO${p.unknownVotes > 0 ? ` / ${p.unknownVotes} không rõ` : ''}`
          : p.tally.length > 0
            ? `0 phiếu (các phương án: ${p.tally.map((t) => t.label).join(', ')})`
            : 'Chưa có phiếu nào được đọc từ save';
    const playerClause =
      p.playerGroupId != null
        ? p.tally.find((t) => t.isPlayerChoice)?.label ?? `nhóm ${p.playerGroupId}`
        : null;
    recommendations.push({
      id: `regulation-vote-${p.proposalId}`,
      title: `Đề xuất #${p.proposalId}${p.title ? ` — ${p.title}` : p.changeTypeLabel ? ` — ${p.changeTypeLabel}` : ''}`,
      action: playerClause
        ? `Đội bạn đã chọn ${playerClause} — theo dõi tally tới deadline`
        : 'Đội bạn chưa vote — cân nhắc chiều đa số trước deadline',
      why: `${tallyClause}${p.targetSeason != null ? `; áp dụng mùa ${p.targetSeason}` : ''}${p.tally.length === 0 && p.changes.length > 0 ? `; nhóm thay đổi: ${p.changes.join(', ')}` : ''}.`,
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
