/**
 * Gazette Engine v1 — Phase 3 (docs/03-ANALYTICS-ENGINES.md §5.10).
 *
 * Narrative module: race report, awards, transfers, highlights, next-race
 * preview. Faithful port of the Gazette v2.2 oracle (upload/F1 Manager
 * Circuit Gazette.html — GZ.queries / GZ.quotes / GZ.narrative).
 *
 * Per docs/03 §5.10 the Gazette is intentionally DECOUPLED from decision
 * engines: it returns `recommendations: []` (the narrative never drives
 * advice) and every number it publishes carries provenance — either a save
 * table (evidence) or an explicit degradation (assumptions).
 *
 * All pick seeds are deterministic (same save → same quotes/lines):
 *   - winner quote:  seed = winner.driverId + raceId   (oracle quotes.js:16812)
 *   - random driver: pick = (raceId * 7 + winner.driverId) % pool.length (n:17051)
 *   - transfer quote: seed = driverId + futTeamId      (n:16921)
 *   - pick: index = |round(seed)| % bank.length       (n:16802)
 *
 * Formulas carried over (oracle references):
 *   - gap:      r.Time − winnerTime (seconds) — now computed from totalTimeMs.
 *   - odds:     OVERROUND 1.15, strength = avgPoints + baseline (team 2.5,
 *               driver 1.2), adjProb = min(prob × 1.15, 0.95),
 *               odds = clamp(1.05..67, 1/adjProb)        (queries.js:10670)
 *   - favorites: completed races of the season at/before the viewed race on
 *               the NEXT track's type; < 2 races → season-wide form.
 *                                                              (n:10727)
 *   - dark horse: ≥ 6 completed rounds; recent = last 3, early = the rest;
 *               delta of avgPoints; team threshold 1.5, driver 1.0;
 *               favourites excluded; best delta wins.    (queries.js:10746)
 *   - transfers: Staff_Contracts ContractType = 3 (pre-signed), current team
 *               from the viewed race's results, fallback ContractType = 0
 *               (TeamID 1..10 | 32); keep only team-changing moves touching
 *               an F1 team; player-team first, then F1↔F1. (queries.js:10906)
 *   - track record: |trackRecord − fastestLap| < 5e-4 s = outright record.
 *                                                              (n:17107)
 *   - comeback: biggest (startPos − finishPos), DNF excluded, gain ≥ 5.
 *                                                              (n:17828)
 *   - trivia:   races completed at the next track up to the viewed race.
 *                                                              (n:10683)
 *
 * Pure function over the Normalized SaveModel — no React/DB/fetch.
 * Missing columns (old schemas) degrade to undefined + assumptions.
 */

import type {
  Assumption,
  Confidence,
  Evidence,
} from '../domain/provenance';
import type { EngineResult, Race, SaveModel, StandingRow } from '../domain/types';

/* ── Oracle constants (do not change without a verified save diff) ─────── */

export const ODDS_OVERROUND = 1.15;
export const ODDS_TEAM_BASELINE = 2.5;
export const ODDS_DRIVER_BASELINE = 1.2;
export const ODDS_PROB_CAP = 0.95;
export const ODDS_MIN = 1.05;
export const ODDS_MAX = 67;
export const DARK_HORSE_MIN_ROUNDS = 6;
export const DARK_HORSE_TEAM_THRESHOLD = 1.5;
export const DARK_HORSE_DRIVER_THRESHOLD = 1.0;
export const COMEBACK_MIN_GAIN = 5;
export const TRACK_RECORD_TOLERANCE_MS = 0.5; // oracle 5e-4 s
export const TRANSFER_LIMIT = 6;
/** F1 grid team ids — TeamID 1..10 + 32 (custom team), oracle F1_TEAM_IDS. */
const F1_TEAM_IDS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 32]);

/* ── Output shape ──────────────────────────────────────────────────────── */

export interface GazettePerson {
  driverId: number;
  driverName: string;
  teamId: number;
  teamName: string;
}

export interface GazetteResultRow extends GazettePerson {
  finishPos: number;
  startPos?: number;
  gapS?: number;
  dnf: boolean;
  points: number;
  laps?: number;
  fastestLapMs?: number;
  overtakes?: number;
}

export interface GazetteFastestLap extends GazettePerson {
  lapMs: number;
  isTrackRecord: boolean;
  trackRecordLapMs?: number;
  trackRecordYear?: number;
}

export interface GazetteAggregates {
  totalOvertakes?: number;
  retirements: number;
  carCount: number;
  safetyCars?: number;
  virtualSafetyCars?: number;
  /** false when SuccessfulOvertakes was not readable (old schema). */
  overtakesAvailable: boolean;
  /** false when Races_Results.Time was not readable (gap column degrades). */
  gapsAvailable: boolean;
}

export type TransferQuoteCategory = 'promotion' | 'stepUp' | 'joiningUs' | 'lateral';

export interface GazetteTransfer {
  driverId: number;
  driverName: string;
  curTeamId: number | null;
  curTeamName: string | null;
  futTeamId: number;
  futTeamName: string;
  effectiveSeason?: number;
  contractEndSeason?: number;
  /** Deterministic slot for the i18n quote bank (engine computes index). */
  quoteCategory: TransferQuoteCategory;
  quoteIndex: number;
}

export interface GazetteOddsRow {
  id: number;
  name: string;
  teamName: string;
  odds: number;
  probability: number;
  avgPoints: number;
  wins: number;
  podiums: number;
  /** Last results: 'P{n}' or 'DNF' — oracle formHistoryToString. */
  form: string[];
}

