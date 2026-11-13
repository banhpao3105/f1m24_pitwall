/**
 * Sim Engine v1 — Phase 2 (docs/03-ANALYTICS-ENGINES.md §5.2 quali/race sim).
 *
 * Question: "Chặng tới tôi dự kiến xuất phát/về đích ở đâu nếu giữ pace hiện tại?"
 *
 * Baseline: concept ported from the old Gazette cars tab (quali sim band +
 * race sim), rebuilt on the Normalized Model because the oracle HTML is no
 * longer available in this environment. v1 model (documented, honest):
 *   - Quali sim  = median quali position over completed races
 *                  (fallback: median race StartingPos → practice best at track).
 *   - Race sim   = rank by median fastest-lap delta vs the session best
 *                  (linear pace model — no overtake difficulty, no SC).
 *   - Expected stops per driver from track pit history (tyre engine helpers).
 *
 * Pure function over the SaveModel — no React, no DB, no fetch.
 */

import type { Confidence, Evidence, Assumption, Recommendation } from '../domain/provenance';
import type { EngineResult } from '../domain/types';
import type { SaveModel } from '../domain/types';
import { getObservedStops, getStintFactor, FALLBACK_PIT_LANE_LOSS, PIT_STATIONARY_ESTIMATE } from './tyre.engine';

export const MIN_SIM_SAMPLE = 2;
/** Quali band cut-offs (model rule, documented): top half→Q3, next quarter→Q2. */
export const Q3_FRACTION = 0.5;
export const Q2_FRACTION = 0.75;

export type QualiSource = 'quali' | 'grid' | 'practice' | 'none';

export interface QualiSimRow {
  driverId: number;
  driverName: string;
  teamId: number;
  teamName: string;
  /** 1-based predicted grid slot. */
  predictedGridPos: number;
  /** Reach band for the predicted slot (model rule). */
  band: 'Q3' | 'Q2' | 'Q1';
  source: QualiSource;
  samples: number;
  isPlayer: boolean;
}

export interface RaceSimRow {
  driverId: number;
  driverName: string;
  teamId: number;
  teamName: string;
  predictedStart: number | null;
  projectedFinish: number;
  /** Median fastest-lap delta vs the session best, seconds (lower = faster). */
  paceDeltaS: number | null;
  expectedStops: number | null;
  samples: number;
  isPlayer: boolean;
}

export interface SimBoard {
  raceId: number;
  trackName: string;
  laps: number;
  quali: QualiSimRow[];
  race: RaceSimRow[];
  pitCostS: number;
  expectedStopsSource: 'track' | 'meta' | 'model' | null;
}

