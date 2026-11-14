/**
 * Pace Engine v1 — Phase 1 (docs/03-ANALYTICS-ENGINES.md §5.2) + v0.5.4.
 *
 * Two boards, one team-row shape, one shared assembly path:
 *
 *  - buildPaceBoard      — PEAK pace: fastest lap per team (Races_Results
 *                          .FastestLap, already normalized to ms), per-race
 *                          gap to the session's fastest lap, median across
 *                          races. One qualifying-sim snapshot per team.
 *  - buildRacePaceBoard  — RACE pace (v0.5.4): average raced lap per driver
 *                          (Races_Results.Time / Laps), best driver per team,
 *                          per-race gap to the session's best average, median
 *                          across races. The long-run story.
 *
 * Verified on the real Bahrain 2027 save (Day 46507, SQL-checked): the team
 * ranks #11/11 on peak pace (2.299s) but #7/11 on race pace (0.468s) — the
 * fastest lap alone told the wrong story, so both boards exist side by side.
 * Neither number is derived from the other; peak pace numbers are locked by
 * tests and MUST NOT change.
 *
 * Direct-rival definition (docs/03 §5.2, shown in UI): the teams immediately
 * above/below the player in the computed team standings, plus any team whose
 * median pace is within ±0.5 s of the player's.
 *
 * Pure function over the Normalized SaveModel — no React/DB/fetch.
 */

import type { Confidence, Evidence, Assumption, Recommendation } from '../domain/provenance';
import type { EngineResult } from '../domain/types';
import type { SaveModel } from '../domain/types';
import { buildResultsBoard } from './results.engine';

export const RIVAL_PACE_TOLERANCE_S = 0.5;
export const TREND_RACES = 6;

/**
 * v0.5.4 mandatory disclosure for the race pace board (and for every
 * peak-pace recommendation that quotes it): F1M24 saves carry no LapHistory,
 * so the raced average necessarily includes in/out pit laps.
 */
export const RACE_PACE_PIT_LAP_ASSUMPTION =
  'Vòng trung bình tính cả vòng vào/ra pit — tay đua ít pit hơn có lợi nhẹ; sẽ loại vòng pit khi có dữ liệu theo vòng';

export interface PaceTeamRow {
  teamId: number;
  teamName: string;
  /** Median per-race gap to that race's fastest lap, seconds (lower = faster). */
  paceDeltaS: number;
  /** Most recent race deltas first (latest race at index 0). */
  raceDeltasS: number[];
  samples: number;
  rank: number;
  isPlayer: boolean;
  isRival: boolean;
}

export interface PaceBoard {
  seasonId: number;
  rows: PaceTeamRow[];
  playerTeamId: number;
  /** The reference rival used in recommendations (nearest above/below). */
  rivals: PaceTeamRow[];
  /**
   * The single rival `playerVsRivalS` is measured against — the rival with
   * the closest median pace to the player. UI copy MUST use this team when
   * quoting `playerVsRivalS`; `rivals` may contain faster teams that are
   * NOT the reference (bug fix 0.4.1: Race Weekend quoted rivals[0]).
   */
  rivalRef: PaceTeamRow | null;
  /** Median (player − rival) per race, seconds; positive = player slower. */
  playerVsRivalS: number | null;
  /** Trend over the last races: negative = player closing the gap. */
  trendS: number | null;
  racesConsidered: number;
}

export interface PaceBoardOptions {
  /** Limit history to the N most recent completed races (default 6). */
  maxRaces?: number;
}

/* ── Shared board assembly (both boards) ─────────────────────────────────
 * One code path for rows → ranks → rivals → head-to-head so a rival fix
 * lands on both boards (0.4.1 lesson: the two must never diverge).
 */

/** Per-race aggregation: teamId → delta vs the session benchmark (ms). */
interface RaceAgg {
  deltas: Map<number, number>;
}

const medianOf = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const teamNameOf = (model: SaveModel, id: number): string =>
  model.teams.find((t) => t.teamId === id)?.teamName ?? model.races
    .flatMap((r) => r.results)
    .find((res) => res.teamId === id)?.teamName ?? `Team ${id}`;

interface TeamBoardCore {
  rows: PaceTeamRow[];
  playerRow: PaceTeamRow | null;
  rivals: PaceTeamRow[];
  rivalRef: PaceTeamRow | null;
  playerVsRivalS: number | null;
  trendS: number | null;
  usableRaces: number;
}