export interface GazetteFavorites {
  basis: 'trackType' | 'season';
  sampleRaces: number;
  teams: GazetteOddsRow[];
  drivers: GazetteOddsRow[];
}

export interface GazetteDarkHorse {
  team: {
    teamId: number;
    teamName: string;
    earlyAvg: number;
    recentAvg: number;
    delta: number;
  } | null;
  driver: {
    driverId: number;
    driverName: string;
    teamName: string;
    earlyAvg: number;
    recentAvg: number;
    delta: number;
  } | null;
}

export interface GazetteTrivia {
  timesRaced: number;
  lastWinner?: { driverName: string; teamName: string };
  mostWins?: { driverName: string; wins: number };
  lapRecord?: { lapMs: number; driverName?: string; year?: number };
}

export interface GazetteNextRace {
  raceId: number;
  trackName: string;
  daysAway: number;
  trackType?: number;
  isCompleted: boolean;
}

export type WinnerQuoteCategory = 'dominant' | 'close' | 'balanced';
export type RandomQuoteCategory = 'dnf' | 'points' | 'midfield' | 'backmarker';

export interface GazetteIssue {
  raceId: number;
  seasonId: number;
  round: number;
  totalRounds: number;
  day: number;
  today: number;
  trackName: string;
  trackLengthKm?: number;
  trackType?: number;
  trackFirstRaceYear?: number;
  laps?: number;
  isSprint: boolean;
  weather: {
    raceTempC?: number;
    raceRain?: boolean;
    practiceRain?: boolean;
    qualifyingRain?: boolean;
  };
  winner: GazettePerson | null;
  /** Winner started AND finished P1 (oracle headline switch n:17062). */
  wireToWire: boolean;
  results: GazetteResultRow[];
  podium: GazetteResultRow[];
  fastestLap: GazetteFastestLap | null;
  bestPit: { driverId: number; driverName: string; teamName: string; durationMs: number } | null;
  comeback: {
    driverId: number;
    driverName: string;
    teamName: string;
    startPos: number;
    finishPos: number;
    gain: number;
  } | null;
  aggregates: GazetteAggregates;
  transfers: GazetteTransfer[];
  nextRace: GazetteNextRace | null;
  favorites: GazetteFavorites | null;
  darkHorse: GazetteDarkHorse | null;
  trivia: GazetteTrivia | null;
  standings: { drivers: StandingRow[]; teams: StandingRow[] };
  playerTeamWatch: {
    drivers: { driverName: string; finishPos: number; dnf: boolean; points: number }[];
    standing: { position: number; points: number } | null;
  } | null;
  quoteSlots: {
    /** Winner quote bank selector (i18n renders the sentence). */
    winner: { category: WinnerQuoteCategory; index: number };
    random: {
      driverId: number;
      driverName: string;
      category: RandomQuoteCategory;
      index: number;
    } | null;
  };
}

/* ── Helpers ───────────────────────────────────────────────────────────── */

/** Oracle pick(): deterministic bank index (quotes.js:16802). */
export function pickIndex(seed: number, bankSize: number): number {
  if (bankSize <= 0) return 0;
  return Math.abs(Math.round(seed)) % bankSize;
}

/** OLE date (Excel serial days) → UTC year (oracle format.js:9886). */
export function oleDateToYear(day: number): number {
  const ms = (day - 25569) * 86400 * 1e3;
  return new Date(ms).getUTCFullYear();
}

/** Calendar anchor: races at/before the viewed race in calendar order. */
function isAtOrBefore(r: { day: number; raceId: number }, cutoff: { day: number; raceId: number }): boolean {
  return r.day < cutoff.day || (r.day === cutoff.day && r.raceId <= cutoff.raceId);
}

/**
 * Standings strictly at/before the viewed race — same aggregation formula as
 * parser/normalize/compute-standings.ts (verified 0-mismatch) re-implemented
 * here to keep engines self-contained (engines never import parser code).
 */
export function computeStandingsUpTo(
  races: Race[],
  seasonId: number,
  cutoff: { day: number; raceId: number } | null,
): { drivers: StandingRow[]; teams: StandingRow[] } {
  const driverAgg = new Map<number, { points: number; wins: number; podiums: number; name: string; teamId: number }>();
  const teamAgg = new Map<number, { points: number; wins: number; podiums: number; name: string }>();
  for (const race of races) {
    if (race.seasonId !== seasonId || race.state !== 2) continue;
    if (cutoff && !isAtOrBefore(race, cutoff)) continue;
    for (const res of race.results) {
      const d =
        driverAgg.get(res.driverId) ??
        { points: 0, wins: 0, podiums: 0, name: res.driverName, teamId: res.teamId };
      d.points += res.points;
      d.name = res.driverName;
      d.teamId = res.teamId;
      if (!res.dnf && res.finishingPos === 1) d.wins += 1;
      if (!res.dnf && res.finishingPos > 0 && res.finishingPos <= 3) d.podiums += 1;
      driverAgg.set(res.driverId, d);

      const t = teamAgg.get(res.teamId) ?? { points: 0, wins: 0, podiums: 0, name: res.teamName };
      t.points += res.points;
      t.name = res.teamName;
      if (!res.dnf && res.finishingPos === 1) t.wins += 1;
      teamAgg.set(res.teamId, t);
    }
  }
  const rank = <A extends { points: number; wins: number; podiums: number }>(
    agg: Map<number, A>,
    nameOf: (id: number) => string,
    teamIdOf?: (id: number) => number | undefined,
  ): StandingRow[] =>
    Array.from(agg.entries())
      .map(([id, a]) => ({ id, ...a }))
      .sort((a, b) => b.points - a.points || b.wins - a.wins || b.podiums - a.podiums || a.id - b.id)
      .map((row, i) => ({
        position: i + 1,
        id: row.id,
        name: nameOf(row.id),
        teamId: teamIdOf?.(row.id),
        points: row.points,
      }));
  return {
    drivers: rank(driverAgg, (id) => driverAgg.get(id)?.name ?? `Driver ${id}`, (id) => driverAgg.get(id)?.teamId),
    teams: rank(teamAgg, (id) => teamAgg.get(id)?.name ?? `Team ${id}`),
  };
}

