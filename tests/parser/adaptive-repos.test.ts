/**
 * Schema-adaptive repository tests — Phase 2.
 *
 * Strategy: build a real in-memory SQLite DB (sql.js) with BOTH a
 * "verified-name" schema and a "different-name" schema, then assert that:
 *   1. Verified candidate columns map and produce correct values.
 *   2. Alternative column names map (case-insensitive, variants).
 *   3. Missing tables/columns degrade to empty output — never throw.
 * This locks the adaptive contract BEFORE we can re-verify against a real
 * save with the introspect script.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import initSqlJs from 'sql.js';
import path from 'node:path';
import { getPartsSnapshot, normalizeCondition, isSupplierPartType } from '@/parser/repositories/parts.repo';
import { getFinanceSnapshot } from '@/parser/repositories/finance.repo';
import { getStaffDetail } from '@/parser/repositories/staff-detail.repo';
import { getRegulations } from '@/parser/repositories/regulations.repo';
import { getQualifyingResults } from '@/parser/repositories/quali.repo';
import { buildColumnMap } from '@/parser/repositories/adaptive';
import type { SqlJsDatabase } from '@/parser/sqlite/sqljs-loader';

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

const EMPTY_AS_SENTINEL = '___empty___';

/* ── adaptive core ───────────────────────────────────────────────────────── */

describe('buildColumnMap', () => {
  it('maps concepts case-insensitively and keeps first candidate order', () => {
    const map = buildColumnMap(['TeamID', 'salary'], {
      teamId: ['TeamID'],
      salary: ['Salary', 'Wage'],
    });
    expect(map.teamId).toBe('TeamID');
    expect(map.salary).toBe('salary');
  });

  it('skips concepts with no existing candidate column', () => {
    const map = buildColumnMap(['A'], { x: ['X'], y: ['Y'] });
    expect(map.x).toBeUndefined();
    expect(map.y).toBeUndefined();
  });
});

/* ── parts ───────────────────────────────────────────────────────────────── */

