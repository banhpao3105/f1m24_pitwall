/**
 * Results Engine v1 — v0.5.6 (docs/03 §5.2 companion board to the pace boards).
 *
 * Question: "Đội nào đang mạnh hơn TRÊN KẾT QUẢ đua thật — điểm, vị trí về
 * đích, DNF, đối đầu trực tiếp?" The pace boards measure the car; this board
 * measures the scoreboard. Both stay side by side — the engine deliberately
 * does NOT merge them into one weighted "power score" (no invented weights).
 *
 * Window: completed races of the current season, max RESULTS_WINDOW (6) —
 * the same window as the pace boards (TREND_RACES), so the two boards always
 * describe the same stretch of the season.
 *
 * Per team per race (source Races_Results, pre-joined in the SaveModel):
 *   - points          — sum of Points over ALL rows (a classified DNF can
 *                       still score; the game already stored the value).
 *   - best finish     — best finishingPos among NON-DNF cars (DNF excluded).
 *   - dnfCount/starts — DNF rows and total rows in the window.
 *   - positionsGained — sum (startingPos − finishingPos) over non-DNF cars
 *                       only, i.e. DNF rows never contribute (their grid slot
 *                       was lost by retirement, not by racecraft).
 *
 * headToHead (vs the player's team, from the PLAYER's perspective):
 *   per race — the team with the better best finish wins; a team with no
 *   finisher loses to a team that has one; when NEITHER team has a finisher
 *   the race is excluded from the count. Equal best finishes cannot happen
 *   between two distinct cars, but the defensive branch excludes the race.
 *
 * Verified against the real Miami 2027 save (season aggregates supplied by
 * the project owner): CustomTeam P5 · 51 pts vs Alpine P7 · 11 pts, head-to
 * -head 5–1, DNF 1 vs 5 — locked by tests/engines/results.engine.test.ts.
 *
 * Pure function over the Normalized SaveModel — no React/DB/fetch.
 */

import type { Confidence, Evidence, Assumption, Recommendation } from '../domain/provenance';
import type { EngineResult, SaveModel } from '../domain/types';

export const RESULTS_WINDOW = 6;

/**
 * v0.5.6 mandatory disclosures (prompt-required, shown in the UI):
 * positions gained favours bad qualifiers, and the median best finish drops
 * races where the team had no classified finisher (DNFs live in their own
 * column instead of being silently dropped like they were in peak pace).
 */
export const POSITIONS_GAINED_ASSUMPTION =
  'Vị trí leo được thiên vị đội phân hạng tệ (đội đầu đoàn thường âm vì không còn chỗ để leo) — chỉ đọc cùng điểm số, không đọc riêng';

export const MEDIAN_BEST_FINISH_ASSUMPTION =
  'Median best finish loại chặng đội không có xe về đích (xem cột mẫu); DNF hiện ở cột riêng, không bị giấu như ở bảng pace';

export interface ResultsHeadToHead {
  /** Races where the PLAYER's best finish beat this team's. */
  wins: number;
  /** Races where this team's best finish beat the player's. */
  losses: number;
  /** Races excluded from the count (both teams without a finisher, or a
   * defensive tie between identical best positions). */
  excluded: number;
}

export interface ResultsTeamRow {
  teamId: number;
  teamName: string;
  /** Total points in the window (all result rows, DNF included). */
  points: number;
  /** points / races in the window (raw division; the UI rounds for display). */
  pointsPerRace: number;
  /** Median of the per-race best finishes; null when the team never had a
   * classified finisher inside the window. */
  medianBestFinish: number | null;
  /** Per-race best finishes, latest race first (mirrors raceDeltasS). */
  bestFinishes: number[];
  /** Races inside the window where the team had ≥1 non-DNF car. */
  samples: number;
  dnfCount: number;
  starts: number;
  positionsGained: number;
  /** vs the player's team, from the player's perspective; null for the
   * player's own row. */
  headToHead: ResultsHeadToHead | null;
  rank: number;
  isPlayer: boolean;
}

export interface ResultsBoard {
  seasonId: number;
  /** Number of completed races inside the window (the same window as pace). */
  racesConsidered: number;
  rows: ResultsTeamRow[];
  playerTeamId: number;
}

export interface ResultsBoardOptions {
  /** Limit history to the N most recent completed races (default 6). */
  maxRaces?: number;
}

const medianOf = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const teamNameOf = (model: SaveModel, id: number): string =>
  model.teams.find((t) => t.teamId === id)?.teamName ??
  model.races.flatMap((r) => r.results).find((res) => res.teamId === id)?.teamName ??
  `Team ${id}`;