/** Oracle formHistoryToString (queries.js:10560): last 3 → 'P{n}' | 'DNF'. */
function formString(rows: { pos: number; dnf: boolean; day: number; raceId: number }[]): string[] {
  return rows
    .slice()
    .sort((a, b) => b.day - a.day || b.raceId - a.raceId)
    .slice(0, 3)
    .map((h) => (h.dnf ? 'DNF' : `P${h.pos}`));
}

interface FormAgg {
  id: number;
  name: string;
  teamName: string;
  raceSet: Set<number>;
  points: number;
  wins: number;
  podiums: number;
  history: { pos: number; dnf: boolean; day: number; raceId: number }[];
}

function teamFormForRaces(races: Race[], teamNameOf: (id: number) => string): FormAgg[] {
  const byTeam = new Map<number, FormAgg>();
  for (const race of races) {
    for (const res of race.results) {
      if (!F1_TEAM_IDS.has(res.teamId)) continue;
      const t = byTeam.get(res.teamId) ?? {
        id: res.teamId,
        name: res.teamName,
        teamName: teamNameOf(res.teamId),
        raceSet: new Set<number>(),
        points: 0,
        wins: 0,
        podiums: 0,
        history: [],
      };
      t.name = res.teamName;
      t.raceSet.add(race.raceId);
      t.points += res.points;
      if (!res.dnf) {
        if (res.finishingPos === 1) t.wins += 1;
        if (res.finishingPos <= 3) t.podiums += 1;
      }
      t.history.push({ pos: res.finishingPos, dnf: res.dnf, day: race.day, raceId: race.raceId });
      byTeam.set(res.teamId, t);
    }
  }
  return Array.from(byTeam.values());
}

function driverFormForRaces(
  races: Race[],
  currentTeamOf: (driverId: number) => number | null,
  driverNameOf: (driverId: number) => string,
  teamNameOf: (id: number) => string,
): (FormAgg & { teamId: number | null })[] {
  const byDriver = new Map<number, FormAgg & { teamId: number | null; lastTeamId: number | null; lastRaceId: number }>();
  for (const race of races) {
    for (const res of race.results) {
      const d = byDriver.get(res.driverId) ?? {
        id: res.driverId,
        name: res.driverName,
        teamName: teamNameOf(res.teamId),
        teamId: null,
        lastTeamId: null,
        lastRaceId: -1,
        raceSet: new Set<number>(),
        points: 0,
        wins: 0,
        podiums: 0,
        history: [],
      };
      d.name = res.driverName;
      d.raceSet.add(race.raceId);
      d.points += res.points;
      if (!res.dnf) {
        if (res.finishingPos === 1) d.wins += 1;
        if (res.finishingPos <= 3) d.podiums += 1;
      }
      d.history.push({ pos: res.finishingPos, dnf: res.dnf, day: race.day, raceId: race.raceId });
      if (race.raceId > d.lastRaceId) {
        d.lastRaceId = race.raceId;
        d.lastTeamId = res.teamId;
      }
      byDriver.set(res.driverId, d);
    }
  }
  return Array.from(byDriver.values()).map((d) => {
    const teamId = currentTeamOf(d.id) ?? d.lastTeamId;
    return { ...d, teamId, teamName: teamId != null ? teamNameOf(teamId) : d.teamName };
  });
}

/** Oracle computeOdds (queries.js:10670). */
export function computeOdds<T extends { id: number; name: string; teamName: string; avgPoints: number; wins: number; podiums: number; history: { pos: number; dnf: boolean; day: number; raceId: number }[] }>(
  rows: T[],
  baseline: number,
): (GazetteOddsRow & { history: T['history'] })[] {
  const total = rows.reduce((s, r) => s + r.avgPoints + baseline, 0) || 1;
  return rows
    .map((r) => {
      const strength = r.avgPoints + baseline;
      const prob = strength / total;
      const adjProb = Math.min(prob * ODDS_OVERROUND, ODDS_PROB_CAP);
      const odds = Math.max(ODDS_MIN, Math.min(ODDS_MAX, 1 / adjProb));
      return {
        id: r.id,
        name: r.name,
        teamName: r.teamName,
        odds: Math.round(odds * 100) / 100,
        probability: prob,
        avgPoints: r.avgPoints,
        wins: r.wins,
        podiums: r.podiums,
        form: formString(r.history),
        history: r.history,
      };
    })
    .sort((a, b) => a.odds - b.odds);
}

/* ── Engine ────────────────────────────────────────────────────────────── */

export interface GazetteOptions {
  maxTransfers?: number;
}

