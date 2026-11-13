/**
 * Pace Engine v1 — Phase 1 (docs/03-ANALYTICS-ENGINES.md §5.2).
 *
 * Question: "Tôi nhanh/chậm hơn đối thủ trực tiếp bao nhiêu?"
 *
 * v1 scope: team pace board from race fastest laps (Races_Results.FastestLap,
 * already normalized to ms), per-race normalized against the session's
 * fastest lap (removes track-to-track variation), median across races.
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

export const RIVAL_PACE_TOLERANCE_S = 0.5;
export const TREND_RACES = 6;

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

export function buildPaceBoard(
  model: SaveModel,
  options: PaceBoardOptions = {},
): EngineResult<PaceBoard> {
  const seasonId = model.meta.seasonId;
  const playerTeamId = model.player.teamId;
  const maxRaces = options.maxRaces ?? TREND_RACES;

  const completed = model.races
    .filter((r) => r.seasonId === seasonId && r.state === 2 && r.results.length > 0)
    .sort((a, b) => b.day - a.day) // latest first
    .slice(0, maxRaces);

  const warnings: string[] = [];
  if (completed.length === 0) {
    warnings.push('NO_COMPLETED_RACES');
  }

  /* per-race: best fastest lap per team + session fastest */
  interface RaceAgg { deltas: Map<number, number>; } // teamId → delta ms
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

  const usableRaces = raceAggs.filter((a) => a.deltas.size > 0);
  const teamIds = new Set<number>();
  for (const agg of usableRaces) for (const id of agg.deltas.keys()) teamIds.add(id);

  const teamName = (id: number): string =>
    model.teams.find((t) => t.teamId === id)?.teamName ?? model.races
      .flatMap((r) => r.results)
      .find((res) => res.teamId === id)?.teamName ?? `Team ${id}`;

  const medianOf = (values: number[]): number | null => {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };

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
      teamName: teamName(teamId),
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

  /* confidence (docs/00 §1.6 semantics) */
  let confidence: Confidence = 'LOW';
  if (playerRow && rivalRef && usableRaces.length >= 4) confidence = 'HIGH';
  else if (playerRow && rivalRef && usableRaces.length >= 2) confidence = 'MEDIUM';

  const evidence: Evidence[] = [];
  if (playerRow && rivalRef) {
    evidence.push({
      source: 'Races_Results.FastestLap',
      label: `Gap pace vs ${rivalRef.teamName}: ${playerVsRivalS !== null ? `${playerVsRivalS > 0 ? '+' : ''}${playerVsRivalS.toFixed(3)}s/vòng` : 'n/a'} (median ${usableRaces.length} chặng gần nhất)`,
      seasonId,
    });
  }
  evidence.push({
    source: 'Races_Results.FastestLap',
    label: `Pace board xếp hạng ${rows.length} đội theo median gap tới fastest lap của chặng (${usableRaces.length} chặng mùa ${seasonId})`,
    seasonId,
  });

  const assumptions: Assumption[] = [];
  if (usableRaces.length < 4) {
    assumptions.push({
      text: `Chỉ có ${usableRaces.length} chặng dữ liệu — pace median dễ bị nhiễu bởi tình huống đặc biệt (SC, thời tiết)`,
    });
  }
  assumptions.push({
    text: 'Pace đo bằng fastest lap trong race — không phản ánh race pace trung bình (sẽ bổ sung stint pace ở Phase 2)',
  });

  /* recommendations — 6-field standard */
  const recommendations: Recommendation[] = [];
  if (playerRow && rivalRef && playerVsRivalS != null) {
    const slower = playerVsRivalS > 0;
    recommendations.push({
      id: `pace-rival-${seasonId}`,
      title: slower
        ? `Đang chậm hơn ${rivalRef.teamName} ${playerVsRivalS.toFixed(3)}s/vòng`
        : `Đang nhanh hơn ${rivalRef.teamName} ${Math.abs(playerVsRivalS).toFixed(3)}s/vòng`,
      action: slower
        ? `Ưu tiên thu hẹp gap pace với ${rivalRef.teamName} (xếp hạng pace #${playerRow.rank} trên ${rows.length} đội) trước kỳ nâng cấp tiếp theo`
        : `Giữ lợi thế pace trước ${rivalRef.teamName}; tập trung nguồn lực vào mặt trận yếu hơn (pit, tyre preservation)`,
      why: `Median gap ${usableRaces.length} chặng gần nhất = ${playerVsRivalS > 0 ? '+' : ''}${playerVsRivalS.toFixed(3)}s/vòng${trendS != null ? `; xu hướng ${trendS < 0 ? 'đang thu hẹp' : 'đang mở rộng'} ${Math.abs(trendS).toFixed(3)}s so với nửa trước giai đoạn` : ''}. Đối thủ trực tiếp xác định theo standings (trên/dưới 1 bậc) + pace trong ±${RIVAL_PACE_TOLERANCE_S}s.`,
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
      playerVsRivalS,
      trendS,
      racesConsidered: usableRaces.length,
    },
    confidence,
    evidence,
    assumptions,
    recommendations,
    warnings,
  };
}
