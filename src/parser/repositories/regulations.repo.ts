/**
 * Regulations repository — schema-adaptive (Phase 2).
 *
 * Tables (docs/01 A1): Regulations_Proposals, Regulations_TeamVotes,
 * Regulations_ChangeGroups, Regulations_Proposals_ChangeGroups.
 * Vote encoding is NOT verified — engines treat 1 as YES and surface the
 * raw tally with an explicit note instead of inventing semantics.
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
import type {
  RegulationProposal,
  RegulationVoteRow,
  RegulationChangeRow,
} from '../../domain/types';
import { getPartTypeLabels } from './parts.repo';

const PROPOSALS_TABLE = 'Regulations_Proposals';
const VOTES_TABLE = 'Regulations_TeamVotes';
const GROUPS_TABLE = 'Regulations_ChangeGroups';
const PROPOSAL_GROUPS_TABLE = 'Regulations_Proposals_ChangeGroups';

const PROPOSAL_CANDIDATES: Record<string, string[]> = {
  proposalId: pkCandidates(PROPOSALS_TABLE),
  seasonId: ['SeasonID'],
  state: ['State', 'ProposalState', 'Status'],
  title: ['Title', 'Name', 'Description'],
  changeType: ['ChangeType', 'ChangeTypeID'],
};

const VOTE_CANDIDATES: Record<string, string[]> = {
  proposalId: [`${PROPOSALS_TABLE}ID`, 'ProposalID'],
  teamId: ['TeamID'],
  vote: ['Vote', 'Approved', 'Decision', 'Support'],
};

const GROUP_CANDIDATES: Record<string, string[]> = {
  groupId: pkCandidates(GROUPS_TABLE),
  label: ['Name', 'Title', 'Description', 'LocKey', 'Label'],
};

const PROPOSAL_GROUP_CANDIDATES: Record<string, string[]> = {
  proposalId: [`${PROPOSALS_TABLE}ID`, 'ProposalID'],
  groupId: [`${GROUPS_TABLE}ID`, 'ChangeGroupID', 'GroupID'],
};

export interface RawRegulations {
  proposals: RegulationProposal[];
  tablesPresent: {
    proposals: boolean;
    votes: boolean;
    changeGroups: boolean;
  };
}

/**
 * 0.5.3 — resolve change-group IDs into readable labels from the save's
 * own regulation content tables. F1M24 has NO textual group names (the
 * old fallback emitted bare "group 18, group 19" and Research showed three
 * identical cards). Labels are composed from measured rows only:
 *   SweepingReductions      → "Giảm toàn diện N%"
 *   TypeReductions          → "Giảm N% {PartType}" (Parts_Enum_Type names)
 *   StatReductions          → "Giảm N% trên {k} chỉ số xe" (per distinct pct)
 *   TypeStatComboReductions → "Giảm N% {PartType} (combo)"
 *   NonTechnical            → "Luật phi kỹ thuật (quy tắc #R): value"
 * Groups with no content rows anywhere degrade to an explicit
 * "chi tiết không có trong save" note — never a bare "group N".
 */