export function buildGazetteIssue(
  model: SaveModel,
  raceId: number,
  options: GazetteOptions = {},
): EngineResult<GazetteIssue> {
  const warnings: string[] = [];
  const assumptions: Assumption[] = [];
  const evidence: Evidence[] = [];

  const race = model.races.find((r) => r.raceId === raceId);
  if (!race) {
    return {
      data: emptyIssue(model, raceId),
      confidence: 'LOW',
      evidence: [],
      assumptions: [{ text: `Không tìm thấy raceId ${raceId} trong save` }],
      recommendations: [],
      warnings: ['RACE_NOT_FOUND'],
    };
  }
  if (race.state !== 2) {
    warnings.push('RACE_NOT_COMPLETED');
  }

  const cutoff = { day: race.day, raceId: race.raceId };
  const seasonRacesUpTo = model.races.filter(
    (r) => r.seasonId === race.seasonId && r.state === 2 && isAtOrBefore(r, cutoff),
  );
  /* 0.5.3 fix: round = the race's position in the season calendar (day,
   * then raceId), + 1. Before: seasonRacesUpTo.length counted only
   * COMPLETED races, so an unraced round (Bahrain = round 4 of 21, viewed
   * after quali) was mislabeled "Chặng 3" while Season showed #4.
   * seasonRacesUpTo stays for favorites/dark horse — they need completed
   * races only. */
  const seasonCalendar = model.races
    .filter((r) => r.seasonId === race.seasonId)
    .sort((a, b) => a.day - b.day || a.raceId - b.raceId);
  const round = seasonCalendar.findIndex((r) => r.raceId === race.raceId) + 1;

  /* ── Results + gap (oracle: r.Time − winnerTime) ── */
  const results = race.results.slice().sort((a, b) => a.finishingPos - b.finishingPos);
  const winnerRow = results[0];
  const winnerTimeMs = winnerRow?.totalTimeMs;
  const gapsAvailable = results.every((r) => r.totalTimeMs != null || r.dnf);
  const overtakesAvailable = results.some((r) => r.overtakes != null);
  const resultRows: GazetteResultRow[] = results.map((r) => ({
    driverId: r.driverId,
    driverName: r.driverName,
    teamId: r.teamId,
    teamName: r.teamName,
    finishPos: r.finishingPos,
    startPos: r.startingPos,
    gapS:
      r.dnf || !gapsAvailable || winnerTimeMs == null || r.totalTimeMs == null
        ? undefined
        : Math.round(((r.totalTimeMs - winnerTimeMs) / 1000) * 1000) / 1000,
    dnf: r.dnf,
    points: r.points,
    laps: r.laps,
    fastestLapMs: r.fastestLapMs,
    overtakes: r.overtakes,
  }));

  /* ── Aggregates (oracle getRaceAggregates) ── */
  const aggregates: GazetteAggregates = {
    totalOvertakes: overtakesAvailable
      ? results.reduce((s, r) => s + (r.overtakes ?? 0), 0)
      : undefined,
    retirements: results.filter((r) => r.dnf).length,
    carCount: results.length,
    safetyCars: maxOf(results.map((r) => r.safetyCarDeployments)),
    virtualSafetyCars: maxOf(results.map((r) => r.vscDeployments)),
    overtakesAvailable,
    gapsAvailable,
  };
  if (!overtakesAvailable) {
    assumptions.push({ text: 'Save không có SuccessfulOvertakes — thống kê vượt xe bị ẩn, không ước lượng thay thế' });
  }
  if (!gapsAvailable) {
    assumptions.push({ text: 'Save không có Races_Results.Time — cột gap hiển thị “—” thay vì khoảng cách đo được' });
  }

  /* ── Fastest lap + track record (oracle n:17106 — tolerance 5e-4 s) ── */
  let fastestLap: GazetteFastestLap | null = null;
  const flRow = results
    .filter((r) => !r.dnf && r.fastestLapMs != null && r.fastestLapMs > 0)
    .sort((a, b) => (a.fastestLapMs ?? 0) - (b.fastestLapMs ?? 0))[0];
  if (flRow?.fastestLapMs != null) {
    const trackRecord = race.trackFastestLapMs;
    const isRecord =
      trackRecord != null &&
      Math.abs(trackRecord - flRow.fastestLapMs) < TRACK_RECORD_TOLERANCE_MS;
    fastestLap = {
      driverId: flRow.driverId,
      driverName: flRow.driverName,
      teamId: flRow.teamId,
      teamName: flRow.teamName,
      lapMs: flRow.fastestLapMs,
      isTrackRecord: isRecord,
      trackRecordLapMs: trackRecord,
      trackRecordYear: race.trackFastestLapYear,
    };
    evidence.push({
      source: 'Races_Results.FastestLap',
      label: `Fastest lap ${flRow.driverName}: ${(flRow.fastestLapMs / 1000).toFixed(3)}s${isRecord ? ' — trùng kỷ lục đường đua trong save' : ''}`,
      seasonId: race.seasonId,
      raceId: race.raceId,
    });
  }

  /* ── Best pit stop (min duration) ── */
  const bestPitRow = (race.pitStops ?? []).slice().sort((a, b) => a.durationMs - b.durationMs)[0];
  const bestPit = bestPitRow
    ? {
        driverId: bestPitRow.driverId,
        driverName: driverNameOf(model, bestPitRow.driverId),
        teamName: model.teams.find((t) => t.teamId === bestPitRow.teamId)?.teamName ?? `Team ${bestPitRow.teamId}`,
        durationMs: bestPitRow.durationMs,
      }
    : null;

  /* ── Comeback (oracle n:17828 — gain ≥ 5, DNF excluded) ── */
  let comeback: GazetteIssue['comeback'] = null;
  for (const r of results) {
    if (r.dnf || r.startingPos == null) continue;
    const gain = r.startingPos - r.finishingPos;
    if (gain >= COMEBACK_MIN_GAIN && (!comeback || gain > comeback.gain)) {
      comeback = {
        driverId: r.driverId,
        driverName: r.driverName,
        teamName: r.teamName,
        startPos: r.startingPos,
        finishPos: r.finishingPos,
        gain,
      };
    }
  }

  /* ── Standings at the viewed race (for the tables + team watch) ── */
  const standings = computeStandingsUpTo(model.races, race.seasonId, cutoff);

  /* ── Transfers (oracle getTransfers — ContractType = 3) ── */
  const transfers = buildTransfers(model, race, options.maxTransfers ?? TRANSFER_LIMIT, standings);
  if (transfers.length > 0) {
    evidence.push({
      source: 'Staff_Contracts (ContractType=3)',
      label: `${transfers.length} hợp đồng tương lai đã ký — thị trường chuyển nhượng`,
      seasonId: race.seasonId,
    });
  }

  /* ── Next race + favorites + dark horse + trivia ── */
  const nextRaceRow = model.races
    .filter((r) => r.day > race.day || (r.day === race.day && r.raceId > race.raceId))
    .sort((a, b) => a.day - b.day || a.raceId - b.raceId)[0];
  const nextRace: GazetteNextRace | null = nextRaceRow
    ? {
        raceId: nextRaceRow.raceId,
        trackName: nextRaceRow.trackName,
        daysAway: nextRaceRow.day - race.day,
        trackType: nextRaceRow.trackType,
        isCompleted: nextRaceRow.state === 2,
      }
    : null;

  let favorites: GazetteFavorites | null = null;
  let darkHorse: GazetteDarkHorse | null = null;
  if (nextRaceRow && nextRaceRow.trackType != null && race.state === 2) {
    favorites = buildFavorites(model, nextRaceRow, seasonRacesUpTo);
    if (favorites) {
      darkHorse = buildDarkHorse(model, race, favorites, seasonRacesUpTo);
    }
  }

  let trivia: GazetteTrivia | null = null;
  if (nextRaceRow) {
    trivia = buildTrivia(model, nextRaceRow, cutoff);
  }

  /* ── Player team watch ── */
  const playerTeamId = model.player.teamId;
  const own = resultRows.filter((r) => r.teamId === playerTeamId);
  const teamStandingRow = standings.teams.find((t) => t.id === playerTeamId);
  const playerTeamWatch = own.length
    ? {
        drivers: own.map((r) => ({
          driverName: r.driverName,
          finishPos: r.finishPos,
          dnf: r.dnf,
          points: r.points,
        })),
        standing: teamStandingRow
          ? { position: teamStandingRow.position, points: teamStandingRow.points }
          : null,
      }
    : null;

  /* ── Deterministic quote slots (oracle quotes.js) ── */
  const quoteSlots = buildQuoteSlots(race, resultRows);

  /* ── Confidence (narrative completeness, docs/00 §1.6 semantics) ── */
  let confidence: Confidence = 'LOW';
  if (race.state === 2 && results.length > 0) {
    confidence = overtakesAvailable && gapsAvailable ? 'HIGH' : 'MEDIUM';
  }

  evidence.push({
    source: 'Races_Results',
    label: `Báo cáo chặng ${race.trackName}: ${results.length} xe, ${aggregates.retirements} bỏ cuộc${overtakesAvailable ? `, ${aggregates.totalOvertakes} pha vượt` : ''}`,
    seasonId: race.seasonId,
    raceId: race.raceId,
  });

  const winner = winnerRow
    ? {
        driverId: winnerRow.driverId,
        driverName: winnerRow.driverName,
        teamId: winnerRow.teamId,
        teamName: winnerRow.teamName,
      }
    : null;

  return {
    data: {
      raceId: race.raceId,
      seasonId: race.seasonId,
      round,
      totalRounds: model.races.filter((r) => r.seasonId === race.seasonId).length,
      day: race.day,
      today: model.meta.day,
      trackName: race.trackName,
      trackLengthKm: race.trackLengthKm,
      trackType: race.trackType,
      trackFirstRaceYear: race.trackFirstRaceYear,
      laps: race.laps,
      isSprint: race.isSprint,
      weather: {
        raceTempC: race.weather?.raceTempC,
        raceRain: race.weather?.raceRain,
        practiceRain: race.weather?.practiceRain,
        qualifyingRain: race.weather?.qualifyingRain,
      },
      winner,
      wireToWire: winnerRow != null && winnerRow.startingPos === 1 && winnerRow.finishingPos === 1,
      results: resultRows,
      podium: resultRows.filter((r) => !r.dnf && r.finishPos <= 3).slice(0, 3),
      fastestLap,
      bestPit,
      comeback,
      aggregates,
      transfers,
      nextRace,
      favorites,
      darkHorse,
      trivia,
      standings,
      playerTeamWatch,
      quoteSlots,
    },
    confidence,
    evidence,
    assumptions,
    // Narrative module — no recommendations by design (docs/03 §5.10).
    recommendations: [],
    warnings,
  };
}