describe('getPartsSnapshot', () => {
  it('maps designs, stat values, items, loadouts and expertise', () => {
    const db = dbFrom([
      `CREATE TABLE Parts_Designs (Parts_DesignsID INTEGER, TeamID INTEGER, PartType TEXT, Name TEXT, Status INTEGER, Points INTEGER, Cost INTEGER, BuildDays INTEGER);`,
      `INSERT INTO Parts_Designs VALUES (11, 1, 'FrontWing', 'FW Mk3', 2, 120, 900000, 30);`,
      `CREATE TABLE Parts_Designs_StatValues (Parts_DesignsID INTEGER, Stat TEXT, Value REAL);`,
      `INSERT INTO Parts_Designs_StatValues VALUES (11, 'Airflow', 78.5);`,
      `CREATE TABLE Parts_Items (Parts_ItemsID INTEGER, Parts_DesignsID INTEGER, CarID INTEGER, TeamID INTEGER, PartType TEXT, Condition REAL, FaultCount INTEGER);`,
      `INSERT INTO Parts_Items VALUES (5, 11, 2, 1, 'FrontWing', 0.72, 1);`,
      `CREATE TABLE Parts_CarLoadout (CarID INTEGER, Parts_ItemsID INTEGER, SlotType TEXT);`,
      `INSERT INTO Parts_CarLoadout VALUES (2, 5, 'FrontWing');`,
      `CREATE TABLE Parts_TeamExpertise (TeamID INTEGER, PartType TEXT, Expertise REAL, NextSeasonExpertise REAL);`,
      `INSERT INTO Parts_TeamExpertise VALUES (1, 'FrontWing', 61.5, 12.25);`,
    ]);
    const snap = getPartsSnapshot(db);
    expect(snap.tablesPresent).toEqual({
      designs: true, items: true, statValues: true, loadouts: true, expertise: true,
    });
    expect(snap.designs).toHaveLength(1);
    expect(snap.designs[0]).toMatchObject({ designId: 11, teamId: 1, points: 120, cost: 900000, buildDays: 30 });
    expect(snap.designs[0].stats).toEqual([{ name: 'Airflow', value: 78.5 }]);
    expect(snap.items[0]).toMatchObject({ itemId: 5, designId: 11, carId: 2, condition: 0.72, faultCount: 1 });
    expect(snap.loadouts[0]).toEqual({ carId: 2, itemId: 5, slot: 'FrontWing' });
    expect(snap.expertise[0]).toMatchObject({ teamId: 1, nextSeasonExpertise: 12.25 });
  });

  it('returns empty structures when tables are missing (degradation)', () => {
    const db = dbFrom(['CREATE TABLE Races (RaceID INTEGER);']);
    const snap = getPartsSnapshot(db);
    expect(snap.designs).toEqual([]);
    expect(snap.items).toEqual([]);
    expect(snap.expertise).toEqual([]);
    expect(snap.tablesPresent.designs).toBe(false);
  });

  it('0.4.1 regression: maps the F1M24 singular PK convention (DesignID/ItemID)', () => {
    // Real 1.11.0 schema — the old "<Table>ID" pkCandidates missed these
    // entirely, dropping EVERY design/item row (Car Lab looked degraded).
    const db = dbFrom([
      `CREATE TABLE Parts_Designs (DesignID INTEGER, TeamID INTEGER, PartType INTEGER);`,
      `INSERT INTO Parts_Designs VALUES (11, 1, 7);`,
      `CREATE TABLE Parts_Items (ItemID INTEGER, DesignID INTEGER, Condition REAL);`,
      `INSERT INTO Parts_Items VALUES (5, 11, 0.9);`,
    ]);
    const snap = getPartsSnapshot(db);
    expect(snap.designs).toHaveLength(1);
    expect(snap.designs[0]).toMatchObject({ designId: 11, teamId: 1 });
    expect(snap.items).toHaveLength(1);
    expect(snap.items[0]).toMatchObject({ itemId: 5, designId: 11, condition: 0.9 });
  });

  it('coerces numeric part types to strings', () => {
    const db = dbFrom([
      `CREATE TABLE Parts_Designs (Parts_DesignsID INTEGER, TeamID INTEGER, PartType INTEGER);`,
      `INSERT INTO Parts_Designs VALUES (1, 3, 7);`,
    ]);
    const snap = getPartsSnapshot(db);
    // 0.4.1: numeric types without a Parts_Enum_Type table get a readable
    // placeholder instead of a bare number.
    expect(snap.designs[0].partType).toBe('PartType 7');
  });

  it('resolves numeric part types via the save enum table (0.4.1)', () => {
    const db = dbFrom([
      `CREATE TABLE Parts_Designs (DesignID INTEGER, TeamID INTEGER, PartType INTEGER);`,
      `CREATE TABLE Parts_Enum_Type (Value INTEGER, Name TEXT);`,
      `INSERT INTO Parts_Designs VALUES (1, 3, 7);`,
      `INSERT INTO Parts_Enum_Type VALUES (7, 'FrontWing');`,
    ]);
    const snap = getPartsSnapshot(db);
    expect(snap.designs[0].partType).toBe('FrontWing');
  });

  it('normalizes condition from 0..100 scale and rejects unknown scales', () => {
    expect(normalizeCondition(0.72)).toBe(0.72);
    expect(normalizeCondition(72)).toBeCloseTo(0.72, 6);
    expect(normalizeCondition(150)).toBeUndefined();
    expect(normalizeCondition(undefined)).toBeUndefined();
  });

  it('detects supplier part keywords only from labels (docs/03 §5.5)', () => {
    expect(isSupplierPartType('Engine')).toBe(true);
    expect(isSupplierPartType('ERS')).toBe(true);
    expect(isSupplierPartType('Gearbox')).toBe(true);
    expect(isSupplierPartType('FrontWing')).toBe(false);
    expect(isSupplierPartType(undefined)).toBe(false);
  });
});

/* ── finance ─────────────────────────────────────────────────────────────── */

