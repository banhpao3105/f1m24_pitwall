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
      driverName: `Driver ${res.driverId}`, // joined in Phase 1 (staff join)
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
    drivers: [],
    staff: [],
    seasons: [
      ...new Set(races.map((r) => r.seasonId)),
    ].map((seasonId) => ({ seasonId })),
    races: raceModels,
    standings: { drivers: [], teams: [] },
    tyres: [],
    parts: [],
    regulations: [],
    finance: {},
    availability: schema.tablesMissingOptional.map((t) => ({
      table: t,
      present: false,
    })),
  };

  // staffCount is informational for Phase 0 metadata; keep referenced to
  // avoid dead-code lint while drivers/staff remain placeholder arrays.
  void staffCount;
}

function toGameVersion(v: string): GameVersionId {
  if (v === 'F1M22' || v === 'F1M23' || v === 'F1M24') return v;
  return 'UNKNOWN';
}
