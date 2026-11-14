/**
 * Finance + Regulation engine unit tests — Phase 2.
 */

import { describe, it, expect } from 'vitest';
import { buildFinance, computeExpertiseBank } from '@/engines/finance.engine';
import { buildRegulations } from '@/engines/regulation.engine';
import type { SaveModel } from '@/domain/types';
import { emptyPhase2Sections } from '../helpers/model';

function makeModel(overrides: Partial<SaveModel> = {}): SaveModel {
  return {
    meta: {
      id: 'test', fileName: 'test.sav', fileSizeBytes: 1,
      gameVersion: 'F1M24', saveGameVersion: 3, parsedAt: '2026-01-01T00:00:00Z',
      seasonId: 2024, day: 150, playerTeamId: 1,
      tablesPresent: [], tablesMissing: [], warnings: [],
    },
    player: { teamId: 1, teamName: 'Player Racing', customTeamEnabled: false },
    teams: [
      { teamId: 1, teamName: 'Player Racing', isCustomTeam: false, formula: 1 },
      { teamId: 2, teamName: 'Rival Racing', isCustomTeam: false, formula: 1 },
      { teamId: 3, teamName: 'Third Racing', isCustomTeam: false, formula: 1 },
    ],
    drivers: [],
    staff: [],
    seasons: [],
    races: [],
    standings: {
      drivers: [],
      teams: [
        { position: 1, id: 2, name: 'Rival Racing', points: 200 },
        { position: 2, id: 1, name: 'Player Racing', points: 100 },
        { position: 3, id: 3, name: 'Third Racing', points: 50 },
      ],
    },
    tyres: [],
    ...emptyPhase2Sections(),
    availability: [],
    ...overrides,
  };
}

describe('buildFinance', () => {
  it('aggregates spend by category and computes cost per point', () => {
    const model = makeModel({
      finance: {
        balance: 4_500_000,
        budget: 10_000_000,
        transactions: [
          { txId: 1, teamId: 1, day: 10, amount: -1_000_000, category: 'Design' },
          { txId: 2, teamId: 1, day: 20, amount: -500_000, category: 'Salary' },
          { txId: 3, teamId: 1, day: 25, amount: 2_000_000, category: 'Prize' },
          { txId: 4, teamId: 2, day: 25, amount: -9_999_999, category: 'Design' }, // excluded
        ],
        tablesPresent: { balance: true, transactions: true },
      },
    });
    const fin = buildFinance(model);
    expect(fin.data.balance).toBe(4_500_000);
    expect(fin.data.totalSpend).toBe(1_500_000);
    expect(fin.data.totalIncome).toBe(2_000_000);
    expect(fin.data.costPerPoint).toBe(15_000); // 1.5M / 100 pts
    const cats = new Map(fin.data.spendByCategory.map((s) => [s.category, s.total]));
    expect(cats.get('Design')).toBe(-1_000_000);
    expect(cats.get('Salary')).toBe(-500_000);
    expect(fin.data.hasTransactions).toBe(true);
  });

  it('ranks expertise banks across teams', () => {
    const model = makeModel({
      parts: {
        ...emptyPhase2Sections().parts,
        expertise: [
          { teamId: 1, partType: 'FrontWing', nextSeasonExpertise: 20 },
          { teamId: 1, partType: 'Floor', nextSeasonExpertise: 10 },
          { teamId: 2, partType: 'FrontWing', nextSeasonExpertise: 45 },
          { teamId: 3, partType: 'FrontWing', nextSeasonExpertise: 15 },
        ],
        tablesPresent: { designs: false, items: false, statValues: false, loadouts: false, expertise: true },
      },
    });
    const bank = computeExpertiseBank(model);
    expect(bank[0]).toMatchObject({ teamId: 2, nextSeason: 45, rank: 1 });
    const fin = buildFinance(model);
    expect(fin.data.expertise.playerRank).toBe(2);
    expect(fin.data.expertise.playerNext).toBe(30);
    expect(fin.data.expertise.leagueMedianNext).toBe(30);
    const rec = fin.recommendations.find((r) => r.id === 'finance-expertise-bank');
    // HIGH requires finance data too — expertise-only fixture is MEDIUM.
    expect(rec?.confidence).toBe('MEDIUM');
  });

  it('degrades to LOW with explicit rec when no finance data', () => {
    const fin = buildFinance(makeModel());
    expect(fin.confidence).toBe('LOW');
    expect(fin.warnings).toContain('FINANCE_DATA_UNAVAILABLE');
    expect(fin.recommendations[0].id).toBe('finance-nodata');
    expect(fin.assumptions.some((a) => a.text.includes('Finance_*'))).toBe(true);
  });

  it('0.4.1 regression: all-zero league is NOT "above median"', () => {
    // Real-save shape (early season): every team banks 0 — median 0, player 0,
    // and the old `>=` check claimed "trên median" while the title said
    // "hạng 11/11". The rec must now word the tie and drop the wrong claim.
    const model = makeModel({
      parts: {
        ...emptyPhase2Sections().parts,
        expertise: [1, 2, 3].map((teamId) => ({
          teamId,
          partType: 'FrontWing',
          nextSeasonExpertise: 0,
        })),
        tablesPresent: { designs: false, items: false, statValues: false, loadouts: false, expertise: true },
      },
    });
    const fin = buildFinance(model);
    const rec = fin.recommendations.find((r) => r.id === 'finance-expertise-bank');
    expect(rec).toBeDefined();
    expect(rec?.title).toMatch(/Expertise bank mùa sau: 0 \(hạng \d\/3\)/);
    expect(rec?.action).not.toContain('trên median');
    expect(rec?.action).toContain('Cả giải chưa bank');
    expect(rec?.why).toContain('toàn bộ 3 đội đang bằng 0');
    expect(rec?.riskIfIgnored).toBeUndefined();
  });

  it('0.4.1: strictly above median keeps the "giữ bank" advice', () => {
    const model = makeModel({
      parts: {
        ...emptyPhase2Sections().parts,
        expertise: [
          { teamId: 1, partType: 'FrontWing', nextSeasonExpertise: 50 },
          { teamId: 2, partType: 'FrontWing', nextSeasonExpertise: 20 },
          { teamId: 3, partType: 'FrontWing', nextSeasonExpertise: 10 },
        ],
        tablesPresent: { designs: false, items: false, statValues: false, loadouts: false, expertise: true },
      },
    });
    const fin = buildFinance(model);
    const rec = fin.recommendations.find((r) => r.id === 'finance-expertise-bank');
    expect(rec?.action).toContain('Giữ bank');
  });
});

