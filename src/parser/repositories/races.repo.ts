/**
 * Races repository — verified columns (F1M 24):
 *   Races: RaceID, SeasonID, Day, TrackID, State, RainPractice,
 *          RainQualifying, RainRace, TemperatureRace, WeekendType
 *   Races_Tracks: TrackID, Name, Laps (+ Phase 3: TrackLength, TypeOfTrack,
 *          FirstRace, FastestLap, FastestLapDriverID, FastestLapYear)
 *   Races_Results: Season, RaceID, FinishingPos, DriverID, TeamID, Laps,
 *          Time, FastestLap, Points, DNF, StartingPos (+ Phase 3:
 *          SuccessfulOvertakes, SafetyCarDeployments,
 *          VirtualSafetyCarDeployments)
 * TIME UNITS: the save stores seconds (float). This repo converts to the
 * model contract (ms) at the boundary — engines/UI never see raw seconds.
 *
 * Phase 3 note: the new Gazette columns are selected SOFTLY — the column
 * list is read from sqlite_master first and missing columns become NULL
 * (→ undefined in the model) instead of failing the whole parse. Verified
 * schemas are listed in tests/fixtures/schema/; older/minimal schemas
 * (e.g. F1M 23 exports) degrade gracefully per docs/01 §4.1 rule 4.
 *
 * NOTE (verified vs planning): Races_Results uses `Season` + `FinishingPos`,
 * Races uses `WeekendType` (planning file 01 flagged these columns as
 * "cần verify" — differences recorded in tests/fixtures/schema JSON).
 */

import type { SqlJsDatabase } from '../sqlite/sqljs-loader';
import { tableColumns } from '../schema';

export interface RawRace {
  raceId: number;
  seasonId: number;
  day: number;
  trackId: number;
  state: number;
  rainPractice?: number;
  rainQualifying?: number;
  rainRace: number;
  temperatureRace: number;
  weekendType: number;
  trackName?: string;
  laps?: number;
  /* Races_Tracks extras (Phase 3 — Gazette preview + trivia). */
  trackLengthKm?: number;
  trackType?: number;
  trackFirstRaceYear?: number;
  trackFastestLapMs?: number;
  trackFastestLapDriverId?: number;
  trackFastestLapYear?: number;
}

export interface RawRaceResult {
  raceId: number;
  driverId: number;
  teamId: number;
  finishingPos: number;
  points: number;
  dnf: number;
  laps?: number;
  fastestLap?: number;
  startingPos?: number;
  /* Phase 3 (Gazette): Time (seconds → ms), overtakes, SC/VSC counts. */
  totalTimeMs?: number;
  overtakes?: number;
  safetyCarDeployments?: number;
  vscDeployments?: number;
}

/**
 * Soft column selection: build a SELECT list where missing optional columns
 * become `NULL`. `cols` empty (table introspection failed) → assume present
 * (previous hard-SELECT behaviour, keeps Phase 0/1 saves working).
 */
function softSelect(
  cols: Set<string>,
  specs: Array<[expr: string, column: string]>,
): Array<string | null> {
  return specs.map(([expr, column]) => (cols.size === 0 || cols.has(column) ? expr : null));
}

function num(row: unknown[], idx: number | null): number | undefined {
  if (idx == null) return undefined;
  const v = row[idx];
  return v == null ? undefined : Number(v);
}

/**
 * Absolute column index of spec item i inside the final SELECT list.
 * A NULL placeholder still occupies one slot, so the index is simply the
 * mandatory-block offset + i; NULL → null (read as undefined).
 */
function slotAt(spec: Array<string | null>, i: number, offset: number): number | null {
  return spec[i] == null ? null : offset + i;
}

