/**
 * Regulation vote fix tests — v0.6.0 step 6 (prompt §6).
 *
 * Locked against the project owner's verified Miami 2027 save reading of
 * Regulations_TeamVotes (autosave-3.sav): the table has NO Vote/YES-NO
 * column — GroupID is the option group the team chose. Real tallies:
 *   #1: 8 teams → RearWing Major 02 vs 3 → 01
 *   #4: 8 → Airflow Minor 02 vs 3 → 01
 *   #5: 7/7 High Engine Limits · #6: 9/9 Alt Prize Share
 *   #7: 6 → Chassis Redesign 02 vs 5 → 01 (player voted group 35 = 02)
 *   #2: 0 phiếu · #3: 1 phiếu (player only, nhóm 6)
 * Recommendations take TargetSeason >= current season ordered by VoteDay
 * DESC → #7, #6, #5 (the old slice(0,3) served decided 2026 proposals).
 *
 * Parser level: a real-schema in-memory SQLite DB locks GroupID → vote,
 * VoteDay/TargetSeason mapping and the LocKey label formatting.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import initSqlJs from 'sql.js';
import path from 'node:path';
import { buildRegulations } from '@/engines/regulation.engine';
import { getRegulations, formatLocKey } from '@/parser/repositories/regulations.repo';
import type { SqlJsDatabase } from '@/parser/sqlite/sqljs-loader';
import type { SaveModel, RegulationProposal } from '@/domain/types';
import { emptyPhase2Sections } from '../helpers/model';

const PLAYER_TEAM_ID = 32;
const SEASON = 2027;

function makeModel(regulations: RegulationProposal[]): SaveModel {
  return {
    meta: {
      id: 'fixture', fileName: 'autosave-3.sav', fileSizeBytes: 1,
      gameVersion: 'F1M24', saveGameVersion: 3, parsedAt: '2026-01-01T00:00:00Z',
      seasonId: SEASON, day: 46524, playerTeamId: PLAYER_TEAM_ID,
      tablesPresent: [], tablesMissing: [], warnings: [],
    },
    player: { teamId: PLAYER_TEAM_ID, teamName: 'CustomTeam', customTeamEnabled: true },
    teams: [
      { teamId: PLAYER_TEAM_ID, teamName: 'CustomTeam', isCustomTeam: true, formula: 0 },
      { teamId: 1, teamName: 'Red Bull Racing', isCustomTeam: false, formula: 0 },
    ],
    drivers: [], staff: [], seasons: [], races: [],
    standings: { drivers: [], teams: [] },
    tyres: [],
    ...emptyPhase2Sections(),
    regulations,
    availability: [],
  };
}

/* Miami-shaped proposals (labels already LocKey-formatted, as the repo emits) */
const groups = (a: string, b: string) => [
  { groupId: 34, label: a },
  { groupId: 35, label: b },
];
const votesFor = (counts: { teamId: number; groupId: number }[]): RegulationProposal['votes'] =>
  counts.map((c) => ({ teamId: c.teamId, groupId: c.groupId }));

const MIAMI_PROPOSALS: RegulationProposal[] = [
  {
    proposalId: 1,
    targetSeason: 2026, // decided last season — NOT in the recs
    voteDay: 46015,
    changes: groups('Rear Wing Major — bản 01', 'Rear Wing Major — bản 02'),
    votes: [
      ...votesFor(Array.from({ length: 3 }, (_, i) => ({ teamId: 100 + i, groupId: 34 }))),
      ...votesFor(Array.from({ length: 8 }, (_, i) => ({ teamId: 200 + i, groupId: 35 }))),
    ],
  },
  {
    proposalId: 7,
    targetSeason: 2028, // the live law — VoteDay 46482, Suzuka
    voteDay: 46482,
    changes: groups('Chassis Redesign — bản 01', 'Chassis Redesign — bản 02'),
    votes: [
      ...votesFor(Array.from({ length: 5 }, (_, i) => ({ teamId: 300 + i, groupId: 34 }))),
      ...votesFor(Array.from({ length: 5 }, (_, i) => ({ teamId: 400 + i, groupId: 35 }))),
      { teamId: PLAYER_TEAM_ID, groupId: 35 }, // the player chose 02 (6th vote)
    ],
  },
  {
    proposalId: 6,
    targetSeason: 2028,
    voteDay: 46400,
    changes: [{ groupId: 41, label: 'Alt Prize Share' }],
    votes: votesFor(Array.from({ length: 9 }, (_, i) => ({ teamId: 500 + i, groupId: 41 }))),
  },
  {
    proposalId: 5,
    targetSeason: 2027,
    voteDay: 46300,
    changes: [{ groupId: 52, label: 'High Engine Limits' }],
    votes: votesFor(Array.from({ length: 7 }, (_, i) => ({ teamId: 600 + i, groupId: 52 }))),
  },
  {
    proposalId: 4,
    targetSeason: 2026,
    voteDay: 46118,
    changes: groups('Airflow Minor — bản 01', 'Airflow Minor — bản 02'),
    votes: [
      ...votesFor(Array.from({ length: 3 }, (_, i) => ({ teamId: 700 + i, groupId: 34 }))),
      ...votesFor(Array.from({ length: 8 }, (_, i) => ({ teamId: 800 + i, groupId: 35 }))),
    ],
  },
  {
    proposalId: 2,
    targetSeason: 2026,
    voteDay: 46000,
    changes: groups('Something — bản 01', 'Something — bản 02'),
    votes: [],
  },
  {
    proposalId: 3,
    targetSeason: 2026,
    voteDay: 46005,
    changes: [{ groupId: 6, label: 'Budget Key — bản 06' }],
    votes: [{ teamId: PLAYER_TEAM_ID, groupId: 6 }],
  },
];