function assembleTeamBoard(
  model: SaveModel,
  playerTeamId: number,
  raceAggs: RaceAgg[],
): TeamBoardCore {
  const usableRaces = raceAggs.filter((a) => a.deltas.size > 0);
  const teamIds = new Set<number>();
  for (const agg of usableRaces) for (const id of agg.deltas.keys()) teamIds.add(id);

  const rows: PaceTeamRow[] = [];
  for (const teamId of teamIds) {
    const deltas: number[] = [];
    // raceAggs are latest-first; deltas follow that order for the trend.
    for (const agg of usableRaces) {
      const d = agg.deltas.get(teamId);
      if (d != null) deltas.push(Math.round((d / 1000) * 1000) / 1000);
    }
    const med = medianOf(deltas);
    if (med == null) continue;
    rows.push({
      teamId,
      teamName: teamNameOf(model, teamId),
      paceDeltaS: Math.round(med * 1000) / 1000,
      raceDeltasS: deltas,
      samples: deltas.length,
      rank: 0,
      isPlayer: teamId === playerTeamId,
      isRival: false,
    });
  }
  rows.sort((a, b) => a.paceDeltaS - b.paceDeltaS);
  rows.forEach((row, i) => { row.rank = i + 1; });

  /* rivals: standings neighbours ± pace-proximity (docs/03 §5.2) */
  const playerRow = rows.find((r) => r.isPlayer) ?? null;
  const standingsOrder = model.standings.teams.map((t) => t.id);
  const playerPos = standingsOrder.indexOf(playerTeamId);
  const neighbourIds = new Set<number>();
  if (playerPos > 0) neighbourIds.add(standingsOrder[playerPos - 1]);
  if (playerPos >= 0 && playerPos < standingsOrder.length - 1) {
    neighbourIds.add(standingsOrder[playerPos + 1]);
  }
  for (const row of rows) {
    if (playerRow && Math.abs(row.paceDeltaS - playerRow.paceDeltaS) <= RIVAL_PACE_TOLERANCE_S) {
      neighbourIds.add(row.teamId);
    }
  }
  neighbourIds.delete(playerTeamId);
  for (const row of rows) {
    if (neighbourIds.has(row.teamId)) row.isRival = true;
  }
  const rivals = rows.filter((r) => r.isRival);

  /* head-to-head pace: median of per-race (player − rival) */
  let playerVsRivalS: number | null = null;
  let trendS: number | null = null;
  const rivalRef = rivals
    .slice()
    .sort(
      (a, b) =>
        (playerRow ? Math.abs(a.paceDeltaS - playerRow.paceDeltaS) : 0) -
        (playerRow ? Math.abs(b.paceDeltaS - playerRow.paceDeltaS) : 0),
    )[0];
  if (playerRow && rivalRef) {
    const perRace: number[] = [];
    for (let i = 0; i < usableRaces.length; i++) {
      const p = usableRaces[i].deltas.get(playerTeamId);
      const q = usableRaces[i].deltas.get(rivalRef.teamId);
      if (p != null && q != null) perRace.push((p - q) / 1000);
    }
    if (perRace.length > 0) {
      playerVsRivalS = Math.round(medianOf(perRace)! * 1000) / 1000;
      // trend: compare recent half vs older half of the per-race diffs
      if (perRace.length >= 4) {
        const half = Math.floor(perRace.length / 2);
        const recent = medianOf(perRace.slice(0, half)) ?? 0;
        const older = medianOf(perRace.slice(half)) ?? 0;
        trendS = Math.round((recent - older) * 1000) / 1000;
      }
    }
  }

  return {
    rows,
    playerRow,
    rivals,
    rivalRef: rivalRef ?? null,
    playerVsRivalS,
    trendS,
    usableRaces: usableRaces.length,
  };
}

/**
 * v0.5.6 — the results-board counter-story for a pace recommendation.
 *
 * The pace gap says the car; the results board says the scoreboard. The
 * sentence always states the facts in the direction the numbers actually go
 * (rival better → the sentence says so), never only when it flatters the
 * player. Format (prompt v0.5.6 step 2):
 *   "Pace đua (vòng trung bình) chậm hơn Alpine 0.105s/vòng, nhưng trên kết
 *    quả bạn hơn: đối đầu thắng 5–1 (5/6 chặng), hơn 40 điểm (51 vs 11),
 *    DNF 1 vs 5."
 * Returns null when the rival has no results row/head-to-head in the window.
 */