function resolveGroupLabels(db: SqlJsDatabase): Map<number, string> {
  const typeLabels = getPartTypeLabels(db);
  const partName = (raw: number | null | undefined): string =>
    raw != null ? (typeLabels.get(raw) ?? `phần #${raw}`) : 'phần ?';
  const pct = (v: number): number => Math.round(v * 100);

  const pieces = new Map<number, string[]>();
  const push = (groupId: number | null | undefined, piece: string): void => {
    if (groupId == null) return;
    const list = pieces.get(groupId) ?? [];
    list.push(piece);
    pieces.set(groupId, list);
  };
  const read = (table: string, need: string[]): { rows: unknown[][]; idx: Record<string, number> } | null => {
    const t = readTable(db, table);
    if (!t.present) return null;
    const idx: Record<string, number> = {};
    for (const c of need) idx[c] = colIndex(t.columns, c);
    for (const c of need) if (idx[c] < 0) return null;
    return { rows: t.rows, idx };
  };

  const sweep = read('Regulations_Technical_SweepingReductions', ['GroupID', 'SweepingReduction']);
  if (sweep) {
    for (const row of sweep.rows) {
      push(readNum(row, sweep.idx.GroupID), `Giảm toàn diện ${pct(readNum(row, sweep.idx.SweepingReduction) ?? 0)}%`);
    }
  }
  const type = read('Regulations_Technical_TypeReductions', ['GroupID', 'PartType', 'TypeReduction']);
  if (type) {
    for (const row of type.rows) {
      push(
        readNum(row, type.idx.GroupID),
        `Giảm ${pct(readNum(row, type.idx.TypeReduction) ?? 0)}% ${partName(readNum(row, type.idx.PartType))}`,
      );
    }
  }
  const combo = read('Regulations_Technical_TypeStatComboReductions', ['GroupID', 'PartType', 'PartStat', 'ComboReduction']);
  if (combo) {
    const seen = new Set<string>();
    for (const row of combo.rows) {
      const groupId = readNum(row, combo.idx.GroupID);
      const p = partName(readNum(row, combo.idx.PartType));
      const key = `${groupId}:${p}`;
      if (seen.has(key)) continue; // one piece per part across its stats
      seen.add(key);
      push(groupId, `Giảm ${pct(readNum(row, combo.idx.ComboReduction) ?? 0)}% ${p} (combo)`);
    }
  }
  const stat = read('Regulations_Technical_StatReductions', ['GroupID', 'StatReduction']);
  if (stat) {
    // group stats by reduction percentage: "Giảm 30% trên 3 chỉ số xe"
    const byGroupPct = new Map<number, Map<number, number>>();
    for (const row of stat.rows) {
      const groupId = readNum(row, stat.idx.GroupID);
      const p = pct(readNum(row, stat.idx.StatReduction) ?? 0);
      if (groupId == null) continue;
      const m = byGroupPct.get(groupId) ?? new Map<number, number>();
      m.set(p, (m.get(p) ?? 0) + 1);
      byGroupPct.set(groupId, m);
    }
    for (const [groupId, byPct] of byGroupPct) {
      for (const [p, count] of [...byPct.entries()].sort((a, b) => b[0] - a[0])) {
        push(groupId, `Giảm ${p}% trên ${count} chỉ số xe`);
      }
    }
  }
  const nontech = read('Regulations_NonTechnical', ['GroupID', 'Regulation', 'Value']);
  if (nontech) {
    for (const row of nontech.rows) {
      const groupId = readNum(row, nontech.idx.GroupID);
      const rule = readNum(row, nontech.idx.Regulation);
      const value = readNum(row, nontech.idx.Value);
      if (groupId == null || rule == null) continue;
      const shown =
        value != null && Math.abs(value) >= 1_000_000
          ? `${Math.round(value / 100_000) / 10}M`
          : `biến thể ${value ?? '?'}`;
      push(groupId, `Luật phi kỹ thuật (quy tắc #${rule}): ${shown}`);
    }
  }

  const labels = new Map<number, string>();
  for (const [groupId, list] of pieces) {
    const deduped = [...new Set(list)];
    if (deduped.length > 0) labels.set(groupId, deduped.join(' + '));
  }
  return labels;
}

