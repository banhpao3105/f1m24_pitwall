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

const PROPOSALS_TABLE = 'Regulations_Proposals';
const VOTES_TABLE = 'Regulations_TeamVotes';
const GROUPS_TABLE = 'Regulations_ChangeGroups';
const PROPOSAL_GROUPS_TABLE = 'Regulations_Proposals_ChangeGroups';

const PROPOSAL_CANDIDATES: Record<string, string[]> = {
  proposalId: pkCandidates(PROPOSALS_TABLE),
  seasonId: ['SeasonID'],
  state: ['State', 'ProposalState', 'Status'],
  title: ['Title', 'Name', 'Description'],
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
          (groupId) => ({ groupId, label: labelByGroup.get(groupId) }),
        );
        return [
          {
            proposalId,
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