describe('buildRegulations — Miami vote tallies (v0.6.0 locks)', () => {
  const result = buildRegulations(makeModel(MIAMI_PROPOSALS));
  const byId = (id: number) => result.data.proposals.find((p) => p.proposalId === id)!;

  it('#1 tallies 8 vs 3 across the two option groups', () => {
    const p = byId(1);
    expect(p.totalVotes).toBe(11);
    const t02 = p.tally.find((t) => t.groupId === 35)!;
    const t01 = p.tally.find((t) => t.groupId === 34)!;
    expect(t02.votes).toBe(8);
    expect(t02.label).toBe('Rear Wing Major — bản 02');
    expect(t01.votes).toBe(3);
    expect(t01.label).toBe('Rear Wing Major — bản 01');
  });

  it('#7 tallies 6–5, the player voted group 35 (Chassis Redesign 02)', () => {
    const p = byId(7);
    expect(p.tally.find((t) => t.groupId === 35)!.votes).toBe(6);
    expect(p.tally.find((t) => t.groupId === 34)!.votes).toBe(5);
    expect(p.playerGroupId).toBe(35);
    expect(p.tally.find((t) => t.groupId === 35)!.isPlayerChoice).toBe(true);
    expect(p.tally.find((t) => t.groupId === 34)!.isPlayerChoice).toBe(false);
    // proposal title comes from the option LocKey base — no "Đề xuất không tên"
    expect(p.title).toBe('Chassis Redesign');
  });

  it('#2 shows 0 votes, #3 shows the player as the only voter', () => {
    const p2 = byId(2);
    expect(p2.totalVotes).toBe(0);
    expect(p2.tally.map((t) => t.votes)).toEqual([0, 0]);
    const p3 = byId(3);
    expect(p3.totalVotes).toBe(1);
    expect(p3.tally[0].groupId).toBe(6);
    expect(p3.tally[0].isPlayerChoice).toBe(true);
    expect(p3.playerGroupId).toBe(6);
  });

  it('recommendations = TargetSeason >= 2027 ordered by VoteDay DESC → #7, #6, #5', () => {
    const recIds = result.recommendations
      .filter((r) => r.id.startsWith('regulation-vote-'))
      .map((r) => r.id);
    expect(recIds).toEqual([
      'regulation-vote-7',
      'regulation-vote-6',
      'regulation-vote-5',
    ]);
    const rec7 = result.recommendations.find((r) => r.id === 'regulation-vote-7')!;
    expect(rec7.why).toContain('6 đội chọn Chassis Redesign — bản 02 vs 5 đội chọn Chassis Redesign — bản 01');
    expect(rec7.why).toContain('mùa 2028');
    expect(rec7.action).toContain('Chassis Redesign — bản 02');
  });

  it('unanimous proposals read "N đội chọn X"', () => {
    const rec6 = result.recommendations.find((r) => r.id === 'regulation-vote-6')!;
    expect(rec6.why).toContain('9 đội chọn Alt Prize Share');
  });
});

