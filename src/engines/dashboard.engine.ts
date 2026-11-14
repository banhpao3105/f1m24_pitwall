/**
 * Dashboard Engine v1 — v0.6.0 step 1 (docs/04 §7.3.1 dashboard-first).
 *
 * Question: "Mùa giải của đội bạn đang đi theo hướng nào, từng chặng một?"
 * One pure function, buildSeasonSeries, produces every per-race series the
 * dashboard charts draw — so Home/Race Weekend/Season all render the SAME
 * numbers (prompt v0.6.0 §8 verification list).
 *
 * Window: completed races of the current season, max DASHBOARD_WINDOW (6) —
 * the same window as the pace boards (TREND_RACES) and the results board
 * (RESULTS_WINDOW), so every dashboard chart describes the same stretch.
 *
 * Series (chronological, oldest first — charts read left→right):
 *   - pointsCumulative     — cumulative Races_Results.Points per team.
 *   - pointsPerRace        — per-race points of the player + nearest rival
 *                            (results-board reference: the team directly
 *                            above the player, else the chaser below).
 *   - positionsGainedPerRace — sum (startingPos − finishingPos) of the
 *                            player's non-DNF cars, per race (DNF excluded,
 *                            same rule as the results board).
 *   - paceGapPerRace       — the player's per-race peak + race pace gaps,
 *                            taken VERBATIM from the pace boards'
 *                            raceDeltasS arrays (never recomputed here);
 *                            race identity is restored by re-deriving only
 *                            the eligibility filter, not any pace number.
 *   - bestFinishPerRace    — the player's best classified finish per race.
 *
 * Pure function over the Normalized SaveModel — no React/DB/fetch.
 */

import type { Confidence, Evidence, Assumption, Recommendation } from '../domain/provenance';
import type { EngineResult, SaveModel } from '../domain/types';
import { buildPaceBoard, buildRacePaceBoard, RACE_PACE_PIT_LAP_ASSUMPTION, TREND_RACES } from './pace.engine';
import { buildResultsBoard } from './results.engine';

export const DASHBOARD_WINDOW = TREND_RACES;

export interface SeasonSeriesTeamRow {
  teamId: number;
  teamName: string;
  isPlayer: boolean;
  /** Values aligned with `races` (chronological). */
  values: number[];
}

export interface SeasonSeries {
  seasonId: number;
  /** Chronological window races, oldest first (max DASHBOARD_WINDOW). */
  races: { raceId: number; trackName: string; day: number }[];
  playerTeamId: number;
  /** Cumulative constructors points after each race, final value first. */
  pointsCumulative: SeasonSeriesTeamRow[];
  /** Per-race points: player + nearest rival (results ranking). */
  pointsPerRace: {
    player: number[];
    rival: { teamId: number; teamName: string; values: number[] } | null;
  };
  /** Player per-race positions gained (non-DNF only). */
  positionsGainedPerRace: number[];
  /** Per-team per-race positions gained (covers the player's rivals too). */
  gainedPerTeam: SeasonSeriesTeamRow[];
  /** Player per-race pace gaps in seconds (peak = fastest lap board,
   * race = average raced lap board); null where that race has no delta. */
  paceGapPerRace: { peak: (number | null)[]; race: (number | null)[] };
  /** Player best classified finish per race; null when no car finished. */
  bestFinishPerRace: (number | null)[];
  racesConsidered: number;
}

export interface SeasonSeriesOptions {
  /** Limit history to the N most recent completed races (default 6). */
  maxRaces?: number;
}

/** Chronological completed races of the current season, capped to the window
 * (oldest first — the reverse of the pace boards' latest-first window). */
function chronologicalWindow(model: SaveModel, maxRaces: number) {
  return model.races
    .filter((r) => r.seasonId === model.meta.seasonId && r.state === 2 && r.results.length > 0)
    .sort((a, b) => b.day - a.day) // latest first
    .slice(0, maxRaces)
    .sort((a, b) => a.day - b.day); // chronological for the charts
}

