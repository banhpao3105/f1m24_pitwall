/**
 * Normalize: raw repository rows → SaveModel v0. Phase 0.
 *
 * Rules (docs/01-AUDIT-DATA.md §4.1):
 *   - UI never sees SQL; it only gets this model.
 *   - Missing optional tables → warnings + degraded availability, no throw.
 *   - Missing CORE tables → SaveParseError(MISSING_CORE_TABLES) upstream.
 *   - No races completed → warning NO_COMPLETED_RACES, not fatal.
 */

import type { SqlJsDatabase } from '../sqlite/sqljs-loader';
import type { SaveBinaryMeta } from '../parse-save';
import type { SaveMeta, SaveModel, Team, Race, GameVersionId } from '../../domain/types';
import { detectSchema, type SchemaInfo } from '../schema';
import { getPlayer, getPlayerState } from '../repositories/player.repo';
import { getTeams } from '../repositories/teams.repo';
import { getStaffCount } from '../repositories/staff.repo';
import { getRaces, getRaceResults } from '../repositories/races.repo';
import { getDrivers } from '../repositories/drivers.repo';
import { getPracticeResults } from '../repositories/practice.repo';
import { getPitTimings } from '../repositories/pitstops.repo';
import { getTyreAllocations } from '../repositories/tyres.repo';
import { computeStandings } from './compute-standings';
import { SaveParseError, ParseErrorCode } from '../errors';

export interface BuildModelInput {
  db: SqlJsDatabase;
  binaryMeta: SaveBinaryMeta;
  schema: SchemaInfo;
  saveId: string;
  fileName: string;
  fileSizeBytes: number;
}

