/**
 * Test fixture builder — synthesizes a minimal, fully deterministic GVAS
 * save embedding a real SQLite database (built with sql.js at test time).
 *
 * This is the Phase 0 substitute for committing a real (personal) .sav:
 * docs/07-SYSTEM-PROMPT.md forbids committing saves with personal data.
 * The builder mirrors the byte layout verified against the real
 * F1M 24 save (build volta24+game+1.11.0).
 */

import initSqlJs from 'sql.js';
import { deflate } from 'pako';
import path from 'node:path';

export const SQL_WASM_PATH = path.join(
  process.cwd(),
  'node_modules',
  'sql.js',
  'dist',
  'sql-wasm.wasm',
);

export function locateSqlWasm(): string {
  return SQL_WASM_PATH;
}

function fstring(value: string): number[] {
  const bytes = Array.from(value, (c) => c.charCodeAt(0) & 0xff);
  return [...i32(bytes.length + 1), ...bytes, 0];
}

function i32(value: number): number[] {
  return [
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ];
}

function u16(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff];
}

/** IntProperty body: index i32 + pad u8 + value i32. */
function intPropertyBody(value: number): number[] {
  return [...i32(0), 0, ...i32(value)];
}

/** StrProperty body: 5 zero bytes + FString (unicode form). */
function strPropertyBody(value: string): number[] {
  const len = value.length;
  const encoded = value.split('').flatMap((c) => {
    const code = c.charCodeAt(0);
    return code > 0xff ? [0x3f] : [code]; // non-latin1 → '?' (test data is ASCII)
  });
  return [...i32(0), 0, ...i32(len + 1), ...encoded, 0];
}

export interface BuildSaveOptions {
  saveGameVersion?: number;
  buildId?: string;
  /** SQL statements executed on the embedded SQLite fixture. */
  sql: string[];
}

export interface BuiltSave {
  bytes: Uint8Array;
  databaseBytes: Uint8Array;
}

/**
 * Builds a complete F1M24-style save: GVAS header + two tagged properties +
 * "None" + the 5-int32 blob header + zlib(SQLite bytes).
 */
export async function buildGvasSave(options: BuildSaveOptions): Promise<BuiltSave> {
  const {
    saveGameVersion = 3,
    buildId = '++volta24+game+1.11.0',
    sql,
  } = options;

  const SQL = await initSqlJs({
    locateFile: () => SQL_WASM_PATH,
  });
  const db = new SQL.Database();
  for (const stmt of sql) db.run(stmt);
  const databaseBytes = db.export();
  db.close();

  const compressed = deflate(databaseBytes);

  const strLen = 'Pit Wall'.length;
  const header: number[] = [
    // magic
    0x47, 0x56, 0x41, 0x53, // "GVAS"
    ...i32(saveGameVersion),
    ...i32(522), // PackageVersion
    ...(saveGameVersion >= 3 ? [...i32(1008)] : []), // PackageFileVersionUE5
    ...u16(5), ...u16(1), ...u16(1), // Engine 5.1.1
    ...i32(498643), // Build
    ...fstring(buildId),
    ...i32(0), // CustomFormatVersion
    ...i32(0), // CustomFormatData.Count
    ...fstring('/Script/RaceGame.CareerSaveGame'),
    // properties
    ...fstring('m_testInt'),
    ...fstring('IntProperty'),
    ...i32(4),
    ...intPropertyBody(42),
    ...fstring('m_testStr'),
    ...fstring('StrProperty'),
    ...i32(strLen + 1 + 4),
    ...strPropertyBody('Pit Wall'),
    ...fstring('None'),
    // embedded blob header
    ...i32(0), // unknownZero
    ...i32(compressed.length), // totalSize
    ...i32(databaseBytes.length), // size1
    ...i32(databaseBytes.length), // size2
    ...i32(databaseBytes.length), // size3
    ...compressed,
  ];

  return { bytes: new Uint8Array(header), databaseBytes };
}