describe('buildRegulations', () => {
  it('counts votes under the documented vote=1=YES assumption', () => {
    const model = makeModel({
      regulations: [
        {
          proposalId: 3,
          title: 'Aero cap cut',
          state: 1,
          seasonId: 2024,
          votes: [
            { teamId: 1, vote: 1 },
            { teamId: 2, vote: 0 },
            { teamId: 3, vote: 1 },
          ],
          changes: [{ groupId: 9, label: 'Downforce -5%' }],
        },
      ],
    });
    const regs = buildRegulations(model);
    expect(regs.data.proposals[0]).toMatchObject({ yes: 2, no: 1, playerVote: 1 });
    expect(regs.data.proposals[0].changes).toEqual(['Downforce -5%']);
    expect(regs.data.hasVoteData).toBe(true);
    const rec = regs.recommendations.find((r) => r.id === 'regulation-vote-3');
    expect(rec?.why).toContain('2 YES / 1 NO');
  });

  it('still surfaces expertise banking on the Research page', () => {
    const model = makeModel({
      parts: {
        ...emptyPhase2Sections().parts,
        expertise: [
          { teamId: 1, nextSeasonExpertise: 40 },
          { teamId: 2, nextSeasonExpertise: 10 },
          { teamId: 3, nextSeasonExpertise: 25 },
        ],
        tablesPresent: { designs: false, items: false, statValues: false, loadouts: false, expertise: true },
      },
    });
    const regs = buildRegulations(model);
    const rec = regs.recommendations.find((r) => r.id === 'regulation-expertise-bank');
    expect(rec).toBeDefined();
    expect(regs.data.expertise.playerRank).toBe(1);
  });

  it('0.5.3 regression: all-zero league is NOT "above median" in Research either', () => {
    // Real-save shape (Bahrain Day 46495): bank 0, median 0, rank 11/11 —
    // the old `>=` produced "Bank đã trên median" in Research while Strategy
    // (finance, fixed in 0.4.1) worded the tie. Both views must agree now.
    const model = makeModel({
      parts: {
        ...emptyPhase2Sections().parts,
        expertise: [1, 2, 3].map((teamId) => ({
          teamId,
          partType: 'FrontWing',
          nextSeasonExpertise: 0,
        })),
        tablesPresent: { designs: false, items: false, statValues: false, loadouts: false, expertise: true },
      },
    });
    const regs = buildRegulations(model);
    const rec = regs.recommendations.find((r) => r.id === 'regulation-expertise-bank');
    expect(rec).toBeDefined();
    expect(rec?.title).toMatch(/Expertise banking cho mùa tới: 0 \(hạng \d\/3\)/);
    expect(rec?.action).not.toContain('trên median');
    expect(rec?.action).toContain('Cả giải chưa bank expertise nào');
    expect(rec?.confidence).toBe('MEDIUM');
  });

  it('0.5.3: strictly above median keeps the same advice as before', () => {
    const model = makeModel({
      parts: {
        ...emptyPhase2Sections().parts,
        expertise: [
          { teamId: 1, nextSeasonExpertise: 40 },
          { teamId: 2, nextSeasonExpertise: 10 },
          { teamId: 3, nextSeasonExpertise: 25 },
        ],
        tablesPresent: { designs: false, items: false, statValues: false, loadouts: false, expertise: true },
      },
    });
    const regs = buildRegulations(model);
    const rec = regs.recommendations.find((r) => r.id === 'regulation-expertise-bank');
    expect(rec?.action).toContain('Bank đã trên median');
  });

  it('0.5.3: tied at a non-zero median words the tie, no fake advantage', () => {
    const model = makeModel({
      parts: {
        ...emptyPhase2Sections().parts,
        expertise: [
          { teamId: 1, nextSeasonExpertise: 20 },
          { teamId: 2, nextSeasonExpertise: 10 },
          { teamId: 3, nextSeasonExpertise: 25 },
        ],
        tablesPresent: { designs: false, items: false, statValues: false, loadouts: false, expertise: true },
      },
    });
    const regs = buildRegulations(model);
    const rec = regs.recommendations.find((r) => r.id === 'regulation-expertise-bank');
    expect(rec?.action).toContain('Bằng median giải');
    expect(rec?.action).not.toContain('trên median');
  });

  it('degrades when no proposals exist', () => {
    const regs = buildRegulations(makeModel());
    expect(regs.warnings).toContain('REGULATION_DATA_UNAVAILABLE');
    expect(regs.recommendations[0].id).toBe('regulation-nodata');
  });
});