export function buildSaveModel(input: BuildModelInput): SaveModel {
  const { db, binaryMeta, schema, saveId, fileName, fileSizeBytes } = input;

  const player = getPlayer(db);
  if (!player) {
    throw new SaveParseError(
      ParseErrorCode.MISSING_CORE_TABLES,
      'Player row missing — save is not a career save the Pit Wall can read',
    );
  }
  const playerState = getPlayerState(db);

  const warnings: string[] = [];
  const races = getRaces(db);
  const results = getRaceResults(db);
  const teams = getTeams(db);

  const completed = races.filter((r) => r.state === 2).length;
  if (completed === 0) {
    warnings.push('NO_COMPLETED_RACES');
  }

  const teamById = new Map(teams.map((t) => [t.teamId, t]));
  const playerTeam = teamById.get(player.teamId);
  const teamName = playerTeam?.teamName ?? `Team ${player.teamId}`;

  const currentSeason = playerState?.currentSeason ?? races.at(-1)?.seasonId ?? 0;

  const raceModels: Race[] = races.map((r) => ({
    raceId: r.raceId,
    seasonId: r.seasonId,
    trackId: r.trackId,
    trackName: r.trackName ?? `Track ${r.trackId}`,
    day: r.day,
    state: r.state,
    isSprint: r.weekendType !== 0, // WeekendType 0 = full weekend (verified F1M 24)
    laps: r.laps,
    weather:
      r.temperatureRace !== 0 || r.rainRace !== 0
        ? { raceTempC: r.temperatureRace, raceRain: r.rainRace === 1 }
        : undefined,
    results: [],
  }));

  const raceById = new Map(raceModels.map((r) => [r.raceId, r]));
  for (const res of results) {
    const race = raceById.get(res.raceId);
    if (!race) continue;
    race.results.push({
      driverId: res.driverId,
      driverName: '', // filled after drivers are loaded
      teamId: res.teamId,
      teamName: teamById.get(res.teamId)?.teamName ?? `Team ${res.teamId}`,
      finishingPos: res.finishingPos,
      startingPos: res.startingPos,
      points: res.points,
      dnf: res.dnf === 1,
      laps: res.laps,
      fastestLapMs: res.fastestLap,
    });
  }

  // Drivers (Staff join) — names replace placeholders in race results.
  const driversRaw = getDrivers(db);
  const driverById = new Map(driversRaw.map((d) => [d.staffId, d]));
  const driverName = (id: number): string => {
    const d = driverById.get(id);
    const name = d
      ? `${cleanStaffName(d.firstName)} ${cleanStaffName(d.lastName)}`.trim()
      : '';
    return name.length > 0 ? name : `Driver ${id}`;
  };
  for (const race of raceModels) {
    for (const res of race.results) {
      res.driverName = driverName(res.driverId);
    }
  }

  // Pit stops — group timing rows per physical stop (oracle: MIN lap,
  // SUM duration across rows of the same PitStopID).
  const pitTimings = getPitTimings(db);
  const stopKey = (raceId: number, driverId: number, pitStopId: number) =>
    `${raceId}:${driverId}:${pitStopId}`;
  const stopsAgg = new Map<
    string,
    { raceId: number; driverId: number; teamId: number; lap: number; durationMs: number; pitStopId: number }
  >();
  for (const t of pitTimings) {
    const key = stopKey(t.raceId, t.driverId, t.pitStopId);
    const agg = stopsAgg.get(key);
    if (agg) {
      agg.lap = Math.min(agg.lap, t.lap);
      agg.durationMs += t.durationMs;
    } else {
      stopsAgg.set(key, {
        raceId: t.raceId,
        driverId: t.driverId,
        teamId: t.teamId,
        lap: t.lap,
        durationMs: t.durationMs,
        pitStopId: t.pitStopId,
      });
    }
  }
  for (const stop of stopsAgg.values()) {
    const race = raceById.get(stop.raceId);
    if (!race) continue;
    race.pitStops ??= [];
    race.pitStops.push({
      driverId: stop.driverId,
      teamId: stop.teamId,
      lap: stop.lap,
      durationMs: stop.durationMs,
      pitStopId: stop.pitStopId,
    });
  }
  for (const race of raceModels) {
    if (race.pitStops) race.pitStops.sort((a, b) => a.lap - b.lap);
  }

  // Practice — flattened rows per race (engine aggregates per compound).
  for (const p of getPracticeResults(db)) {
    const race = raceById.get(p.raceId);
    if (!race) continue;
    race.practice ??= [];
    race.practice.push({
      driverId: p.driverId,
      teamId: p.teamId,
      session: p.session,
      bestLapMs: p.bestLapMs,
      bestLapTyre: p.bestLapTyre,
    });
  }

  const meta: SaveMeta = {
    id: saveId,
    fileName,
    fileSizeBytes,
    gameVersion: toGameVersion(binaryMeta.gameVersion),
    saveGameVersion: binaryMeta.saveGameVersion,
    engineVersion: binaryMeta.engineVersion,
    gameVersionWithBuild: binaryMeta.gameVersionWithBuild,
    saveGameClassName: binaryMeta.saveGameClassName,
    parsedAt: new Date().toISOString(),
    seasonId: currentSeason,
    day: playerState?.day ?? 0,
    playerTeamId: player.teamId,
    tablesPresent: schema.tablesPresent,
    tablesMissing: schema.tablesMissingOptional,
    warnings,
  };

  const staffCount = getStaffCount(db);

  // Standings computed from results (formula verified 0-mismatch on a real
  // F1M24 save vs Races_DriverStandings — see compute-standings.ts).
  const standings = computeStandings(raceModels, currentSeason);

  // Tyre allocation — may be empty between weekends (verified: real save
  // has 0 rows post-race); engines must fall back to the model envelope.
  const tyreSets = getTyreAllocations(db);

  return {
    meta,
    player: {
      teamId: player.teamId,
      teamName,
      managerName:
        `${player.firstName} ${player.lastName}`.trim() || undefined,
      customTeamEnabled: player.customTeamEnabled === 1,
    },
    teams: teams.map(
      (t): Team => ({
        teamId: t.teamId,
        teamName: t.teamName,
        isCustomTeam: t.isCustomTeam === 1,
        formula: t.formula,
      }),
    ),
    drivers: driversRaw.map((d) => ({
      staffId: d.staffId,
      fullName: `${d.firstName} ${d.lastName}`.trim(),
      code: d.code,
      teamId: d.contractTeamId,
    })),
    staff: [],
    seasons: [
      ...new Set(races.map((r) => r.seasonId)),
    ].map((seasonId) => ({ seasonId })),
    races: raceModels,
    standings,
    tyres: tyreSets.map((t) => ({
      carId: t.carId,
      tyreSetId: t.tyreSetId,
      weekendTyreType: t.weekendTyreType,
      frontLeftWear: t.frontLeftWear,
      availabilityState: t.availabilityState,
      estimatedLapLifeRemaining: t.estimatedLapLifeRemaining,
    })),
    parts: [],
    regulations: [],
    finance: {},
    availability: schema.tablesMissingOptional.map((t) => ({
      table: t,
      present: false,
    })),
  };

  // staffCount is informational; keep referenced to avoid dead-code lint.
  void staffCount;
}

function toGameVersion(v: string): GameVersionId {
  if (v === 'F1M22' || v === 'F1M23' || v === 'F1M24') return v;
  return 'UNKNOWN';
}

/**
 * Generated staff names arrive as localization keys, e.g.
 * "[StaffName_Forename_Male_Pato]" / "[StaffName_Surname_OWard]". The
 * readable name is embedded in the key — extracting it is faithful to the
 * save (the game localizes the very same string at runtime). Plain names
 * (real drivers, user input) pass through untouched.
 */
export function cleanStaffName(raw: string): string {
  const token = raw.trim();
  const m = token.match(/^\[([^\]]+)\]$/);
  if (!m) return token;
  const key = m[1];
  const PREFIXES = ['StaffName_Forename_Male_', 'StaffName_Forename_Female_', 'StaffName_Surname_'];
  for (const p of PREFIXES) {
    if (key.startsWith(p)) return key.slice(p.length);
  }
  // Unknown key shape — keep the tail segment, still readable.
  return key.split('_').pop() ?? token;
}