/* ── Sub-builders ──────────────────────────────────────────────────────── */

function emptyIssue(model: SaveModel, raceId: number): GazetteIssue {
  return {
    raceId,
    seasonId: model.meta.seasonId,
    round: 0,
    totalRounds: 0,
    day: 0,
    today: model.meta.day,
    trackName: '',
    isSprint: false,
    weather: {},
    winner: null,
    wireToWire: false,
    results: [],
    podium: [],
    fastestLap: null,
    bestPit: null,
    comeback: null,
    aggregates: {
      retirements: 0,
      carCount: 0,
      overtakesAvailable: false,
      gapsAvailable: false,
    },
    transfers: [],
    nextRace: null,
    favorites: null,
    darkHorse: null,
    trivia: null,
    standings: { drivers: [], teams: [] },
    playerTeamWatch: null,
    quoteSlots: { winner: { category: 'balanced', index: 0 }, random: null },
  };
}

function driverNameOf(model: SaveModel, driverId: number): string {
  const inResults = model.races.flatMap((r) => r.results).find((res) => res.driverId === driverId);
  if (inResults) return inResults.driverName;
  const inDrivers = model.drivers.find((d) => d.staffId === driverId);
  if (inDrivers) return inDrivers.fullName;
  // Degrade without inventing a name.
  return '';
}