export const FIXTURE_SCHEMA_SQL = [
  'CREATE TABLE "Player" ("FirstName" TEXT, "LastName" TEXT, "TeamID" INTEGER, "CustomTeamEnabled" INTEGER)',
  'CREATE TABLE "Player_State" ("Day" INTEGER, "CurrentSeason" INTEGER)',
  'CREATE TABLE "Teams" ("TeamID" INTEGER, "TeamName" TEXT, "TeamNameLocKey" TEXT, "IsCustomTeam" INTEGER, "Formula" INTEGER)',
  'CREATE TABLE "Races" ("RaceID" INTEGER, "SeasonID" INTEGER, "Day" INTEGER, "TrackID" INTEGER, "State" INTEGER, "RainRace" INTEGER, "TemperatureRace" INTEGER, "WeekendType" INTEGER)',
  'CREATE TABLE "Races_Tracks" ("TrackID" INTEGER, "Name" TEXT, "Laps" INTEGER)',
  'CREATE TABLE "Races_Results" ("Season" INTEGER, "RaceID" INTEGER, "FinishingPos" INTEGER, "DriverID" INTEGER, "TeamID" INTEGER, "Laps" INTEGER, "FastestLap" INTEGER, "Points" INTEGER, "DNF" INTEGER, "StartingPos" INTEGER)',
  'CREATE TABLE "Races_DriverStandings" ("SeasonID" INTEGER, "DriverID" INTEGER, "Points" INTEGER, "Position" INTEGER, "RaceFormula" INTEGER)',
  'CREATE TABLE "Races_PitStopTimings" ("SeasonID" INTEGER, "RaceID" INTEGER, "TeamID" INTEGER, "DriverID" INTEGER, "PitStopID" INTEGER, "PitStopStage" INTEGER, "Duration" INTEGER, "Lap" INTEGER)',
  'CREATE TABLE "Races_PracticeResults" ("SeasonID" INTEGER, "RaceID" INTEGER, "PracticeSession" INTEGER, "DriverID" INTEGER, "TeamID" INTEGER, "BestLapTime" INTEGER, "BestLapTyre" INTEGER, "RaceFormula" INTEGER)',
  'CREATE TABLE "Staff_BasicData" ("StaffID" INTEGER, "FirstName" TEXT, "LastName" TEXT, "CountryID" INTEGER)',
  'CREATE TABLE "Staff_DriverData" ("StaffID" INTEGER, "DriverCode" TEXT)',
  'CREATE TABLE "Staff_Contracts" ("StaffID" INTEGER, "ContractType" INTEGER, "TeamID" INTEGER, "StartDay" INTEGER)',
  `INSERT INTO Player VALUES ('Test', 'Manager', 1, 0)`,
  `INSERT INTO Player_State VALUES (1234, 2023)`,
  `INSERT INTO Teams VALUES (1, 'Test Racing', '', 0, 0)`,
  `INSERT INTO Teams VALUES (2, 'Rival Racing', '', 0, 0)`,
  `INSERT INTO Races VALUES (1, 2023, 10, 5, 2, 0, 24, 0)`,
  `INSERT INTO Races VALUES (2, 2023, 24, 7, 0, 0, 0, 0)`,
  `INSERT INTO Races_Tracks VALUES (5, 'Bahrain', 57)`,
  `INSERT INTO Races_Tracks VALUES (7, 'Imola', 63)`,
  `INSERT INTO Races_Results VALUES (2023, 1, 1, 101, 1, 57, 91500, 25, 0, 1)`,
  `INSERT INTO Races_Results VALUES (2023, 1, 2, 102, 2, 57, 92000, 18, 0, 2)`,
  `INSERT INTO Races_DriverStandings VALUES (2023, 101, 25, 1, 1)`,
  `INSERT INTO Races_DriverStandings VALUES (2023, 102, 18, 2, 1)`,
  // One physical stop spanning two timing rows: MIN(Lap)=12, SUM duration.
  // Durations in seconds (real save unit) — repo converts to ms.
  `INSERT INTO Races_PitStopTimings VALUES (2023, 1, 1, 101, 1, 0, 21.0, 12)`,
  `INSERT INTO Races_PitStopTimings VALUES (2023, 1, 1, 101, 1, 1, 2.4, 12)`,
  // Practice: soft (tyre=2) best lap faster than medium (tyre=1).
  `INSERT INTO Races_PracticeResults VALUES (2023, 1, 1, 101, 1, 90500, 2, 1)`,
  `INSERT INTO Races_PracticeResults VALUES (2023, 1, 1, 102, 2, 91000, 1, 1)`,
  `INSERT INTO Staff_BasicData VALUES (101, 'Test', 'Driver', 1)`,
  `INSERT INTO Staff_BasicData VALUES (102, 'Rival', 'Driver', 2)`,
  `INSERT INTO Staff_DriverData VALUES (101, 'TST')`,
  `INSERT INTO Staff_DriverData VALUES (102, 'RIV')`,
  `INSERT INTO Staff_Contracts VALUES (101, 0, 1, 100)`,
  `INSERT INTO Staff_Contracts VALUES (102, 0, 2, 100)`,
];