/** Mutable per-team accumulator over the window. */
interface TeamAcc {
  points: number;
  dnfCount: number;
  starts: number;
  positionsGained: number;
  /** Best finishes per counted race, latest race first. */
  bestFinishes: number[];
  headToHead: ResultsHeadToHead;
}

const newAcc = (): TeamAcc => ({
  points: 0,
  dnfCount: 0,
  starts: 0,
  positionsGained: 0,
  bestFinishes: [],
  headToHead: { wins: 0, losses: 0, excluded: 0 },
});

/** Latest-first completed races of the current season, capped to the window —
 * the exact same window rule as the pace boards. */
function completedRacesWindow(model: SaveModel, maxRaces: number) {
  return model.races
    .filter((r) => r.seasonId === model.meta.seasonId && r.state === 2 && r.results.length > 0)
    .sort((a, b) => b.day - a.day) // latest first
    .slice(0, maxRaces);
}

export function buildResultsBoard(
  model: SaveModel,
  options: ResultsBoardOptions = {},
): EngineResult<ResultsBoard> {
  const seasonId = model.meta.seasonId;
  const playerTeamId = model.player.teamId;
  const maxRaces = options.maxRaces ?? RESULTS_WINDOW;

  const completed = completedRacesWindow(model, maxRaces);

  const warnings: string[] = [];
  if (completed.length === 0) {
    warnings.push('NO_COMPLETED_RACES');
  }

  const acc = new Map<number, TeamAcc>();

  for (const race of completed) {
    /* per-race scratch: best non-DNF finish, points, DNFs, starts, gains */
    const perTeam = new Map<
      number,
      { best: number | null; points: number; dnf: number; starts: number; gained: number }
    >();
    for (const res of race.results) {
      let e = perTeam.get(res.teamId);
      if (!e) {
        e = { best: null, points: 0, dnf: 0, starts: 0, gained: 0 };
        perTeam.set(res.teamId, e);
      }
      e.starts += 1;
      e.points += res.points;
      if (res.dnf) {
        e.dnf += 1;
      } else {
        if (e.best == null || res.finishingPos < e.best) e.best = res.finishingPos;
        if (res.startingPos != null) {
          e.gained += res.startingPos - res.finishingPos;
        }
      }
    }

    const playerBest = perTeam.get(playerTeamId)?.best ?? null;

    for (const [teamId, e] of perTeam) {
      let a = acc.get(teamId);
      if (!a) {
        a = newAcc();
        acc.set(teamId, a);
      }
      a.points += e.points;
      a.dnfCount += e.dnf;
      a.starts += e.starts;
      a.positionsGained += e.gained;
      if (e.best != null) a.bestFinishes.push(e.best);

      /* head-to-head vs the player, from the player's perspective */
      if (teamId !== playerTeamId) {
        if (playerBest == null && e.best == null) {
          a.headToHead.excluded += 1; // neither team finished → race dropped
        } else if (playerBest == null) {
          a.headToHead.losses += 1; // rival finished, player did not
        } else if (e.best == null) {
          a.headToHead.wins += 1; // player finished, rival did not
        } else if (e.best < playerBest) {
          a.headToHead.losses += 1;
        } else if (e.best > playerBest) {
          a.headToHead.wins += 1;
        } else {
          // distinct cars cannot share a classification; exclude defensively
          a.headToHead.excluded += 1;
        }
      }
    }
  }

  const rows: ResultsTeamRow[] = [];
  for (const [teamId, a] of acc) {
    rows.push({
      teamId,
      teamName: teamNameOf(model, teamId),
      points: a.points,
      pointsPerRace: completed.length > 0 ? a.points / completed.length : 0,
      medianBestFinish: medianOf(a.bestFinishes),
      bestFinishes: [...a.bestFinishes], // already latest first
      samples: a.bestFinishes.length,
      dnfCount: a.dnfCount,
      starts: a.starts,
      positionsGained: a.positionsGained,
      headToHead: teamId === playerTeamId ? null : { ...a.headToHead },
      rank: 0,
      isPlayer: teamId === playerTeamId,
    });
  }

  /* Ranking: points desc → median best finish asc (null last) → gained desc.
   * Deterministic tiebreak by teamId keeps the order stable across runs. */
  rows.sort((x, y) => {
    if (x.points !== y.points) return y.points - x.points;
    const mx = x.medianBestFinish ?? Number.POSITIVE_INFINITY;
    const my = y.medianBestFinish ?? Number.POSITIVE_INFINITY;
    if (mx !== my) return mx - my;
    if (x.positionsGained !== y.positionsGained) return y.positionsGained - x.positionsGained;
    return x.teamId - y.teamId;
  });
  rows.forEach((row, i) => {
    row.rank = i + 1;
  });

  const playerRow = rows.find((r) => r.isPlayer) ?? null;

  /* confidence — window size semantics: HIGH ≥4, MEDIUM 2–3, LOW <2 */
  let confidence: Confidence = 'LOW';
  if (completed.length >= 4) confidence = 'HIGH';
  else if (completed.length >= 2) confidence = 'MEDIUM';

  const evidence: Evidence[] = [
    {
      source: 'Races_Results',
      label: `Điểm · vị trí về đích · DNF · lượt xuất phát từ ${completed.length} chặng đã xong gần nhất của mùa ${seasonId} (cùng cửa sổ ${RESULTS_WINDOW} chặng với bảng pace)`,
      seasonId,
    },
    {
      source: 'Races_Results.Position + StartingPosition',
      label: 'Median best finish và leo vị trí tính riêng từng chặng, chỉ đếm xe về đích',
      seasonId,
    },
  ];

  const assumptions: Assumption[] = [
    { text: POSITIONS_GAINED_ASSUMPTION },
    { text: MEDIAN_BEST_FINISH_ASSUMPTION },
  ];
  if (completed.length < 4) {
    assumptions.push({
      text: `Chỉ có ${completed.length} chặng dữ liệu — thứ hạng kết quả dễ đổi sau 1 chặng bất thường`,
    });
  }

  /* recommendations — 6-field standard */
  const recommendations: Recommendation[] = [];
  if (playerRow && rows.length > 1) {
    /* reference rival = the team directly above in the results ranking
     * (the one the player is chasing); when leading the board, the nearest
     * chaser below. */
    const reference =
      rows.find((r) => r.rank === playerRow.rank - 1) ??
      rows.find((r) => r.rank === playerRow.rank + 1) ??
      null;
    if (reference && reference.headToHead) {
      const h2h = reference.headToHead;
      const counted = h2h.wins + h2h.losses;
      const ahead = playerRow.points > reference.points;
      const gap = Math.abs(playerRow.points - reference.points);
      const med = (v: number | null): string => (v == null ? '—' : `${v}`);
      recommendations.push({
        id: `results-rival-${seasonId}`,
        title: ahead
          ? `Kết quả thực chiến: P${playerRow.rank}/${rows.length} với ${playerRow.points} điểm, trên ${reference.teamName} ${gap} điểm`
          : `Kết quả thực chiến: P${playerRow.rank}/${rows.length} với ${playerRow.points} điểm, dưới ${reference.teamName} ${gap} điểm`,
        action: ahead
          ? `Giữ phương hướng hiện tại: ${reference.teamName} đang dưới bạn ${gap} điểm trong cửa sổ — chỉ đổi hướng khi cả pace đua và kết quả cùng nói điều ngược lại`
          : `Ưu tiên nước đi mang điểm trước ${reference.teamName} (pit undercut, giữ hàm lượng lốp) — họ đang trên bạn ${gap} điểm trong cửa sổ`,
        why:
          `Đối đầu với ${reference.teamName}: thắng ${h2h.wins}–thua ${h2h.losses}` +
          ` trên ${counted} chặng chạm mặt (loại ${h2h.excluded}),` +
          ` điểm ${playerRow.points} vs ${reference.points},` +
          ` DNF ${playerRow.dnfCount} vs ${reference.dnfCount},` +
          ` median best finish ${med(playerRow.medianBestFinish)} vs ${med(reference.medianBestFinish)},` +
          ` leo vị trí ${playerRow.positionsGained >= 0 ? '+' : ''}${playerRow.positionsGained} vs ${reference.positionsGained >= 0 ? '+' : ''}${reference.positionsGained}.` +
          ` Xếp hạng theo điểm → median best finish → leo vị trí.`,
        confidence,
        evidence,
        assumptions,
        riskIfIgnored: ahead
          ? undefined
          : 'Bỏ qua khoảng cách điểm trong cửa sổ → đứng sau tại standings dù pace có thể nhỉnh hơn trên giấy',
      });
    }
  }
  if (recommendations.length === 0) {
    recommendations.push({
      id: `results-nodata-${seasonId}`,
      title: 'Chưa đủ dữ liệu kết quả đua',
      action: 'Nạp save sau chặng kế tiếp để bảng kết quả thực chiến có dữ liệu so sánh',
      why: 'Không có chặng nào hoàn thành trong mùa hiện tại — bảng kết quả cần ít nhất 1 chặng đã đua.',
      confidence: 'LOW',
      evidence,
      assumptions,
    });
  }

  return {
    data: {
      seasonId,
      racesConsidered: completed.length,
      rows,
      playerTeamId,
    },
    confidence,
    evidence,
    assumptions,
    recommendations,
    warnings,
  };
}