export function getRaces(db: SqlJsDatabase): RawRace[] {
  const rCols = new Set(tableColumns(db, 'Races'));
  const tCols = new Set(tableColumns(db, 'Races_Tracks'));

  const racesSpec = softSelect(rCols, [
    ['r.RainPractice', 'RainPractice'],
    ['r.RainQualifying', 'RainQualifying'],
    ['r.RainRace', 'RainRace'],
    ['r.TemperatureRace', 'TemperatureRace'],
    ['r.WeekendType', 'WeekendType'],
  ]);
  const trackSpec = softSelect(tCols, [
    ['t.Name', 'Name'],
    ['t.Laps', 'Laps'],
    ['t.TrackLength', 'TrackLength'],
    ['t.TypeOfTrack', 'TypeOfTrack'],
    ['t.FirstRace', 'FirstRace'],
    ['t.FastestLap', 'FastestLap'],
    ['t.FastestLapDriverID', 'FastestLapDriverID'],
    ['t.FastestLapYear', 'FastestLapYear'],
  ]);
  const RACES_OFFSET = 5; // mandatory block: RaceID..State
  const TRACK_OFFSET = RACES_OFFSET + racesSpec.length;
  const R = {
    rainPractice: slotAt(racesSpec, 0, RACES_OFFSET),
    rainQualifying: slotAt(racesSpec, 1, RACES_OFFSET),
    rainRace: slotAt(racesSpec, 2, RACES_OFFSET),
    temperatureRace: slotAt(racesSpec, 3, RACES_OFFSET),
    weekendType: slotAt(racesSpec, 4, RACES_OFFSET),
  } as const;
  const T = {
    trackName: slotAt(trackSpec, 0, TRACK_OFFSET),
    laps: slotAt(trackSpec, 1, TRACK_OFFSET),
    trackLengthKm: slotAt(trackSpec, 2, TRACK_OFFSET),
    trackType: slotAt(trackSpec, 3, TRACK_OFFSET),
    trackFirstRaceYear: slotAt(trackSpec, 4, TRACK_OFFSET),
    trackFastestLapMs: slotAt(trackSpec, 5, TRACK_OFFSET),
    trackFastestLapDriverId: slotAt(trackSpec, 6, TRACK_OFFSET),
    trackFastestLapYear: slotAt(trackSpec, 7, TRACK_OFFSET),
  } as const;

  const exprs: string[] = [
    'r.RaceID',
    'r.SeasonID',
    'r.Day',
    'r.TrackID',
    'r.State',
    ...racesSpec.map((s) => s ?? 'NULL'),
    ...trackSpec.map((s) => s ?? 'NULL'),
  ];

  const rows = db.exec(`
    SELECT ${exprs.join(', ')}
    FROM Races r
    LEFT JOIN Races_Tracks t ON t.TrackID = r.TrackID
    ORDER BY r.SeasonID, r.Day
  `);
  if (rows.length === 0) return [];
  // Fixed indices for the mandatory columns:
  const I = { raceId: 0, seasonId: 1, day: 2, trackId: 3, state: 4 } as const;

  return rows[0].values.map((row) => {
    const fastestLapMs = num(row, T.trackFastestLapMs);
    return {
      raceId: Number(row[I.raceId] ?? 0),
      seasonId: Number(row[I.seasonId] ?? 0),
      day: Number(row[I.day] ?? 0),
      trackId: Number(row[I.trackId] ?? 0),
      state: Number(row[I.state] ?? 0),
      rainPractice: num(row, R.rainPractice),
      rainQualifying: num(row, R.rainQualifying),
      // Phase 0 columns keep their hard-SELECT defaults (0) for parity.
      rainRace: R.rainRace == null ? 0 : Number(row[R.rainRace] ?? 0),
      temperatureRace: R.temperatureRace == null ? 0 : Number(row[R.temperatureRace] ?? 0),
      weekendType: R.weekendType == null ? 0 : Number(row[R.weekendType] ?? 0),
      trackName: (() => {
        const i = T.trackName;
        return i == null || row[i] == null ? undefined : String(row[i]);
      })(),
      laps: num(row, T.laps),
      trackLengthKm: num(row, T.trackLengthKm),
      trackType: num(row, T.trackType),
      trackFirstRaceYear: num(row, T.trackFirstRaceYear),
      // Track record stored in seconds — ms at the boundary (model contract).
      trackFastestLapMs: fastestLapMs == null ? undefined : Math.round(fastestLapMs * 1000),
      trackFastestLapDriverId: num(row, T.trackFastestLapDriverId),
      trackFastestLapYear: num(row, T.trackFastestLapYear),
    };
  });
}

export function getRaceResults(db: SqlJsDatabase): RawRaceResult[] {
  const resCols = new Set(tableColumns(db, 'Races_Results'));

  const spec = softSelect(resCols, [
    ['Laps', 'Laps'],
    ['FastestLap', 'FastestLap'],
    ['StartingPos', 'StartingPos'],
    ['Time', 'Time'],
    ['SuccessfulOvertakes', 'SuccessfulOvertakes'],
    ['SafetyCarDeployments', 'SafetyCarDeployments'],
    ['VirtualSafetyCarDeployments', 'VirtualSafetyCarDeployments'],
  ]);
  const RES_OFFSET = 6; // mandatory block: RaceID..DNF
  const K = {
    laps: slotAt(spec, 0, RES_OFFSET),
    fastestLap: slotAt(spec, 1, RES_OFFSET),
    startingPos: slotAt(spec, 2, RES_OFFSET),
    time: slotAt(spec, 3, RES_OFFSET),
    overtakes: slotAt(spec, 4, RES_OFFSET),
    sc: slotAt(spec, 5, RES_OFFSET),
    vsc: slotAt(spec, 6, RES_OFFSET),
  } as const;

  const exprs: string[] = [
    'RaceID',
    'DriverID',
    'TeamID',
    'FinishingPos',
    'Points',
    'DNF',
    ...spec.map((s) => s ?? 'NULL'),
  ];
  const rows = db.exec(`
    SELECT ${exprs.join(', ')}
    FROM Races_Results
    ORDER BY RaceID, FinishingPos
  `);
  if (rows.length === 0) return [];
  const I = { raceId: 0, driverId: 1, teamId: 2, finishingPos: 3, points: 4, dnf: 5 } as const;

  return rows[0].values.map((row) => {
    const fastestLap = num(row, K.fastestLap);
    const totalTime = num(row, K.time);
    return {
      raceId: Number(row[I.raceId] ?? 0),
      driverId: Number(row[I.driverId] ?? 0),
      teamId: Number(row[I.teamId] ?? 0),
      finishingPos: Number(row[I.finishingPos] ?? 0),
      points: Number(row[I.points] ?? 0),
      dnf: Number(row[I.dnf] ?? 0),
      laps: num(row, K.laps),
      // FastestLap stored in seconds (float) — normalized to ms (contract).
      fastestLap: fastestLap == null ? undefined : Math.round(fastestLap * 1000),
      startingPos: num(row, K.startingPos),
      // Total race Time stored in seconds — ms at the boundary.
      totalTimeMs: totalTime == null ? undefined : Math.round(totalTime * 1000),
      overtakes: num(row, K.overtakes),
      safetyCarDeployments: num(row, K.sc),
      vscDeployments: num(row, K.vsc),
    };
  });
}
