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
import type {
  SaveMeta,
  SaveModel,
  Team,
  Race,
  GameVersionId,
  QualifyingResult,
  PlayerStrategyPlan,
  PlayerStrategySection,
  PlayerStrategyStint,
} from '../../domain/types';
import { detectSchema, type SchemaInfo, OPTIONAL_TABLES } from '../schema';
import { getPlayer, getPlayerState } from '../repositories/player.repo';
import { getTeams, getTeamColours } from '../repositories/teams.repo';
import { getRaces, getRaceResults } from '../repositories/races.repo';
import { getDrivers } from '../repositories/drivers.repo';
import { getPracticeResults } from '../repositories/practice.repo';
import { getPitTimings } from '../repositories/pitstops.repo';
import { getTyreAllocations } from '../repositories/tyres.repo';
import { getQualifyingResults } from '../repositories/quali.repo';
import { getPlayerStrategyStints } from '../repositories/player-strategy.repo';
import { getPartsSnapshot } from '../repositories/parts.repo';
import { getFinanceSnapshot } from '../repositories/finance.repo';
import { getStaffDetail } from '../repositories/staff-detail.repo';
import { getRegulations } from '../repositories/regulations.repo';
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
  // v0.5.0 team identity — optional table, empty map when absent.
  const teamColours = getTeamColours(db);

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
      r.temperatureRace !== 0 ||
      r.rainRace !== 0 ||
      r.rainPractice === 1 ||
      r.rainQualifying === 1
        ? {
            raceTempC: r.temperatureRace,
            raceRain: r.rainRace === 1,
            practiceRain: r.rainPractice === 1,
            qualifyingRain: r.rainQualifying === 1,
          }
        : undefined,
    results: [],
    /* Phase 3 — track facts for the Gazette preview + trivia. */
    trackLengthKm: r.trackLengthKm,
    trackType: r.trackType,
    trackFirstRaceYear: r.trackFirstRaceYear,
    trackFastestLapMs: r.trackFastestLapMs,
    trackFastestLapDriverId: r.trackFastestLapDriverId,
    trackFastestLapYear: r.trackFastestLapYear,
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
      /* Phase 3 — Gazette gap + aggregates (SC/VSC repeat per row). */
      totalTimeMs: res.totalTimeMs,
      overtakes: res.overtakes,
      safetyCarDeployments: res.safetyCarDeployments,
      vscDeployments: res.vscDeployments,
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

  // Qualifying — keep the LAST stage per driver per race (oracle:
  // QualifyingStage = MAX(...) is the final classification).
  const qualiRows = getQualifyingResults(db);
  const qualiKey = (raceId: number, driverId: number) => `${raceId}:${driverId}`;
  const qualiFinal = new Map<string, (typeof qualiRows)[number]>();
  for (const q of qualiRows) {
    const key = qualiKey(q.raceId, q.driverId);
    const cur = qualiFinal.get(key);
    if (!cur || (q.qualifyingStage ?? 0) >= (cur.qualifyingStage ?? 0)) {
      qualiFinal.set(key, q);
    }
  }
  for (const q of qualiFinal.values()) {
    const race = raceById.get(q.raceId);
    if (!race) continue;
    race.qualifying ??= [];
    const entry: QualifyingResult = {
      driverId: q.driverId,
      driverName: driverName(q.driverId),
      teamId: q.teamId,
      finishingPos: q.finishingPos,
      championshipPoints: q.championshipPoints,
    };
    race.qualifying.push(entry);
  }
  for (const race of raceModels) {
    if (race.qualifying) race.qualifying.sort((a, b) => a.finishingPos - b.finishingPos);
  }

  /* ── Phase 2 sections — schema-adaptive, each isolated (never throws) ── */
  const phase2Warnings: string[] = [];
  const safe = <T>(table: string, fn: () => T, fallback: T): T => {
    try {
      return fn();
    } catch (err) {
      phase2Warnings.push(`REPO_FAILED:${table}:${err instanceof Error ? err.message : 'unknown'}`);
      return fallback;
    }
  };

  const partsModel = safe('Parts_*', () => getPartsSnapshot(db), {
    designs: [],
    items: [],
    loadouts: [],
    expertise: [],
    tablesPresent: { designs: false, items: false, statValues: false, loadouts: false, expertise: false },
  });
  const financeModel = safe('Finance_*', () => getFinanceSnapshot(db), {
    latestBalance: [],
    transactions: [],
    tablesPresent: { balance: false, transactions: false },
  });
  const staffDetail = safe('Staff_*', () => getStaffDetail(db), {
    contracts: [],
    performance: [],
    patience: [],
    tablesPresent: { contracts: false, performance: false, patience: false },
  });
  const regulationsModel = safe('Regulations_*', () => getRegulations(db), {
    proposals: [],
    tablesPresent: { proposals: false, votes: false, changeGroups: false },
  });

  const playerFinance = financeModel.latestBalance.find(
    (b) => b.teamId === player.teamId,
  );

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
    warnings: [...warnings, ...phase2Warnings],
  };

  // Standings computed from results (formula verified 0-mismatch on a real
  // F1M24 save vs Races_DriverStandings — see compute-standings.ts).
  const standings = computeStandings(raceModels, currentSeason);

  // Tyre allocation — may be empty between weekends (verified: real save
  // has 0 rows post-race); engines must fall back to the model envelope.
  const tyreSets = getTyreAllocations(db);

  // In-game strategist plan (Save_PlayerStrategyStints) — empty before
  // qualifying and after the race; TyreType 0=H / 1=M / 2=S (verified via
  // TyreDurability). Group raw rows into per-loadout strategy candidates.
  const strategyRaw = safe('Save_PlayerStrategyStints', () => getPlayerStrategyStints(db), {
    tablePresent: false,
    rows: [],
  });
  const STRATEGY_TYRE: Record<number, 'S' | 'M' | 'H'> = { 0: 'H', 1: 'M', 2: 'S' };
  const planKey = (row: { loadoutId: number; strategyId: number }): string =>
    `${row.loadoutId}:${row.strategyId}`;
  const planMap = new Map<string, PlayerStrategyPlan>();
  for (const row of strategyRaw.rows) {
    const key = planKey(row);
    const plan = planMap.get(key) ?? {
      loadoutId: row.loadoutId,
      strategyId: row.strategyId,
      selected: row.selected === 1,
      stints: [],
    };
    if (row.selected === 1) plan.selected = true;
    plan.stints.push({
      stintIndex: row.stintId,
      compound: STRATEGY_TYRE[row.tyreType] ?? null,
      pitWindowStart: row.pitWindowStart ?? null,
      pitWindowEnd: row.pitWindowEnd ?? null,
      expectedPitLap: row.averageStartingLap ?? null,
      optimalPitLap: row.optimalPitLap ?? null,
    });
    planMap.set(key, plan);
  }
  const playerStrategy: PlayerStrategySection = {
    tablePresent: strategyRaw.tablePresent,
    plans: [...planMap.values()].map((p) => ({
      ...p,
      stints: [...p.stints].sort((a, b) => a.stintIndex - b.stintIndex),
    })),
  };

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
        colourPrimary: teamColours.get(t.teamId),
      }),
    ),
    drivers: driversRaw.map((d) => ({
      staffId: d.staffId,
      fullName: `${cleanStaffName(d.firstName)} ${cleanStaffName(d.lastName)}`.trim(),
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
    parts: partsModel,
    regulations: regulationsModel.proposals,
    finance: {
      balance: playerFinance?.balance,
      budget: playerFinance?.budget,
      transactions: financeModel.transactions,
      tablesPresent: financeModel.tablesPresent,
    },
    personnel: staffDetail,
    playerStrategy,
    availability: OPTIONAL_TABLES.map((t) => ({
      table: t,
      present: !schema.tablesMissingOptional.includes(t),
    })),
  };
}

function toGameVersion(v: string): GameVersionId {
  if (v === 'F1M22' || v === 'F1M23' || v === 'F1M24') return v;
  return 'UNKNOWN';
}

/**
 * Display patches for decoded staff-name keys (0.4.1). The game stores
 * localization KEYS that drop apostrophes/spaces ("OWard") and resolves
 * them via its own string table at runtime — the save alone cannot recover
 * the spelling. The patch restores the official public spelling of the
 * affected roster names (deterministic, display-only, extendable as new
 * names are observed). Oracle names.js shows the raw decoded form; this is
 * a deliberate, documented deviation requested by the owner.
 */
export const STAFF_NAME_DISPLAY_PATCHES: Record<string, string> = {
  OWard: "O'Ward", // Pato O'Ward (F1M24 roster)
  DeLaRosa: 'de la Rosa', // Pedro de la Rosa
  dosSantos: 'dos Santos', // generated staff particle surname
  Barichello: 'Barrichello', // Rubens Barrichello (legend roster)
};

/**
 * Generated staff names arrive as localization keys, e.g.
 * "[StaffName_Forename_Male_Pato]" / "[StaffName_Surname_OWard]". The
 * readable name is embedded in the key — extracting it is faithful to the
 * save (the game localizes the very same string at runtime). Plain names
 * (real drivers, user input) pass through untouched.
 *
 * Oracle parity (names.js:9705 removeTrailingDigit): duplicate key names in
 * the save carry a trailing digit ("Mini1") — the game displays it without
 * the digit, so decoded keys are stripped too.
 */
export function cleanStaffName(raw: string): string {
  const token = raw.trim();
  /* 0.5.3: player-entered / imported names arrive as string literals —
   * "[STRING_LITERAL:Value=|Colton|]" (real save: Herta 645, Emerson
   * Fittipaldi Jr. 646, Briatore 5). Must be checked BEFORE the generic
   * key decode: its "keep the tail segment" fallback splits on the
   * STRING_LITERAL underscore and emitted "LITERAL:Value=|Colton|". The
   * captured value is the literal display text and may contain spaces
   * ("Fittipaldi Jr."). */
  const literal = token.match(/^\[STRING_LITERAL:Value=\|(.+)\|\]$/);
  if (literal) return literal[1].trim();
  const m = token.match(/^\[([^\]]+)\]$/);
  if (!m) return token;
  const key = m[1];
  const PREFIXES = ['StaffName_Forename_Male_', 'StaffName_Forename_Female_', 'StaffName_Surname_'];
  for (const p of PREFIXES) {
    if (key.startsWith(p)) {
      const decoded = removeTrailingDigit(key.slice(p.length));
      return STAFF_NAME_DISPLAY_PATCHES[decoded] ?? decoded;
    }
  }
  // Unknown key shape — keep the tail segment, still readable.
  const tail = removeTrailingDigit(key.split('_').pop() ?? token);
  return STAFF_NAME_DISPLAY_PATCHES[tail] ?? tail;
}

/** Oracle names.js:9705 — a single trailing digit is a key artifact. */
export function removeTrailingDigit(str: string): string {
  return /\d$/.test(str) ? str.slice(0, -1) : str;
}