describe('getFinanceSnapshot', () => {
  it('keeps the latest balance row per team and maps transactions', () => {
    const db = dbFrom([
      `CREATE TABLE Finance_TeamBalance (TeamID INTEGER, Day INTEGER, Balance INTEGER, Budget INTEGER);`,
      `INSERT INTO Finance_TeamBalance VALUES (1, 10, 1000000, 5000000);`,
      `INSERT INTO Finance_TeamBalance VALUES (1, 25, 850000, 5000000);`,
      `INSERT INTO Finance_TeamBalance VALUES (2, 25, 3000000, 5000000);`,
      `CREATE TABLE Finance_Transactions (Finance_TransactionsID INTEGER, TeamID INTEGER, Day INTEGER, Amount INTEGER, TransactionType TEXT, Description TEXT);`,
      `INSERT INTO Finance_Transactions VALUES (1, 1, 12, -250000, 'Design', 'FW project');`,
    ]);
    const fin = getFinanceSnapshot(db);
    const team1 = fin.latestBalance.find((b) => b.teamId === 1);
    expect(team1).toMatchObject({ balance: 850000, budget: 5000000, day: 25 });
    expect(fin.transactions).toHaveLength(1);
    expect(fin.transactions[0]).toMatchObject({ amount: -250000, category: 'Design' });
  });

  it('degrades when finance tables are missing', () => {
    const db = dbFrom(['CREATE TABLE Races (RaceID INTEGER);']);
    const fin = getFinanceSnapshot(db);
    expect(fin.latestBalance).toEqual([]);
    expect(fin.transactions).toEqual([]);
    expect(fin.tablesPresent).toEqual({ balance: false, transactions: false });
  });

  it('0.4.1 regression: keeps transactions when the table has no PK column', () => {
    // Real 1.11.0 Finance_Transactions: TeamID, Day, Value, TransactionType,
    // Reference, AffectsCostCap — no id column. The old `txId == null → skip`
    // dropped EVERY transaction (finance snapshot was permanently empty).
    const db = dbFrom([
      `CREATE TABLE Finance_TeamBalance (TeamID INTEGER, Balance INTEGER);`,
      `INSERT INTO Finance_TeamBalance VALUES (1, 20000000);`,
      `CREATE TABLE Finance_Transactions (TeamID INTEGER, Day INTEGER, Value INTEGER, TransactionType INTEGER);`,
      `INSERT INTO Finance_Transactions VALUES (1, 12, -14400000, 22);`,
      `INSERT INTO Finance_Transactions VALUES (1, 13, -2000000, 9);`,
      `CREATE TABLE Finance_Enum_TransactionType (TransactionType INTEGER, Name TEXT);`,
      `INSERT INTO Finance_Enum_TransactionType VALUES (22, 'PartDesign');`,
      `INSERT INTO Finance_Enum_TransactionType VALUES (9, 'PartManufacture');`,
    ]);
    const fin = getFinanceSnapshot(db);
    expect(fin.transactions).toHaveLength(2);
    expect(fin.transactions[0]).toMatchObject({ teamId: 1, amount: -14400000, category: 'PartDesign' });
    expect(fin.transactions[1].category).toBe('PartManufacture');
  });
});

/* ── staff detail ────────────────────────────────────────────────────────── */

describe('getStaffDetail', () => {
  it('maps contracts, performance and patience rows', () => {
    const db = dbFrom([
      `CREATE TABLE Staff_Contracts (StaffID INTEGER, TeamID INTEGER, ContractType INTEGER, Salary INTEGER, EndDay INTEGER, Duration INTEGER);`,
      `INSERT INTO Staff_Contracts VALUES (7, 1, 0, 1250000, 340, 360);`,
      `INSERT INTO Staff_Contracts VALUES (8, 2, 2, 400000, 350, 360);`,
      `CREATE TABLE Staff_PerformanceStats (StaffID INTEGER, Rating INTEGER, Morale INTEGER);`,
      `INSERT INTO Staff_PerformanceStats VALUES (7, 84, 66);`,
      `CREATE TABLE Staff_ContractPatience (StaffID INTEGER, Suitability REAL, Opinion REAL, Threshold REAL);`,
      `INSERT INTO Staff_ContractPatience VALUES (8, 0.55, 0.4, 0.2);`,
    ]);
    const staff = getStaffDetail(db);
    expect(staff.contracts).toHaveLength(2);
    expect(staff.contracts[0]).toMatchObject({ staffId: 7, teamId: 1, contractType: 0, salary: 1250000, endDay: 340 });
    expect(staff.performance[0]).toMatchObject({ staffId: 7, rating: 84, morale: 66 });
    expect(staff.patience[0]).toMatchObject({ staffId: 8, threshold: 0.2 });
  });

  it('0.4.1: maps patience TeamID + verified F1M24 rating columns', () => {
    // Real 1.11.0 Staff_ContractPatience: one row per (StaffID, TeamID) with
    // SuitabilityRating / TeamOpinionRating / ContractAcceptanceThreshold.
    const db = dbFrom([
      `CREATE TABLE Staff_ContractPatience (StaffID INTEGER, TeamID INTEGER, SuitabilityRating INTEGER, TeamOpinionRating INTEGER, ContractAcceptanceThreshold REAL);`,
      `INSERT INTO Staff_ContractPatience VALUES (7, 1, 41, 89, 0.657);`,
      `INSERT INTO Staff_ContractPatience VALUES (7, 2, 12, 30, 0.9);`,
    ]);
    const staff = getStaffDetail(db);
    expect(staff.patience).toHaveLength(2);
    expect(staff.patience[0]).toMatchObject({
      staffId: 7, teamId: 1, suitability: 41, opinion: 89, threshold: 0.657,
    });
  });

  it('degrades when staff detail tables are missing', () => {
    const db = dbFrom([EMPTY_AS_SENTINEL].map(() => 'CREATE TABLE Races (RaceID INTEGER);'));
    const staff = getStaffDetail(db);
    expect(staff.contracts).toEqual([]);
    expect(staff.tablesPresent).toEqual({ contracts: false, performance: false, patience: false });
  });
});