const teamNameOf = (model: SaveModel, id: number): string =>
  model.teams.find((t) => t.teamId === id)?.teamName ??
  model.races.flatMap((r) => r.results).find((res) => res.teamId === id)?.teamName ??
  `Team ${id}`;

/** Does this race carry a session benchmark AND a valid player car?
 *  Mirrors the pace boards' row filter EXACTLY (non-DNF + valid metric) —
 *  this re-derives the eligibility filter only; gap values themselves are
 *  consumed from the boards' raceDeltasS, never recomputed. */
function playerPaceEligibility(
  race: SaveModel['races'][number],
  playerTeamId: number,
  metric: 'fastestLap' | 'avgLap',
): boolean {
  let sessionBest = Infinity;
  let playerValid = false;
  for (const res of race.results) {
    if (res.dnf) continue;
    let valid = false;
    let value = Infinity;
    if (metric === 'fastestLap') {
      if (res.fastestLapMs != null && res.fastestLapMs > 0) {
        valid = true;
        value = res.fastestLapMs;
      }
    } else {
      if (res.laps != null && res.laps > 0 && res.totalTimeMs != null && res.totalTimeMs > 0) {
        valid = true;
        value = res.totalTimeMs / res.laps;
      }
    }
    if (!valid) continue;
    if (value < sessionBest) sessionBest = value;
    if (res.teamId === playerTeamId) playerValid = true;
  }
  return sessionBest < Infinity && playerValid;
}