function maxOf(values: (number | undefined)[]): number | undefined {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length === 0) return undefined;
  return Math.max(...nums);
}

/**
 * Transfers — oracle getTransfers (queries.js:10906):
 * pre-signed contracts (ContractType = 3) grouped per staff, current team
 * from the viewed race results (fallback ContractType = 0), keep only moves
 * that change team and touch an F1 team, player-team first then F1↔F1.
 */
function buildTransfers(
  model: SaveModel,
  race: Race,
  limit: number,
  standings: { drivers: StandingRow[]; teams: StandingRow[] },
): GazetteTransfer[] {
  if (model.personnel.tablesPresent.contracts === false) return [];
  const futureByStaff = new Map<number, { teamId: number; startDay?: number; endSeason?: number }>();
  for (const c of model.personnel.contracts) {
    if (c.contractType !== 3 || c.teamId == null) continue;
    const existing = futureByStaff.get(c.staffId);
    if (!existing) {
      futureByStaff.set(c.staffId, { teamId: c.teamId, startDay: c.startDay, endSeason: c.endSeason });
    }
  }
  if (futureByStaff.size === 0) return [];

  // Current team: viewed race results first, then ContractType = 0.
  const raceTeamMap = new Map<number, number>();
  for (const r of race.results) raceTeamMap.set(r.driverId, r.teamId);
  const primaryCurMap = new Map<number, number>();
  for (const c of model.personnel.contracts) {
    if (c.contractType === 0 && c.teamId != null && F1_TEAM_IDS.has(c.teamId)) {
      primaryCurMap.set(c.staffId, c.teamId);
    }
  }

  const driverNames = new Map<number, string>(
    model.drivers.map((d) => [d.staffId, d.fullName] as const),
  );
  const teamName = (id: number): string =>
    model.teams.find((t) => t.teamId === id)?.teamName ?? `Team ${id}`;
  const playerTeamId = model.player.teamId;

  const list: GazetteTransfer[] = [];
  for (const [staffId, fut] of futureByStaff) {
    const curTeamId = raceTeamMap.get(staffId) ?? primaryCurMap.get(staffId) ?? null;
    if (curTeamId != null && curTeamId === fut.teamId) continue;
    if (!F1_TEAM_IDS.has(fut.teamId) && (curTeamId == null || !F1_TEAM_IDS.has(curTeamId))) continue;
    const futTeamId = fut.teamId;
    // Quote category (oracle transferQuote n:16920):
    const curStanding = standings.teams.find((t) => t.id === curTeamId);
    const futStanding = standings.teams.find((t) => t.id === futTeamId);
    const isPromotion = curTeamId == null || (curStanding == null && futStanding != null);
    const stepUp = !isPromotion && curStanding != null && futStanding != null && futStanding.position < curStanding.position;
    const isPlayerTeam = futTeamId === playerTeamId;
    const category: TransferQuoteCategory = isPromotion
      ? 'promotion'
      : stepUp
        ? 'stepUp'
        : isPlayerTeam
          ? 'joiningUs'
          : 'lateral';
    list.push({
      driverId: staffId,
      driverName: driverNames.get(staffId) ?? '',
      curTeamId,
      curTeamName: curTeamId != null ? teamName(curTeamId) : null,
      futTeamId,
      futTeamName: teamName(futTeamId),
      effectiveSeason: fut.startDay != null ? oleDateToYear(fut.startDay) : undefined,
      contractEndSeason: fut.endSeason,
      quoteCategory: category,
      quoteIndex: pickIndex(staffId + futTeamId, 3),
    });
  }
  list.sort((a, b) => {
    const aPlayer = a.curTeamId === playerTeamId || a.futTeamId === playerTeamId ? 0 : 1;
    const bPlayer = b.curTeamId === playerTeamId || b.futTeamId === playerTeamId ? 0 : 1;
    if (aPlayer !== bPlayer) return aPlayer - bPlayer;
    const aF1 = F1_TEAM_IDS.has(a.curTeamId ?? -1) && F1_TEAM_IDS.has(a.futTeamId) ? 0 : 1;
    const bF1 = F1_TEAM_IDS.has(b.curTeamId ?? -1) && F1_TEAM_IDS.has(b.futTeamId) ? 0 : 1;
    if (aF1 !== bF1) return aF1 - bF1;
    return 0;
  });
  return list.slice(0, limit);
}

/**
 * Favorites — oracle getFavoritesAnalysis (queries.js:10727): form from
 * completed races on the NEXT track's type (up to the viewed race); fewer
 * than 2 → season-wide form; odds via computeOdds (team baseline 2.5,
 * driver 1.2).
 */