export interface SimOptions {
  /** Override race distance for the race projection (docs/03: slider). */
  lapsOverride?: number;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function round(v: number, digits = 3): number {
  const f = Math.pow(10, digits);
  return Math.round(v * f) / f;
}

export function buildSim(
  model: SaveModel,
  raceId: number,
  options: SimOptions = {},
): EngineResult<SimBoard> {
  // Target race: the requested id, else the next upcoming race, else the
  // last race — sim is always "for the next race" when no explicit target.
  const race =
    model.races.find((r) => r.raceId === raceId) ??
    model.races.find((r) => r.state !== 2) ??
    model.races.at(-1) ?? null;
  if (!race) {
    return {
      data: null as unknown as SimBoard,
      confidence: 'LOW',
      evidence: [],
      assumptions: [],
      recommendations: [],
      warnings: [`RACE_NOT_FOUND:${raceId}`],
    };
  }

  const laps = options.lapsOverride ?? race.laps ?? 50;
  const completedAll = model.races
    .filter((r) => r.state === 2 && r.results.length > 0)
    .sort((a, b) => b.day - a.day);
  const completedSeason = completedAll.filter((r) => r.seasonId === race.seasonId);
  const history = completedSeason.length > 0 ? completedSeason : completedAll;

  const driverName = (id: number): string =>
    model.drivers.find((d) => d.staffId === id)?.fullName ??
    history.flatMap((r) => r.results).find((res) => res.driverId === id)?.driverName ??
    `Driver ${id}`;
  const teamName = (id: number): string =>
    model.teams.find((t) => t.teamId === id)?.teamName ??
    history.flatMap((r) => r.results).find((res) => res.teamId === id)?.teamName ??
    `Team ${id}`;

  /* ── per-driver history aggregation ──────────────────────────────────── */
  interface DriverAgg {
    teamId: number;
    qualiPos: number[];
    gridPos: number[];
    racePos: number[];
    paceDeltas: number[]; // seconds vs session best
    dnfs: number;
    starts: number;
  }
  const aggs = new Map<number, DriverAgg>();
  const aggOf = (id: number, teamId: number): DriverAgg => {
    let a = aggs.get(id);
    if (!a) {
      a = { teamId, qualiPos: [], gridPos: [], racePos: [], paceDeltas: [], dnfs: 0, starts: 0 };
      aggs.set(id, a);
    }
    return a;
  };

  for (const r of history) {
    // session fastest lap
    let sessionBest = Infinity;
    for (const res of r.results) {
      if (!res.dnf && res.fastestLapMs && res.fastestLapMs < sessionBest) {
        sessionBest = res.fastestLapMs;
      }
    }
    const qualiBest = new Map<number, number>();
    for (const q of r.qualifying ?? []) {
      const cur = qualiBest.get(q.driverId);
      if (cur == null || q.finishingPos < cur) qualiBest.set(q.driverId, q.finishingPos);
    }
    for (const res of r.results) {
      const a = aggOf(res.driverId, res.teamId);
      a.starts += 1;
      if (res.dnf) a.dnfs += 1;
      a.racePos.push(res.finishingPos);
      if (res.startingPos != null) a.gridPos.push(res.startingPos);
      const qp = qualiBest.get(res.driverId);
      if (qp != null) a.qualiPos.push(qp);
      if (!res.dnf && res.fastestLapMs && sessionBest < Infinity) {
        a.paceDeltas.push(round((res.fastestLapMs - sessionBest) / 1000));
      }
    }
  }

  /* ── practice fallback at this track (LOW source) ─────────────────────── */
  const practiceBestByDriver = new Map<number, number>();
  for (const r of model.races) {
    if (r.trackId !== race.trackId) continue;
    for (const p of r.practice ?? []) {
      const cur = practiceBestByDriver.get(p.driverId);
      if (cur == null || p.bestLapMs < cur) practiceBestByDriver.set(p.driverId, p.bestLapMs);
    }
  }

  /* ── quali sim ────────────────────────────────────────────────────────── */
  interface DriverQuali {
    driverId: number;
    teamId: number;
    value: number; // median position or practice lap ms ordering value
    source: QualiSource;
    samples: number;
  }
  const qualiCandidates: DriverQuali[] = [];
  for (const [driverId, a] of aggs) {
    const qMed = median(a.qualiPos);
    if (qMed != null) {
      qualiCandidates.push({ driverId, teamId: a.teamId, value: qMed, source: 'quali', samples: a.qualiPos.length });
      continue;
    }
    const gMed = median(a.gridPos);
    if (gMed != null) {
      qualiCandidates.push({ driverId, teamId: a.teamId, value: gMed, source: 'grid', samples: a.gridPos.length });
      continue;
    }
    const prac = practiceBestByDriver.get(driverId);
    if (prac != null) {
      qualiCandidates.push({ driverId, teamId: a.teamId, value: prac, source: 'practice', samples: 1 });
    }
  }
  // mixed sources: quali/grid use position ordering, practice uses lap ms —
  // rank each source block independently and interleave by source priority.
  const fieldSize = Math.max(1, qualiCandidates.length);
  const q3Cut = Math.max(1, Math.round(fieldSize * Q3_FRACTION));
  const q2Cut = Math.max(q3Cut, Math.round(fieldSize * Q2_FRACTION));
  const bandOf = (pos: number): 'Q3' | 'Q2' | 'Q1' =>
    pos <= q3Cut ? 'Q3' : pos <= q2Cut ? 'Q2' : 'Q1';

  const quali: QualiSimRow[] = [];
  {
    const bySource = (s: QualiSource) =>
      qualiCandidates
        .filter((c) => c.source === s)
        .sort((x, y) => x.value - y.value);
    const order: QualiSource[] = ['quali', 'grid', 'practice'];
    const blocks = order.map((s) => bySource(s));
    // Interleave: assign global slots by relative rank within each block.
    const assigned = new Map<number, number>();
    for (const block of blocks) {
      block.forEach((c, i) => {
        // slight decay keeps later-source drivers behind same-rank earlier-source
        const slot = i + 1 + (order.indexOf(c.source) === 0 ? 0 : order.indexOf(c.source) * 0.1);
        assigned.set(c.driverId, slot);
      });
    }
    const ranked = qualiCandidates
      .map((c) => ({ c, slot: assigned.get(c.driverId) ?? 99 }))
      .sort((x, y) => x.slot - y.slot);
    ranked.forEach(({ c }, i) => {
      const a = aggs.get(c.driverId)!;
      quali.push({
        driverId: c.driverId,
        driverName: driverName(c.driverId),
        teamId: c.teamId,
        teamName: teamName(c.teamId),
        predictedGridPos: i + 1,
        band: bandOf(i + 1),
        source: c.source,
        samples: c.samples,
        isPlayer: a.teamId === model.player.teamId,
      });
    });
  }

  /* ── race sim ─────────────────────────────────────────────────────────── */
  const observed = getObservedStops(model, race.trackId);
  const stintFactor = getStintFactor(model, race.trackId);
  let expectedStops: number | null = null;
  let expectedStopsSource: 'track' | 'meta' | 'model' | null = null;
  if (observed && observed.avgStopsPerDriver > 0.4) {
    expectedStops = Math.max(1, Math.round(observed.avgStopsPerDriver));
    expectedStopsSource = 'track';
  } else if (stintFactor.source !== 'model') {
    expectedStops = Math.max(1, Math.round(1 / stintFactor.factor - 1));
    expectedStopsSource = stintFactor.source;
  }
  const pitCostS = FALLBACK_PIT_LANE_LOSS + PIT_STATIONARY_ESTIMATE;

  const gridPosById = new Map(quali.map((q) => [q.driverId, q.predictedGridPos]));
  const raceRows: RaceSimRow[] = [];
  for (const [driverId, a] of aggs) {
    const paceMedian = median(a.paceDeltas);
    raceRows.push({
      driverId,
      driverName: driverName(driverId),
      teamId: a.teamId,
      teamName: teamName(a.teamId),
      predictedStart: gridPosById.get(driverId) ?? null,
      projectedFinish: 0,
      paceDeltaS: paceMedian,
      expectedStops,
      samples: a.paceDeltas.length,
      isPlayer: a.teamId === model.player.teamId,
    });
  }
  raceRows.sort((x, y) => {
    const px = x.paceDeltaS ?? Infinity;
    const py = y.paceDeltaS ?? Infinity;
    if (px !== py) return px - py;
    return (x.predictedStart ?? 99) - (y.predictedStart ?? 99);
  });
  raceRows.forEach((row, i) => {
    row.projectedFinish = i + 1;
  });

  /* ── confidence, evidence, assumptions ────────────────────────────────── */
  const playerQuali = quali.find((q) => q.isPlayer) ?? null;
  const qualiSamplesOk = quali.some((q) => q.source === 'quali' && q.samples >= MIN_SIM_SAMPLE);
  const raceSamplesOk = raceRows.some((r) => r.samples >= MIN_SIM_SAMPLE);
  let confidence: Confidence = 'LOW';
  if (qualiSamplesOk && raceSamplesOk) confidence = 'HIGH';
  else if (qualiSamplesOk || raceSamplesOk) confidence = 'MEDIUM';

  const evidence: Evidence[] = [
    {
      source: 'Races_QualifyingResults / Races_Results',
      label: `Quali sim từ median vị trí quali của ${history.length} chặng hoàn thành (fallback: StartingPos → practice)`,
      raceId: race.raceId,
    },
    {
      source: 'Races_Results.FastestLap',
      label: `Race sim xếp theo median fastest-lap delta vs best của chặng (${history.length} chặng)`,
      raceId: race.raceId,
    },
  ];
  if (observed) {
    evidence.push({
      source: 'Races_PitStopTimings',
      label: `Expected stops ~${expectedStops} từ pit history tại ${race.trackName}`,
      raceId: race.raceId,
    });
  }

  const assumptions: Assumption[] = [
    { text: 'Mô hình tuyến tính: không mô hình hoá độ khó vượt xe, giao thông, Safety Car' },
    { text: 'Pace đo bằng fastest-lap — không phản ánh quản lý lốp/nhiên liệu trong stint' },
  ];
  if (!qualiSamplesOk) {
    assumptions.push({ text: 'Thiếu quali history ≥2 chặng — thứ tự xuất phát dự đoán có thể lệch' });
  }

  /* ── recommendations (6-field standard) ───────────────────────────────── */
  const recommendations: Recommendation[] = [];
  const playerRace = raceRows.find((r) => r.isPlayer) ?? null;
  const rivalTeamIds = new Set(
    model.standings.teams
      .filter((t) => t.id !== model.player.teamId)
      .slice(0, 11)
      .map((t) => t.id),
  );
  // Direct rival: nearest projected finish around the player's best driver.
  const playerRaceRows = raceRows.filter((r) => r.isPlayer);
  const playerBest = playerRaceRows.sort((a, b) => a.projectedFinish - b.projectedFinish)[0] ?? null;
  const nearestRival =
    playerBest != null
      ? raceRows
          .filter((r) => !r.isPlayer && rivalTeamIds.has(r.teamId))
          .sort(
            (a, b) =>
              Math.abs(a.projectedFinish - playerBest.projectedFinish) -
              Math.abs(b.projectedFinish - playerBest.projectedFinish),
          )[0] ?? null
      : null;

  if (playerBest && nearestRival && playerQuali) {
    const faster = playerBest.projectedFinish < nearestRival.projectedFinish;
    recommendations.push({
      id: `sim-race-${race.raceId}`,
      title: `Race sim: ${playerBest.driverName} dự kiến P${playerBest.projectedFinish} tại ${race.trackName}`,
      action: faster
        ? `Bảo vệ kết quả trước ${nearestRival.driverName} (P${nearestRival.projectedFinish}): theo dõi pit window của họ để phản ứng undercut`
        : `Nhắm vượt ${nearestRival.driverName} (dự kiến P${nearestRival.projectedFinish}, bạn P${playerBest.projectedFinish}): nhấn mạnh cửa sổ pit — xem Tyre Lab để chốt vòng pit`,
      why: `Pace median ${playerBest.paceDeltaS != null ? `+${playerBest.paceDeltaS.toFixed(3)}s` : 'n/a'} vs fastest-lap session, ${playerBest.samples} chặng mẫu; expected stops ~${expectedStops ?? '?'} (nguồn: ${expectedStopsSource ?? 'n/a'}). Xuất phát dự kiến P${playerBest.predictedStart ?? '?'}.`,
      confidence,
      evidence,
      assumptions,
      riskIfIgnored: faster
        ? 'Mất vị trí vào đối thủ trực tiếp nếu họ undercut ở pit window'
        : undefined,
      expectedGain: faster ? undefined : 'Vị trí dự kiến nếu pit đúng cửa sổ (ước lượng mô hình)',
    });
  } else {
    recommendations.push({
      id: `sim-nodata-${race.raceId}`,
      title: 'Chưa đủ dữ liệu cho race sim',
      action: 'Nạp save sau khi hoàn thành thêm chặng để sim có median pace đáng tin',
      why: `Cần ≥${MIN_SIM_SAMPLE} chặng có fastest-lap cho mỗi tay đua; hiện không đủ cho đội bạn.`,
      confidence: 'LOW',
      evidence,
      assumptions,
    });
  }

  const warnings: string[] = [];
  if (race.state === 2) warnings.push('RACE_ALREADY_COMPLETED');

  return {
    data: {
      raceId: race.raceId,
      trackName: race.trackName,
      laps,
      quali,
      race: raceRows,
      pitCostS,
      expectedStopsSource,
    },
    confidence,
    evidence,
    assumptions,
    recommendations,
    warnings,
  };
}