export function buildSeasonSeries(
  model: SaveModel,
  options: SeasonSeriesOptions = {},
): EngineResult<SeasonSeries> {
  const seasonId = model.meta.seasonId;
  const playerTeamId = model.player.teamId;
  const maxRaces = options.maxRaces ?? DASHBOARD_WINDOW;

  const races = chronologicalWindow(model, maxRaces);
  const warnings: string[] = [];
  if (races.length === 0) warnings.push('NO_COMPLETED_RACES');

  /* ── per-race accumulation (points, gains, best finish) ─────────────── */
  const cumByTeam = new Map<number, number>();
  const perRacePoints = new Map<number, number[]>(); // teamId → chronological
  const perRaceGained = new Map<number, number[]>();
  const playerBestFinish: (number | null)[] = [];

  for (const race of races) {
    const racePoints = new Map<number, number>();
    const raceGained = new Map<number, number>();
    let playerBest: number | null = null;
    for (const res of race.results) {
      racePoints.set(res.teamId, (racePoints.get(res.teamId) ?? 0) + res.points);
      if (!res.dnf) {
        raceGained.set(
          res.teamId,
          (raceGained.get(res.teamId) ?? 0) + (res.startingPos != null ? res.startingPos - res.finishingPos : 0),
        );
        if (res.teamId === playerTeamId) {
          if (playerBest == null || res.finishingPos < playerBest) playerBest = res.finishingPos;
        }
      }
    }
    for (const [teamId, pts] of racePoints) {
      cumByTeam.set(teamId, (cumByTeam.get(teamId) ?? 0) + pts);
    }
    const allTeamIds = new Set<number>([...racePoints.keys(), ...raceGained.keys()]);
    for (const teamId of allTeamIds) {
      if (!perRacePoints.has(teamId)) perRacePoints.set(teamId, []);
      if (!perRaceGained.has(teamId)) perRaceGained.set(teamId, []);
      perRacePoints.get(teamId)!.push(racePoints.get(teamId) ?? 0);
      perRaceGained.get(teamId)!.push(raceGained.get(teamId) ?? 0);
    }
    playerBestFinish.push(playerBest);
  }

  /* cumulative rows — all teams that scored/appeared in the window */
  const pointsCumulative: SeasonSeriesTeamRow[] = [];
  for (const [teamId, final] of cumByTeam) {
    const perRace = perRacePoints.get(teamId) ?? [];
    const values: number[] = [];
    let run = 0;
    for (const p of perRace) {
      run += p;
      values.push(run);
    }
    pointsCumulative.push({
      teamId,
      teamName: teamNameOf(model, teamId),
      isPlayer: teamId === playerTeamId,
      values,
    });
  }
  pointsCumulative.sort((a, b) => {
    const fa = a.values.at(-1) ?? 0;
    const fb = b.values.at(-1) ?? 0;
    if (fa !== fb) return fb - fa;
    return a.teamId - b.teamId;
  });

  /* gained rows — every team with at least one classified car */
  const gainedPerTeam: SeasonSeriesTeamRow[] = [];
  for (const [teamId, values] of perRaceGained) {
    gainedPerTeam.push({
      teamId,
      teamName: teamNameOf(model, teamId),
      isPlayer: teamId === playerTeamId,
      values: [...values],
    });
  }
  gainedPerTeam.sort((a, b) => a.teamId - b.teamId);

  /* player series + nearest rival (results-board reference, above first) */
  const results = buildResultsBoard(model, { maxRaces });
  const playerResultsRow = results.data.rows.find((r) => r.isPlayer) ?? null;
  const referenceRow =
    (playerResultsRow
      ? results.data.rows.find((r) => r.rank === playerResultsRow.rank - 1) ??
        results.data.rows.find((r) => r.rank === playerResultsRow.rank + 1)
      : null) ?? null;

  const positionsGainedPerRace =
    gainedPerTeam.find((r) => r.isPlayer)?.values ?? races.map(() => 0);

  const pointsPerRace: SeasonSeries['pointsPerRace'] = {
    player: perRacePoints.get(playerTeamId) ?? races.map(() => 0),
    rival: referenceRow
      ? {
          teamId: referenceRow.teamId,
          teamName: referenceRow.teamName,
          values: perRacePoints.get(referenceRow.teamId) ?? races.map(() => 0),
        }
      : null,
  };

  /* ── pace gaps: consumed verbatim from the pace boards ───────────────── */
  const peakBoard = buildPaceBoard(model, { maxRaces });
  const raceBoard = buildRacePaceBoard(model, { maxRaces });
  const peakRow = peakBoard.data.rows.find((r) => r.isPlayer) ?? null;
  const raceRow = raceBoard.data.rows.find((r) => r.isPlayer) ?? null;

  const latestFirstRaces = [...races].sort((a, b) => b.day - a.day);
  const alignPaceSeries = (
    row: { raceDeltasS: number[] } | null,
    metric: 'fastestLap' | 'avgLap',
  ): (number | null)[] => {
    const chronological: (number | null)[] = races.map(() => null);
    if (!row) return chronological;
    const eligible = latestFirstRaces.filter((race) =>
      playerPaceEligibility(race, playerTeamId, metric),
    );
    if (eligible.length !== row.raceDeltasS.length) {
      warnings.push('PACE_SERIES_MISALIGNED');
      return chronological;
    }
    // eligible + raceDeltasS are both latest-first; zip, then place on the
    // chronological axis by race identity.
    eligible.forEach((race, i) => {
      const idx = races.findIndex((r) => r.raceId === race.raceId);
      if (idx >= 0) chronological[idx] = row.raceDeltasS[i];
    });
    return chronological;
  };

  const paceGapPerRace = {
    peak: alignPaceSeries(peakRow, 'fastestLap'),
    race: alignPaceSeries(raceRow, 'avgLap'),
  };

  /* ── confidence / evidence / assumptions / recommendation ────────────── */
  let confidence: Confidence = 'LOW';
  if (races.length >= 4) confidence = 'HIGH';
  else if (races.length >= 2) confidence = 'MEDIUM';

  const evidence: Evidence[] = [
    {
      source: 'Races_Results.Points',
      label: `Điểm tích lũy + điểm từng chặng (Races_Results.Points) qua ${races.length} chặng đã xong gần nhất của mùa ${seasonId} — cùng cửa sổ ${DASHBOARD_WINDOW} chặng với bảng pace`,
      seasonId,
    },
    {
      source: 'Races_Results.Position + StartingPosition',
      label: 'Leo vị trí từng chặng = Σ(startingPos − finishingPos) của xe về đích; best finish = vị trí tốt nhất của xe về đích',
      seasonId,
    },
    {
      source: 'Pace boards (raceDeltasS)',
      label: 'Gap pace đỉnh + pace đua từng chặng lấy nguyên văn từ raceDeltasS của 2 bảng pace — dashboard không tính lại pace',
      seasonId,
    },
  ];

  const assumptions: Assumption[] = [
    {
      text: 'Rival gần nhất = đội đứng ngay trên bạn trong bảng kết quả thực chiến (nếu bạn đang dẫn thì là đội theo sát ngay dưới) — cùng quy tắc chọn đối trọng với recommendation bảng kết quả',
    },
    { text: RACE_PACE_PIT_LAP_ASSUMPTION },
  ];
  if (races.length < 4 && races.length > 0) {
    assumptions.push({
      text: `Chỉ có ${races.length} chặng dữ liệu — xu hướng từng chặng dễ đổi sau một chặng bất thường`,
    });
  }

  const recommendations: Recommendation[] = [];
  const finalCum = pointsCumulative.find((r) => r.isPlayer)?.values.at(-1) ?? null;
  if (playerResultsRow && finalCum != null && races.length > 0) {
    const ahead =
      referenceRow != null && finalCum > (pointsCumulative.find((r) => r.teamId === referenceRow.teamId)?.values.at(-1) ?? 0);
    const behind =
      referenceRow != null && finalCum < (pointsCumulative.find((r) => r.teamId === referenceRow.teamId)?.values.at(-1) ?? 0);
    const gap = referenceRow
      ? Math.abs(
          finalCum - (pointsCumulative.find((r) => r.teamId === referenceRow.teamId)?.values.at(-1) ?? 0),
        )
      : 0;
    recommendations.push({
      id: `season-series-${seasonId}`,
      title: `Sau ${races.length} chặng: ${finalCum} điểm tích lũy, hạng ${playerResultsRow.rank} bảng kết quả`,
      action: ahead
        ? `Giữ nhịp hiện tại — bạn đang trên ${referenceRow?.teamName} ${gap} điểm trong cửa sổ`
        : behind
          ? `Tìm điểm sớm ở các chặng tới — ${referenceRow?.teamName} đang trên bạn ${gap} điểm trong cửa sổ`
          : 'Giữ phương hướng — điểm tích lũy ngang đối trọng trực tiếp trong cửa sổ',
      why: `Chuỗi điểm tích lũy, leo vị trí và gap pace từng chặng của dashboard đều tính từ Races_Results cùng cửa sổ với bảng pace và bảng kết quả thực chiến; pace gap lấy nguyên văn từ raceDeltasS, không có số liệu mới nào được phát minh.`,
      confidence,
      evidence,
      assumptions,
      riskIfIgnored: behind
        ? 'Để tụt điểm kéo dài thêm vài chặng nữa → mất vị trí standings trước đối trọng trực tiếp'
        : undefined,
    });
  } else {
    recommendations.push({
      id: `season-series-nodata-${seasonId}`,
      title: 'Chưa có chuỗi số liệu mùa giải',
      action: 'Nạp save sau chặng kế tiếp để dashboard có chuỗi điểm/pace theo từng chặng',
      why: 'Không có chặng nào hoàn thành trong mùa hiện tại — chuỗi tích lũy cần ít nhất 1 chặng đã đua.',
      confidence: 'LOW',
      evidence,
      assumptions,
    });
  }

  return {
    data: {
      seasonId,
      races: races.map((r) => ({ raceId: r.raceId, trackName: r.trackName, day: r.day })),
      playerTeamId,
      pointsCumulative,
      pointsPerRace,
      positionsGainedPerRace,
      gainedPerTeam,
      paceGapPerRace,
      bestFinishPerRace: [...playerBestFinish],
      racesConsidered: races.length,
    },
    confidence,
    evidence,
    assumptions,
    recommendations,
    warnings,
  };
}