function headToHeadSentence(
  model: SaveModel,
  options: PaceBoardOptions,
  rivalTeamId: number,
  rivalName: string,
  paceGapS: number, // player − rival, seconds (positive = player slower)
  metricLabel: string,
): string | null {
  const results = buildResultsBoard(model, options);
  const playerRow = results.data.rows.find((r) => r.isPlayer);
  const rivalRow = results.data.rows.find((r) => r.teamId === rivalTeamId);
  const h2h = rivalRow?.headToHead;
  if (!playerRow || !rivalRow || !h2h) return null;
  const counted = h2h.wins + h2h.losses;
  if (counted === 0) return null;

  const slower = paceGapS > 0;
  const paceClause = `${metricLabel} ${slower ? 'chậm hơn' : 'nhanh hơn'} ${rivalName} ${Math.abs(paceGapS).toFixed(3)}s/vòng`;
  const p = playerRow.points;
  const q = rivalRow.points;
  const ahead = p > q;
  const behind = p < q;
  const gap = Math.abs(p - q);
  let resultsClause: string;
  if (ahead) {
    resultsClause =
      `trên kết quả bạn hơn: đối đầu thắng ${h2h.wins}–${h2h.losses} (${h2h.wins}/${counted} chặng),` +
      ` hơn ${gap} điểm (${p} vs ${q}), DNF ${playerRow.dnfCount} vs ${rivalRow.dnfCount}`;
  } else if (behind) {
    resultsClause =
      `trên kết quả bạn kém: đối đầu thắng ${h2h.wins}–${h2h.losses} (${h2h.wins}/${counted} chặng),` +
      ` kém ${gap} điểm (${p} vs ${q}), DNF ${playerRow.dnfCount} vs ${rivalRow.dnfCount}`;
  } else {
    resultsClause =
      `kết quả ngang: đối đầu ${h2h.wins}–${h2h.losses} (${counted} chặng),` +
      ` điểm ngang (${p} vs ${q}), DNF ${playerRow.dnfCount} vs ${rivalRow.dnfCount}`;
  }
  const connector = ahead || behind ? (slower === ahead ? 'nhưng' : 'và') : 'và';
  return `${paceClause}, ${connector} ${resultsClause}.`;
}

/** Latest-first completed races of the current season, capped to the window. */
function completedRacesWindow(model: SaveModel, maxRaces: number) {
  return model.races
    .filter((r) => r.seasonId === model.meta.seasonId && r.state === 2 && r.results.length > 0)
    .sort((a, b) => b.day - a.day) // latest first
    .slice(0, maxRaces);
}

/* ── Peak pace board (fastest lap) ─────────────────────────────────────── */