describe('buildRegulations — legacy YES/NO schema still tallies', () => {
  it('votes without groupId keep the vote=1=YES tally', () => {
    const model = makeModel([
      {
        proposalId: 3,
        title: 'Aero cap cut',
        seasonId: 2024,
        votes: [
          { teamId: 1, vote: 1 },
          { teamId: 2, vote: 0 },
          { teamId: PLAYER_TEAM_ID, vote: 1 },
        ],
        changes: [{ groupId: 9, label: 'Downforce -5%' }],
      },
    ]);
    const regs = buildRegulations(model);
    const p = regs.data.proposals[0];
    expect(p.yes).toBe(2);
    expect(p.no).toBe(1);
    expect(p.playerVote).toBe(1);
    expect(p.totalVotes).toBe(0); // no group votes — the tally stays empty
    const rec = regs.recommendations.find((r) => r.id === 'regulation-vote-3');
    expect(rec?.why).toContain('2 YES / 1 NO');
  });
});

/* ── parser level: the real schema through getRegulations ────────────────── */

const WASM = path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
let SQL: Awaited<ReturnType<typeof initSqlJs>>;
beforeAll(async () => {
  SQL = await initSqlJs({ locateFile: () => WASM });
});
function dbFrom(statements: string[]): SqlJsDatabase {
  const db = new SQL.Database();
  for (const s of statements) db.exec(s);
  return db;
}

describe('getRegulations — GroupID votes + VoteDay/TargetSeason (Miami schema)', () => {
  it('reads GroupID as the vote and formats LocKey labels', () => {
    const db = dbFrom([
      `CREATE TABLE Regulations_Proposals (ProposalID INTEGER, ChangeType INTEGER, VoteDay INTEGER, TargetSeason INTEGER);`,
      `INSERT INTO Regulations_Proposals VALUES (7, 2, 46482, 2028);`,
      `CREATE TABLE Regulations_TeamVotes (ProposalID INTEGER, TeamID INTEGER, GroupID INTEGER);`,
      `INSERT INTO Regulations_TeamVotes VALUES (7, 32, 35);`,
      `INSERT INTO Regulations_TeamVotes VALUES (7, 1, 35);`,
      `INSERT INTO Regulations_TeamVotes VALUES (7, 2, 34);`,
      `CREATE TABLE Regulations_ChangeGroups (Regulations_ChangeGroupsID INTEGER, LocKey TEXT);`,
      `INSERT INTO Regulations_ChangeGroups VALUES (34, 'ChassisRedesign_01');`,
      `INSERT INTO Regulations_ChangeGroups VALUES (35, 'ChassisRedesign_02');`,
      `CREATE TABLE Regulations_Proposals_ChangeGroups (ProposalID INTEGER, GroupID INTEGER);`,
      `INSERT INTO Regulations_Proposals_ChangeGroups VALUES (7, 34);`,
      `INSERT INTO Regulations_Proposals_ChangeGroups VALUES (7, 35);`,
      `CREATE TABLE Regulations_Enum_ChangeType (Value INTEGER, Name TEXT);`,
      `INSERT INTO Regulations_Enum_ChangeType VALUES (2, 'Major Sporting');`,
    ]);
    const regs = getRegulations(db);
    const p = regs.proposals.find((x) => x.proposalId === 7)!;
    // every vote row carries its GroupID; no Vote column exists
    expect(p.votes).toEqual([
      { teamId: 32, groupId: 35 },
      { teamId: 1, groupId: 35 },
      { teamId: 2, groupId: 34 },
    ]);
    expect(p.targetSeason).toBe(2028);
    expect(p.voteDay).toBe(46482);
    expect(p.changes.map((c) => c.label)).toEqual([
      'Chassis Redesign — bản 01',
      'Chassis Redesign — bản 02',
    ]);
  });

  it('degrades cleanly when the votes table is missing', () => {
    const db = dbFrom(['CREATE TABLE Races (RaceID INTEGER);']);
    const regs = getRegulations(db);
    expect(regs.proposals).toEqual([]);
  });
});

describe('formatLocKey — LocKey shapes verified on the Miami save', () => {
  it('formats variant suffixes and camel/underscore names', () => {
    expect(formatLocKey('RearWing_Major_02')).toBe('Rear Wing Major — bản 02');
    expect(formatLocKey('ChassisRedesign_02')).toBe('Chassis Redesign — bản 02');
    expect(formatLocKey('HighEngineLimits')).toBe('High Engine Limits');
    expect(formatLocKey('AltPrizeShare')).toBe('Alt Prize Share');
    expect(formatLocKey('AirflowMinor_02')).toBe('Airflow Minor — bản 02');
  });

  it('leaves human-readable labels untouched', () => {
    expect(formatLocKey('Downforce -5%')).toBe('Downforce -5%');
    expect(formatLocKey('Luật phi kỹ thuật')).toBe('Luật phi kỹ thuật');
  });
});