function buildFavorites(
  model: SaveModel,
  nextRaceRow: Race,
  seasonRacesUpTo: Race[],
): GazetteFavorites | null {
  const teamNameOf = (id: number): string =>
    model.teams.find((t) => t.teamId === id)?.teamName ?? `Team ${id}`;

  let subset = seasonRacesUpTo.filter((r) => r.trackType != null && r.trackType === nextRaceRow.trackType);
  let basis: 'trackType' | 'season' = 'trackType';
  if (subset.length < 2) {
    subset = seasonRacesUpTo;
    basis = 'season';
  }
  if (subset.length === 0) return null;

  const teamForms = teamFormForRaces(subset, teamNameOf).map((t) => ({
    id: t.id,
    name: t.name,
    teamName: t.teamName,
    avgPoints: t.raceSet.size ? t.points / t.raceSet.size : 0,
    wins: t.wins,
    podiums: t.podiums,
    history: t.history,
  }));
  if (teamForms.length === 0) return null;

  // Current driver team: ContractType = 0 (model.drivers.teamId is exactly
  // that, oracle curTeamMap) — fallback to the last race team in the subset.
  const contractTeam = new Map<number, number | null>(
    model.drivers.map((d) => [d.staffId, d.teamId ?? null] as const),
  );
  const driverForms = driverFormForRaces(
    subset,
    (driverId) => contractTeam.get(driverId) ?? null,
    (driverId) => driverNameOf(model, driverId),
    teamNameOf,
  )
    .filter((d) => d.teamId != null && F1_TEAM_IDS.has(d.teamId) && d.name !== '')
    .map((d) => ({
      id: d.id,
      name: d.name,
      teamName: d.teamName,
      avgPoints: d.raceSet.size ? d.points / d.raceSet.size : 0,
      wins: d.wins,
      podiums: d.podiums,
      history: d.history,
    }));

  return {
    basis,
    sampleRaces: subset.length,
    teams: computeOdds(teamForms, ODDS_TEAM_BASELINE),
    drivers: computeOdds(driverForms, ODDS_DRIVER_BASELINE),
  };
}

/**
 * Dark horse — oracle getDarkHorse (queries.js:10746): ≥ 6 completed rounds,
 * recent = last 3, early = the rest; best avgPoints improvement excluding
 * favourites; team threshold 1.5, driver threshold 1.0.
 */
function buildDarkHorse(
  model: SaveModel,
  viewedRace: Race,
  favorites: GazetteFavorites,
  seasonRacesUpTo: Race[],
): GazetteDarkHorse | null {
  if (seasonRacesUpTo.length < DARK_HORSE_MIN_ROUNDS) return null;
  const sorted = seasonRacesUpTo.slice().sort((a, b) => a.day - b.day || a.raceId - b.raceId);
  const recent = sorted.slice(-3);
  const early = sorted.slice(0, -3);
  if (early.length < 3) return null;

  const teamNameOf = (id: number): string =>
    model.teams.find((t) => t.teamId === id)?.teamName ?? `Team ${id}`;
  const favTeamId = favorites.teams[0]?.id ?? null;
  const favDriverId = favorites.drivers[0]?.id ?? null;

  const teamEarly = avgByTeam(early, teamNameOf);
  const teamRecent = avgByTeam(recent, teamNameOf);
  let bestTeam: { id: number; teamName: string; earlyAvg: number; recentAvg: number; delta: number } | null = null;
  for (const t of teamRecent.values()) {
    if (t.id === favTeamId) continue;
    const e = teamEarly.get(t.id);
    if (!e) continue;
    const delta = t.avg - e.avg;
    if (delta < DARK_HORSE_TEAM_THRESHOLD) continue;
    if (!bestTeam || delta > bestTeam.delta) {
      bestTeam = { id: t.id, teamName: t.name, earlyAvg: e.avg, recentAvg: t.avg, delta };
    }
  }

  const contractTeam = new Map<number, number | null>(
    model.drivers.map((d) => [d.staffId, d.teamId ?? null] as const),
  );
  const driverEarly = avgByDriver(early, contractTeam, model, teamNameOf);
  const driverRecent = avgByDriver(recent, contractTeam, model, teamNameOf);
  let bestDriver: { id: number; name: string; teamName: string; earlyAvg: number; recentAvg: number; delta: number } | null = null;
  for (const d of driverRecent.values()) {
    if (d.id === favDriverId) continue;
    const e = driverEarly.get(d.id);
    if (!e) continue;
    const delta = d.avg - e.avg;
    if (delta < DARK_HORSE_DRIVER_THRESHOLD) continue;
    if (!bestDriver || delta > bestDriver.delta) {
      bestDriver = { id: d.id, name: d.name, teamName: d.teamName, earlyAvg: e.avg, recentAvg: d.avg, delta };
    }
  }

  if (!bestTeam && !bestDriver) return null;
  return {
    team: bestTeam
      ? {
          teamId: bestTeam.id,
          teamName: bestTeam.teamName,
          earlyAvg: round2(bestTeam.earlyAvg),
          recentAvg: round2(bestTeam.recentAvg),
          delta: round2(bestTeam.delta),
        }
      : null,
    driver: bestDriver
      ? {
          driverId: bestDriver.id,
          driverName: bestDriver.name,
          teamName: bestDriver.teamName,
          earlyAvg: round2(bestDriver.earlyAvg),
          recentAvg: round2(bestDriver.recentAvg),
          delta: round2(bestDriver.delta),
        }
      : null,
  };
}