/* ── regulations ─────────────────────────────────────────────────────────── */

describe('getRegulations', () => {
  it('joins proposals with votes and change-group labels', () => {
    const db = dbFrom([
      `CREATE TABLE Regulations_Proposals (Regulations_ProposalsID INTEGER, SeasonID INTEGER, State INTEGER, Title TEXT);`,
      `INSERT INTO Regulations_Proposals VALUES (3, 2, 1, 'Aero cap reduction');`,
      `CREATE TABLE Regulations_TeamVotes (Regulations_ProposalsID INTEGER, TeamID INTEGER, Vote INTEGER);`,
      `INSERT INTO Regulations_TeamVotes VALUES (3, 1, 1);`,
      `INSERT INTO Regulations_TeamVotes VALUES (3, 2, 0);`,
      `CREATE TABLE Regulations_ChangeGroups (Regulations_ChangeGroupsID INTEGER, Name TEXT);`,
      `INSERT INTO Regulations_ChangeGroups VALUES (9, 'Downforce -5%');`,
      `CREATE TABLE Regulations_Proposals_ChangeGroups (Regulations_ProposalsID INTEGER, Regulations_ChangeGroupsID INTEGER);`,
      `INSERT INTO Regulations_Proposals_ChangeGroups VALUES (3, 9);`,
    ]);
    const regs = getRegulations(db);
    expect(regs.proposals).toHaveLength(1);
    const p = regs.proposals[0];
    expect(p.proposalId).toBe(3);
    expect(p.title).toBe('Aero cap reduction');
    expect(p.votes).toEqual([
      { teamId: 1, vote: 1 },
      { teamId: 2, vote: 0 },
    ]);
    expect(p.changes).toEqual([{ groupId: 9, label: 'Downforce -5%' }]);
  });

  it('degrades when regulations tables are missing', () => {
    const db = dbFrom(['CREATE TABLE Races (RaceID INTEGER);']);
    const regs = getRegulations(db);
    expect(regs.proposals).toEqual([]);
    expect(regs.tablesPresent.proposals).toBe(false);
  });
});

/* ── qualifying ──────────────────────────────────────────────────────────── */

describe('getQualifyingResults', () => {
  it('maps core quali columns', () => {
    const db = dbFrom([
      `CREATE TABLE Races_QualifyingResults (RaceID INTEGER, DriverID INTEGER, TeamID INTEGER, FinishingPos INTEGER, QualifyingStage INTEGER, ChampionshipPoints INTEGER);`,
      `INSERT INTO Races_QualifyingResults VALUES (50, 1, 1, 3, 3, 0);`,
      `INSERT INTO Races_QualifyingResults VALUES (50, 2, 2, 8, 3, 0);`,
    ]);
    const quali = getQualifyingResults(db);
    expect(quali).toHaveLength(2);
    expect(quali[0]).toMatchObject({ raceId: 50, driverId: 1, finishingPos: 3, qualifyingStage: 3 });
  });

  it('returns [] when the table or concept columns are missing', () => {
    const missing = dbFrom(['CREATE TABLE Races (RaceID INTEGER);']);
    expect(getQualifyingResults(missing)).toEqual([]);
    const broken = dbFrom([
      `CREATE TABLE Races_QualifyingResults (RaceID INTEGER, DriverID INTEGER);`,
      `INSERT INTO Races_QualifyingResults VALUES (1, 2);`,
    ]);
    expect(getQualifyingResults(broken)).toEqual([]);
  });
});