export function getRegulations(db: SqlJsDatabase): RawRegulations {
  const prop = readTable(db, PROPOSALS_TABLE);
  const pMap = buildColumnMap(prop.columns, PROPOSAL_CANDIDATES);

  const votes = readTable(db, VOTES_TABLE);
  const vMap = buildColumnMap(votes.columns, VOTE_CANDIDATES);
  const votesByProposal = new Map<number, RegulationVoteRow[]>();
  if (votes.present && vMap.proposalId && vMap.teamId) {
    const pIdx = colIndex(votes.columns, vMap.proposalId);
    const tIdx = colIndex(votes.columns, vMap.teamId);
    const voteIdx = vMap.vote ? colIndex(votes.columns, vMap.vote) : -1;
    for (const row of votes.rows) {
      const proposalId = readNum(row, pIdx);
      const teamId = readNum(row, tIdx);
      if (proposalId == null || teamId == null) continue;
      const list = votesByProposal.get(proposalId) ?? [];
      list.push({ teamId, vote: readNum(row, voteIdx) });
      votesByProposal.set(proposalId, list);
    }
  }

  const groups = readTable(db, GROUPS_TABLE);
  const gMap = buildColumnMap(groups.columns, GROUP_CANDIDATES);
  const labelByGroup = new Map<number, string | undefined>();
  if (groups.present && gMap.groupId) {
    const gIdx = colIndex(groups.columns, gMap.groupId);
    const lIdx = gMap.label ? colIndex(groups.columns, gMap.label) : -1;
    for (const row of groups.rows) {
      const groupId = readNum(row, gIdx);
      if (groupId == null) continue;
      labelByGroup.set(groupId, lIdx >= 0 ? readStr(row, lIdx) : undefined);
    }
  }
  /* 0.5.3: content-derived labels (technical/non-technical tables) fill in
   * whenever the raw group table carries no readable name (the norm on real
   * saves). ChangeType names from the save's own enum table. */
  const resolvedLabels = resolveGroupLabels(db);
  const changeTypeNames = new Map<number, string>();
  const ctEnum = readTable(db, 'Regulations_Enum_ChangeType');
  if (ctEnum.present) {
    const vIdx = colIndex(ctEnum.columns, 'Value');
    const nIdx = colIndex(ctEnum.columns, 'Name');
    if (vIdx >= 0 && nIdx >= 0) {
      for (const row of ctEnum.rows) {
        const v = readNum(row, vIdx);
        const n = readStr(row, nIdx);
        if (v != null && n != null && !changeTypeNames.has(v)) changeTypeNames.set(v, n);
      }
    }
  }

  const propGroups = readTable(db, PROPOSAL_GROUPS_TABLE);
  const pgMap = buildColumnMap(propGroups.columns, PROPOSAL_GROUP_CANDIDATES);
  const groupsByProposal = new Map<number, number[]>();
  if (propGroups.present && pgMap.proposalId && pgMap.groupId) {
    const pIdx = colIndex(propGroups.columns, pgMap.proposalId);
    const gIdx = colIndex(propGroups.columns, pgMap.groupId);
    for (const row of propGroups.rows) {
      const proposalId = readNum(row, pIdx);
      const groupId = readNum(row, gIdx);
      if (proposalId == null || groupId == null) continue;
      const list = groupsByProposal.get(proposalId) ?? [];
      list.push(groupId);
      groupsByProposal.set(proposalId, list);
    }
  }

  const proposals: RegulationProposal[] = prop.present
    ? prop.rows.flatMap((row) => {
        const idIdx = colIndex(prop.columns, pMap.proposalId);
        const proposalId = readNum(row, idIdx);
        if (proposalId == null) return [];
        const changes: RegulationChangeRow[] = (groupsByProposal.get(proposalId) ?? []).map(
          (groupId) => ({
            groupId,
            label:
              labelByGroup.get(groupId) ??
              resolvedLabels.get(groupId) ??
              `Nhóm thay đổi #${groupId} (chi tiết không có trong save)`,
          }),
        );
        const changeType = pMap.changeType
          ? readNum(row, colIndex(prop.columns, pMap.changeType))
          : undefined;
        return [
          {
            proposalId,
            changeType,
            changeTypeLabel: changeType != null ? changeTypeNames.get(changeType) : undefined,
            seasonId: readNum(row, colIndex(prop.columns, pMap.seasonId)),
            state: readNum(row, colIndex(prop.columns, pMap.state)),
            title: pMap.title
              ? readStr(row, colIndex(prop.columns, pMap.title))
              : undefined,
            votes: votesByProposal.get(proposalId) ?? [],
            changes,
          },
        ];
      })
    : [];

  return {
    proposals,
    tablesPresent: {
      proposals: prop.present,
      votes: votes.present,
      changeGroups: groups.present,
    },
  };
}