export function buildPaceBoard(
  model: SaveModel,
  options: PaceBoardOptions = {},
): EngineResult<PaceBoard> {
  const seasonId = model.meta.seasonId;
  const playerTeamId = model.player.teamId;
  const maxRaces = options.maxRaces ?? TREND_RACES;

  const completed = completedRacesWindow(model, maxRaces);

  const warnings: string[] = [];
  if (completed.length === 0) {
    warnings.push('NO_COMPLETED_RACES');
  }

  /* per-race: best fastest lap per team + session fastest */
  const raceAggs: RaceAgg[] = [];
  for (const race of completed) {
    let sessionBest = Infinity;
    const teamBest = new Map<number, number>();
    for (const res of race.results) {
      if (res.dnf) continue;
      const lap = res.fastestLapMs;
      if (lap == null || lap <= 0) continue;
      if (lap < sessionBest) sessionBest = lap;
      const cur = teamBest.get(res.teamId);
      if (cur == null || lap < cur) teamBest.set(res.teamId, lap);
    }
    const agg: RaceAgg = { deltas: new Map<number, number>() };
    if (sessionBest < Infinity) {
      for (const [teamId, lap] of teamBest) {
        agg.deltas.set(teamId, lap - sessionBest);
      }
    }
    raceAggs.push(agg);
  }

  const core = assembleTeamBoard(model, playerTeamId, raceAggs);
  const { rows, playerRow, rivals, rivalRef, playerVsRivalS, trendS } = core;

  /* v0.5.4 step 2 — the peak-pace recommendation carries its own
   * counter-evidence. Peak pace is one push lap; the raced average
   * (buildRacePaceBoard) and the positions actually gained in the latest
   * completed race tell the long-run story. Computed here so the UI never
   * shows a bare peak-pace verdict. Peak NUMBERS stay untouched. */
  const racePace = buildRacePaceBoard(model, options);
  const racePlayerRow = racePace.data.rows.find((r) => r.isPlayer) ?? null;
  const h2hPeak =
    rivalRef && playerVsRivalS != null
      ? headToHeadSentence(model, options, rivalRef.teamId, rivalRef.teamName, playerVsRivalS, 'Pace đỉnh (fastest lap)')
      : null;
  const latestRace = completed[0] ?? null;
  const fmtSigned = (n: number): string => `${n >= 0 ? '+' : ''}${n}`;
  const gainRows = (latestRace?.results ?? [])
    .filter((r) => r.teamId === playerTeamId && !r.dnf && r.startingPos != null)
    .map((r) => ({
      name: r.driverName,
      gain: (r.startingPos ?? 0) - r.finishingPos,
      points: r.points,
    }));
  const totalGain = gainRows.reduce((s, g) => s + g.gain, 0);
  const totalPoints = gainRows.reduce((s, g) => s + g.points, 0);
  const counterEvidence = racePlayerRow
    ? `nhưng pace đua (vòng trung bình) hạng ${racePlayerRow.rank}/${racePace.data.rows.length}` +
      (gainRows.length > 0 && latestRace
        ? ` và leo ${fmtSigned(totalGain)} vị trí ở ${latestRace.trackName}` +
          ` (${gainRows.map((g) => `${g.name} ${fmtSigned(g.gain)}`).join(', ')}, ${totalPoints} điểm)`
        : '') +
      (totalGain > 0 ? ' — xe đua đường dài tốt hơn một vòng nhanh nhất' : '')
    : '';

  /* confidence (docs/00 §1.6 semantics) */
  let confidence: Confidence = 'LOW';
  if (playerRow && rivalRef && core.usableRaces >= 4) confidence = 'HIGH';
  else if (playerRow && rivalRef && core.usableRaces >= 2) confidence = 'MEDIUM';

  const evidence: Evidence[] = [];
  if (playerRow && rivalRef) {
    evidence.push({
      source: 'Races_Results.FastestLap',
      label: `Gap pace vs ${rivalRef.teamName}: ${playerVsRivalS !== null ? `${playerVsRivalS > 0 ? '+' : ''}${playerVsRivalS.toFixed(3)}s/vòng` : 'n/a'} (median ${core.usableRaces} chặng gần nhất)`,
      seasonId,
    });
  }
  evidence.push({
    source: 'Races_Results.FastestLap',
    label: `Pace board xếp hạng ${rows.length} đội theo median gap tới fastest lap của chặng (${core.usableRaces} chặng mùa ${seasonId})`,
    seasonId,
  });
  if (racePlayerRow) {
    evidence.push({
      source: 'Races_Results.Time / Laps',
      label: `Pace đua (vòng trung bình): hạng ${racePlayerRow.rank}/${racePace.data.rows.length}, median ${racePlayerRow.paceDeltaS.toFixed(3)}s — đối trọng với fastest lap`,
      seasonId,
    });
  }

  const assumptions: Assumption[] = [];
  if (core.usableRaces < 4) {
    assumptions.push({
      text: `Chỉ có ${core.usableRaces} chặng dữ liệu — pace median dễ bị nhiễu bởi tình huống đặc biệt (SC, thời tiết)`,
    });
  }
  assumptions.push({
    text: 'Pace đo bằng fastest lap trong race — không phản ánh race pace trung bình (sẽ bổ sung stint pace ở Phase 2)',
  });
  if (racePlayerRow) {
    assumptions.push({ text: RACE_PACE_PIT_LAP_ASSUMPTION });
  }

  /* recommendations — 6-field standard */
  const recommendations: Recommendation[] = [];
  if (playerRow && rivalRef && playerVsRivalS != null) {
    const slower = playerVsRivalS > 0;
    recommendations.push({
      id: `pace-rival-${seasonId}`,
      title: slower
        ? `Pace đỉnh đang chậm hơn ${rivalRef.teamName} ${playerVsRivalS.toFixed(3)}s/vòng (fastest lap)`
        : `Pace đỉnh đang nhanh hơn ${rivalRef.teamName} ${Math.abs(playerVsRivalS).toFixed(3)}s/vòng (fastest lap)`,
      action: slower
        ? `Ưu tiên thu hẹp gap pace với ${rivalRef.teamName} (xếp hạng pace đỉnh #${playerRow.rank} trên ${rows.length} đội) trước kỳ nâng cấp tiếp theo`
        : `Giữ lợi thế pace trước ${rivalRef.teamName}; tập trung nguồn lực vào mặt trận yếu hơn (pit, tyre preservation)`,
      why: `Median gap ${core.usableRaces} chặng gần nhất = ${playerVsRivalS > 0 ? '+' : ''}${playerVsRivalS.toFixed(3)}s/vòng${trendS != null ? `; xu hướng ${trendS < 0 ? 'đang thu hẹp' : 'đang mở rộng'} ${Math.abs(trendS).toFixed(3)}s so với nửa trước giai đoạn` : ''}. Đối thủ trực tiếp xác định theo standings (trên/dưới 1 bậc) + pace trong ±${RIVAL_PACE_TOLERANCE_S}s.${counterEvidence ? ` ${counterEvidence}.` : ''}${h2hPeak ? ` ${h2hPeak}` : ''}`,
      confidence,
      evidence,
      assumptions,
      riskIfIgnored: slower
        ? 'Gap pace không thu hẹp → mất vị trí standings và lợi thế pit undercut ở các chặng tới'
        : undefined,
    });
  } else {
    recommendations.push({
      id: `pace-nodata-${seasonId}`,
      title: 'Chưa đủ dữ liệu pace đối trọng',
      action: 'Nạp save sau chặng kế tiếp để pace board có dữ liệu so sánh trực tiếp',
      why: 'Không tìm thấy đội đối trọng có đủ fastest-lap data trong các chặng đã hoàn thành của mùa hiện tại.',
      confidence: 'LOW',
      evidence,
      assumptions,
    });
  }

  return {
    data: {
      seasonId,
      rows,
      playerTeamId,
      rivals,
      rivalRef: rivalRef ?? null,
      playerVsRivalS,
      trendS,
      racesConsidered: core.usableRaces,
    },
    confidence,
    evidence,
    assumptions,
    recommendations,
    warnings,
  };
}