function avgByTeam(races: Race[], teamNameOf: (id: number) => string): Map<number, { id: number; name: string; avg: number }> {
  const agg = new Map<number, { points: number; races: Set<number>; name: string }>();
  for (const race of races) {
    for (const res of race.results) {
      if (!F1_TEAM_IDS.has(res.teamId)) continue;
      const t = agg.get(res.teamId) ?? { points: 0, races: new Set<number>(), name: teamNameOf(res.teamId) };
      t.points += res.points;
      t.name = res.teamName;
      t.races.add(race.raceId);
      agg.set(res.teamId, t);
    }
  }
  const out = new Map<number, { id: number; name: string; avg: number }>();
  for (const [id, t] of agg) {
    if (t.races.size > 0) out.set(id, { id, name: t.name, avg: t.points / t.races.size });
  }
  return out;
}

function avgByDriver(
  races: Race[],
  contractTeam: Map<number, number | null>,
  model: SaveModel,
  teamNameOf: (id: number) => string,
): Map<number, { id: number; name: string; teamName: string; avg: number }> {
  const agg = new Map<number, { points: number; races: Set<number>; name: string; lastTeamId: number | null; lastRaceId: number }>();
  for (const race of races) {
    for (const res of race.results) {
      const d = agg.get(res.driverId) ?? {
        points: 0,
        races: new Set<number>(),
        name: res.driverName,
        lastTeamId: null,
        lastRaceId: -1,
      };
      d.points += res.points;
      d.name = res.driverName;
      d.races.add(race.raceId);
      if (race.raceId > d.lastRaceId) {
        d.lastRaceId = race.raceId;
        d.lastTeamId = res.teamId;
      }
      agg.set(res.driverId, d);
    }
  }
  const out = new Map<number, { id: number; name: string; teamName: string; avg: number }>();
  for (const [id, d] of agg) {
    const teamId = contractTeam.get(id) ?? d.lastTeamId;
    if (teamId == null || !F1_TEAM_IDS.has(teamId)) continue;
    out.set(id, { id, name: d.name, teamName: teamNameOf(teamId), avg: d.races.size ? d.points / d.races.size : 0 });
  }
  return out;
}

/**
 * Track trivia — oracle getNextTrackTrivia (queries.js:10683): completed
 * races at the next track up to the viewed race.
 */
function buildTrivia(model: SaveModel, nextRaceRow: Race, cutoff: { day: number; raceId: number }): GazetteTrivia | null {
  const past = model.races
    .filter(
      (r) =>
        r.trackId === nextRaceRow.trackId &&
        r.state === 2 &&
        isAtOrBefore(r, cutoff),
    )
    .sort((a, b) => b.day - a.day || b.raceId - a.raceId);
  if (past.length === 0) return null;

  const lastWinnerRow = past[0].results.find((r) => r.finishingPos === 1);
  const winCounts = new Map<number, { driverName: string; wins: number }>();
  for (const r of past) {
    for (const res of r.results) {
      if (res.dnf || res.finishingPos !== 1) continue;
      const w = winCounts.get(res.driverId) ?? { driverName: res.driverName, wins: 0 };
      w.wins += 1;
      winCounts.set(res.driverId, w);
    }
  }
  const mostWins = Array.from(winCounts.values()).sort((a, b) => b.wins - a.wins)[0];

  const lapRecord =
    nextRaceRow.trackFastestLapMs != null
      ? {
          lapMs: nextRaceRow.trackFastestLapMs,
          driverName:
            nextRaceRow.trackFastestLapDriverId != null
              ? driverNameOf(model, nextRaceRow.trackFastestLapDriverId) || undefined
              : undefined,
          year: nextRaceRow.trackFastestLapYear,
        }
      : undefined;

  return {
    timesRaced: past.length,
    lastWinner: lastWinnerRow
      ? { driverName: lastWinnerRow.driverName, teamName: lastWinnerRow.teamName }
      : undefined,
    mostWins: mostWins && mostWins.wins > 0 ? mostWins : undefined,
    lapRecord,
  };
}

/** Deterministic quote slots (oracle quotes.js — see header formulas). */
function buildQuoteSlots(race: Race, resultRows: GazetteResultRow[]): GazetteIssue['quoteSlots'] {
  const winner = resultRows.find((r) => r.finishPos === 1);
  if (!winner) {
    return { winner: { category: 'balanced', index: 0 }, random: null };
  }
  // Winner quote: dominant > 10 s, close < 2 s (oracle winnerQuote n:16806).
  const p2 = resultRows.find((r) => r.finishPos === 2);
  const gap = p2?.gapS;
  const category: WinnerQuoteCategory =
    gap != null && gap > 10 ? 'dominant' : gap != null && gap < 2 ? 'close' : 'balanced';
  const winnerSlot = { category, index: pickIndex(winner.driverId + race.raceId, 3) };

  // Random driver (oracle pickRandomDriver n:17046): pool excludes winner
  // and would-be DOTD — DOTD table does not exist in F1M24 saves (verified
  // against the introspected schema), so the pool only excludes the winner.
  const pool = resultRows.filter((r) => r.driverId !== winner.driverId);
  let random: GazetteIssue['quoteSlots']['random'] = null;
  if (pool.length > 0) {
    const picked = pool[(race.raceId * 7 + winner.driverId) % pool.length];
    const quoteCategory: RandomQuoteCategory = picked.dnf
      ? 'dnf'
      : picked.points > 0
        ? 'points'
        : picked.finishPos <= 12
          ? 'midfield'
          : 'backmarker';
    random = {
      driverId: picked.driverId,
      driverName: picked.driverName,
      category: quoteCategory,
      index: pickIndex(picked.driverId + race.raceId, 3),
    };
  }
  return { winner: winnerSlot, random };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