/* ── Race pace board (v0.5.4 — average raced lap) ────────────────────────
 * Definition (prompt v0.5.4 step 1, verified on Bahrain Day 46507):
 *   - completed races of the current season, same TREND_RACES window as
 *     peak pace;
 *   - per driver per race: avgLapMs = totalTimeMs / laps. DNF rows and rows
 *     with laps <= 0 or totalTimeMs <= 0 are excluded;
 *   - per race: teamBest = best avg lap among the team's drivers;
 *     raceBest = best avg lap of the session; team delta = teamBest −
 *     raceBest (ms → s);
 *   - paceDeltaS = median of the per-race deltas; raceDeltasS latest first;
 *   - playerVsRivalS = median of per-race (player − rival) diffs — the same
 *     rule as peak pace (median of diffs, NOT diff of medians).
 * Known limitation (assumption below, mandatory): the average includes
 * in/out pit laps — no LapHistory in F1M24 saves, this is the best available
 * proxy for true stint pace. Confidence caps at MEDIUM (≥3 races).
 */
export function buildRacePaceBoard(
  model: SaveModel,
  options: PaceBoardOptions = {},
): EngineResult<PaceBoard> {
  const seasonId = model.meta.seasonId;
  const playerTeamId = model.player.teamId;
  const maxRaces = options.maxRaces ?? TREND_RACES;

  const completed = completedRacesWindow(model, maxRaces);

  const warnings: string[] = [];
  if (completed.length === 0) {
    warnings.push('NO_COMPLETED_RACES');
  }

  /* per-race: best average lap per team + session best average */
  const raceAggs: RaceAgg[] = [];
  for (const race of completed) {
    let raceBest = Infinity;
    const teamBest = new Map<number, number>();
    for (const res of race.results) {
      if (res.dnf) continue;
      if (res.laps == null || res.laps <= 0) continue;
      if (res.totalTimeMs == null || res.totalTimeMs <= 0) continue;
      const avgLapMs = res.totalTimeMs / res.laps;
      if (avgLapMs < raceBest) raceBest = avgLapMs;
      const cur = teamBest.get(res.teamId);
      if (cur == null || avgLapMs < cur) teamBest.set(res.teamId, avgLapMs);
    }
    const agg: RaceAgg = { deltas: new Map<number, number>() };
    if (raceBest < Infinity) {
      for (const [teamId, avg] of teamBest) {
        agg.deltas.set(teamId, avg - raceBest);
      }
    }
    raceAggs.push(agg);
  }

  const core = assembleTeamBoard(model, playerTeamId, raceAggs);
  const { rows, playerRow, rivals, rivalRef, playerVsRivalS, trendS } = core;

  /* confidence — capped at MEDIUM: avg-lap proxy, no per-lap data yet */
  const confidence: Confidence = core.usableRaces >= 3 ? 'MEDIUM' : 'LOW';
  const h2hRace =
    rivalRef && playerVsRivalS != null
      ? headToHeadSentence(model, options, rivalRef.teamId, rivalRef.teamName, playerVsRivalS, 'Pace đua (vòng trung bình)')
      : null;

  const evidence: Evidence[] = [];
  if (playerRow && rivalRef) {
    evidence.push({
      source: 'Races_Results.Time / Laps',
      label: `Gap pace đua vs ${rivalRef.teamName}: ${playerVsRivalS !== null ? `${playerVsRivalS > 0 ? '+' : ''}${playerVsRivalS.toFixed(3)}s/vòng` : 'n/a'} (median ${core.usableRaces} chặng gần nhất)`,
      seasonId,
    });
  }
  evidence.push({
    source: 'Races_Results.Time / Laps',
    label: `Pace đua xếp hạng ${rows.length} đội theo median gap vòng trung bình tới đội có vòng trung bình nhanh nhất chặng (${core.usableRaces} chặng mùa ${seasonId})`,
    seasonId,
  });

  const assumptions: Assumption[] = [{ text: RACE_PACE_PIT_LAP_ASSUMPTION }];
  if (core.usableRaces < 3) {
    assumptions.push({
      text: `Chỉ có ${core.usableRaces} chặng dữ liệu — pace median dễ bị nhiễu bởi tình huống đặc biệt (SC, thời tiết)`,
    });
  }

  /* recommendations — 6-field standard, race-pace framing */
  const recommendations: Recommendation[] = [];
  if (playerRow && rivalRef && playerVsRivalS != null) {
    const slower = playerVsRivalS > 0;
    recommendations.push({
      id: `race-pace-rival-${seasonId}`,
      title: slower
        ? `Pace đua (vòng trung bình) đang chậm hơn ${rivalRef.teamName} ${playerVsRivalS.toFixed(3)}s/vòng`
        : `Pace đua (vòng trung bình) đang nhanh hơn ${rivalRef.teamName} ${Math.abs(playerVsRivalS).toFixed(3)}s/vòng`,
      action: slower
        ? `So sánh hạng pace đua #${playerRow.rank}/${rows.length} với hạng pace đỉnh khi đánh giá xe — vòng đua đường dài mới là điều kiện đua thật`
        : `Giữ lợi thế pace đua trước ${rivalRef.teamName}; pace đỉnh chỉ phản ánh một vòng push`,
      why: `Median gap ${core.usableRaces} chặng gần nhất = ${playerVsRivalS > 0 ? '+' : ''}${playerVsRivalS.toFixed(3)}s/vòng${trendS != null ? `; xu hướng ${trendS < 0 ? 'đang thu hẹp' : 'đang mở rộng'} ${Math.abs(trendS).toFixed(3)}s so với nửa trước giai đoạn` : ''}. ${RACE_PACE_PIT_LAP_ASSUMPTION}.${h2hRace ? ` ${h2hRace}` : ''}`,
      confidence,
      evidence,
      assumptions,
      riskIfIgnored: slower
        ? 'Chỉ nhìn pace đỉnh (fastest lap) → đánh giá sai xe: đội chậm hơn trên giấy có thể đua đường dài tốt hơn'
        : undefined,
    });
  } else {
    recommendations.push({
      id: `race-pace-nodata-${seasonId}`,
      title: 'Chưa đủ dữ liệu pace đua',
      action: 'Nạp save sau chặng kế tiếp để pace đua (Time/Laps) có dữ liệu so sánh trực tiếp',
      why: 'Không tìm thấy kết quả có totalTimeMs/laps đo được trong các chặng đã hoàn thành của mùa hiện tại.',
      confidence: 'LOW',
      evidence,
      assumptions,
    });
  }

  return {
    data: {
      seasonId,
      rows,
      playerTeamId,
      rivals,
      rivalRef: rivalRef ?? null,
      playerVsRivalS,
      trendS,
      racesConsidered: core.usableRaces,
    },
    confidence,
    evidence,
    assumptions,
    recommendations,
    warnings,
  };
}
