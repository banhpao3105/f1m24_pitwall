/**
 * Car Strength Engine — v0.8.0 (prompt §Bước 1).
 *
 * Question: "Xe mình mạnh/yếu ở từng bộ phận khí động học như thế nào so với
 * cả grid?" — per aero part × per aero stat: the player's value, the best
 * team AT THAT STAT, the grid mean, both percentages, and the head-to-head
 * rival value.
 *
 * Data reality (verified on a real F1M24 save, Parts_Enum_Type/Stats):
 *   - Aero parts = PartType 3 Body, 4 FrontWing, 5 RearWing, 6 SidePods,
 *     7 Floor. Engine/ERS/Gearbox (supplier) + Suspension are OUT of scope
 *     in v0.8.0 (prompt §Out of scope).
 *   - Aero stats = AirFlowFront, AirFlowTolerance, DRSDelta, DragReduction,
 *     Low/Med/HighSpeedDownforce, AirFlowMiddle. EngineCooling,
 *     TyrePreservation, Durability, Power, FuelEfficiency, OperationalRange
 *     are NOT aero and stay out.
 *   - Values come from Parts_Designs_StatValues.Value (~0–1000 scale);
 *     same stat + same part are comparable across teams, NOTHING else is.
 *
 * Current-part resolution per team (locked by the prompt):
 *   1. LoadoutID = 1 row with a DesignID  → source 'installed'.
 *   2. DesignID NULL (AI teams only)      → the team's LATEST COMPLETED
 *      design of that part type (DayCompleted > 0, max DayCompleted, ties →
 *      higher DesignID) → source 'latest' — always labelled in the UI.
 *   3. Neither                            → source 'unknown' — the team
 *      contributes nothing; no zero-fill, no estimates.
 *
 * HARD RULES (v0.8.0 §Ràng buộc cứng):
 *   - NO aggregate score, NO weighting, NO overall ranking — one row per
 *     stat; "best" is per stat, not one team.
 *   - NO conversion of aero % into lap time — the save carries no such
 *     formula; every % here is a % OF THE STAT VALUE.
 *   - Percentages: pctBest = value/best·100, pctMean = value/mean·100,
 *     rounded to 1 decimal. mean = arithmetic mean of the teams that HAVE
 *     the stat (documented per row via meanTeams).
 *
 * Pure function over the SaveModel — no React, no DB, no fetch.
 */

import type { Confidence, Evidence, Assumption } from '../domain/provenance';
import type { EngineResult } from '../domain/types';
import type { SaveModel, PartDesign } from '../domain/types';

/** Where a team's current part design came from (source-labelled in the UI). */
export type PartSource = 'installed' | 'latest' | 'unknown';

/** The default head-to-head rival: Williams (6) — directly ahead of the
 *  player's CustomTeam in the standings on the verified save. */
export const DEFAULT_RIVAL_TEAM_ID = 6;

/** Aero part types in the save's own enum order (Parts_Enum_Type 3–7). */
export const AERO_PART_ORDER = ['Body', 'FrontWing', 'RearWing', 'SidePods', 'Floor'] as const;

/** Aero stats in the save's own enum order (Parts_Enum_Stats 0,1,3,4,7,8,9,13). */
export const AERO_STAT_ORDER = [
  'AirFlowFront',
  'AirFlowTolerance',
  'DRSDelta',
  'DragReduction',
  'LowSpeedDownforce',
  'MedSpeedDownforce',
  'HighSpeedDownforce',
  'AirFlowMiddle',
] as const;

/** lowercase [a-z0-9] form — makes label matching schema-tolerant. */
function norm(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const AERO_PART_KEYS = new Set(AERO_PART_ORDER.map(norm));
const AERO_STAT_KEYS = new Set(AERO_STAT_ORDER.map(norm));
/** canonical order index for a stat label (fallback: after every known one). */
const STAT_RANK = new Map(AERO_STAT_ORDER.map((s, i) => [norm(s), i]));

export interface CarStrengthRow {
  /** Part label as the save's enum names it (Body, FrontWing, …). */
  part: string;
  /** Stat label as the save's enum names it (AirFlowFront, …). */
  stat: string;
  playerValue: number | null;
  playerDesignId: number | null;
  playerSource: PartSource;
  bestTeamId: number | null;
  bestTeamName: string | null;
  bestValue: number | null;
  bestSource: PartSource;
  /** Arithmetic mean over the teams that HAVE this stat (see meanTeams). */
  meanValue: number | null;
  meanTeams: number;
  /** value/best·100 and value/mean·100, rounded to 1 decimal. Player-based. */
  pctBest: number | null;
  pctMean: number | null;
  rivalTeamId: number;
  rivalTeamName: string;
  rivalValue: number | null;
  rivalSource: PartSource;
}

export interface CarStrengthBoard {
  rows: CarStrengthRow[];
  playerTeamId: number;
  /** The rival this board was computed for (default Williams). */
  rivalTeamId: number;
  /** The 10 rival candidates (F1 teams minus the player) for the dropdown. */
  rivalOptions: { teamId: number; teamName: string }[];
  /** F1 teams actually seen in the part data — honesty signal (expect 11). */
  f1TeamCount: number;
  /** How many team-parts resolved via the 'latest' fallback (UI labels these). */
  fallbackCount: number;
}

export interface CarStrengthOptions {
  /** Head-to-head rival (default Williams, 6). Must be an F1 team ≠ player. */
  rivalTeamId?: number;
}

const round1 = (x: number): number => Math.round(x * 10) / 10;

interface ResolvedPart {
  designId: number | null;
  source: PartSource;
}

/**
 * Current part design of one team at one part type — the locked rule:
 * L1 installed DesignID first, else the team's latest COMPLETED design,
 * else unknown. LoadoutID 1 only (the player's L1 = L2 on verified saves;
 * AI rows are read the same way — one seat, labelled).
 */
export function resolveTeamPart(
  model: SaveModel,
  teamId: number,
  partKey: string,
): ResolvedPart {
  const installed = model.parts.loadouts.find(
    (l) =>
      l.teamId === teamId &&
      l.loadoutId === 1 &&
      l.partType != null &&
      norm(l.partType) === partKey &&
      l.designId != null,
  );
  if (installed?.designId != null) return { designId: installed.designId, source: 'installed' };

  let best: PartDesign | null = null;
  for (const d of model.parts.designs) {
    if (d.teamId !== teamId || d.partType == null || norm(d.partType) !== partKey) continue;
    if (d.dayCompleted == null || d.dayCompleted <= 0) continue; // completed only
    if (
      best == null ||
      d.dayCompleted > best.dayCompleted! ||
      (d.dayCompleted === best.dayCompleted && d.designId > best.designId)
    ) {
      best = d;
    }
  }
  if (best) return { designId: best.designId, source: 'latest' };
  return { designId: null, source: 'unknown' };
}

/** buildCarStrength — the aero strength board (see module header for rules). */
export function buildCarStrength(
  model: SaveModel,
  options: CarStrengthOptions = {},
): EngineResult<CarStrengthBoard> {
  const playerTeamId = model.player.teamId;

  /* F1 teams only — Prema & friends (F2/F3) never enter the grid math. */
  const f1Teams = model.teams.filter((t) => t.formula === 1);
  const teamNameOf = new Map(f1Teams.map((t) => [t.teamId, t.teamName]));
  const teamIds = f1Teams.map((t) => t.teamId);
  if (!teamNameOf.has(playerTeamId)) teamIds.unshift(playerTeamId); // defensive
  const seenTeams = new Set<number>();

  /* Rival: default Williams; fall back to the first other F1 team if the
   * requested id is not a valid rival (never the player itself). */
  const requestedRival = options.rivalTeamId ?? DEFAULT_RIVAL_TEAM_ID;
  const rivalCandidates = teamIds.filter((id) => id !== playerTeamId);
  const rivalTeamId = rivalCandidates.includes(requestedRival)
    ? requestedRival
    : (rivalCandidates.find((id) => id === DEFAULT_RIVAL_TEAM_ID) ?? rivalCandidates[0]);
  const rivalTeamName = rivalTeamId != null ? (teamNameOf.get(rivalTeamId) ?? `Team ${rivalTeamId}`) : '—';

  /* designs indexed once; stat lookup per design */
  const statsOf = (designId: number | null): Map<string, number> => {
    const out = new Map<string, number>();
    if (designId == null) return out;
    const d = model.parts.designs.find((x) => x.designId === designId);
    for (const s of d?.stats ?? []) out.set(norm(s.name), s.value);
    return out;
  };

  /* resolve every team's part design per aero part once (fallback counted
   * once per team-part — not once per stat row) */
  const resolved = new Map<string, Map<number, ResolvedPart & { stats: Map<string, number> }>>();
  let fallbackCount = 0;
  for (const partKey of AERO_PART_KEYS) {
    const perTeam = new Map<number, ResolvedPart & { stats: Map<string, number> }>();
    for (const teamId of teamIds) {
      const r = resolveTeamPart(model, teamId, partKey);
      if (r.source === 'latest') fallbackCount += 1;
      perTeam.set(teamId, { ...r, stats: statsOf(r.designId) });
    }
    resolved.set(partKey, perTeam);
  }

  /* canonical display labels: prefer the save's own spelling of the part */
  const partLabelOf = (partKey: string): string => {
    for (const l of model.parts.loadouts) {
      if (l.partType && norm(l.partType) === partKey) return l.partType;
    }
    for (const d of model.parts.designs) {
      if (d.partType && norm(d.partType) === partKey) return d.partType;
    }
    return AERO_PART_ORDER.find((p) => norm(p) === partKey) ?? partKey;
  };

  const rows: CarStrengthRow[] = [];

  for (const partKey of AERO_PART_KEYS) {
    const perTeam = resolved.get(partKey)!;
    const part = partLabelOf(partKey);
    for (const statKey of AERO_STAT_KEYS) {
      type Entry = { teamId: number; value: number; source: PartSource };
      const entries: Entry[] = [];
      for (const teamId of teamIds) {
        const r = perTeam.get(teamId);
        if (!r) continue;
        seenTeams.add(teamId);
        const v = r.stats.get(statKey);
        if (v == null) continue; // this design does not carry the stat
        entries.push({ teamId, value: v, source: r.source });
      }
      if (entries.length === 0) continue; // stat does not exist for this part

      /* best = per stat; ties → lower TeamID (deterministic, documented) */
      const best = entries.reduce((a, b) => (b.value > a.value ? b : b.value === a.value && b.teamId < a.teamId ? b : a));
      const mean = entries.reduce((s, e) => s + e.value, 0) / entries.length;

      const player = entries.find((e) => e.teamId === playerTeamId);
      const playerResolved = perTeam.get(playerTeamId);
      const rival = entries.find((e) => e.teamId === rivalTeamId);
      const rivalResolved = rivalTeamId != null ? perTeam.get(rivalTeamId) : undefined;

      rows.push({
        part,
        stat: AERO_STAT_ORDER.find((s) => norm(s) === statKey) ?? statKey,
        playerValue: player?.value ?? null,
        playerDesignId: playerResolved?.designId ?? null,
        playerSource: playerResolved?.source ?? 'unknown',
        bestTeamId: best.teamId,
        bestTeamName: teamNameOf.get(best.teamId) ?? `Team ${best.teamId}`,
        bestValue: best.value,
        bestSource: best.source,
        meanValue: mean,
        meanTeams: entries.length,
        pctBest: player ? round1((player.value / best.value) * 100) : null,
        pctMean: player ? round1((player.value / mean) * 100) : null,
        rivalTeamId: rivalTeamId ?? 0,
        rivalTeamName,
        rivalValue: rival?.value ?? null,
        rivalSource: rivalResolved?.source ?? 'unknown',
      });
    }
  }

  /* stability: canonical part order, then the save's enum stat order */
  const partRank = (p: string) => {
    const i = AERO_PART_ORDER.findIndex((x) => norm(x) === norm(p));
    return i === -1 ? AERO_PART_ORDER.length : i;
  };
  const statRank = (s: string) => STAT_RANK.get(norm(s)) ?? AERO_STAT_ORDER.length;
  rows.sort((a, b) => partRank(a.part) - partRank(b.part) || statRank(a.stat) - statRank(b.stat));

  const tablesOk = model.parts.tablesPresent.statValues && model.parts.tablesPresent.loadouts;
  const confidence: Confidence =
    rows.length === 0 ? 'LOW' : tablesOk ? 'HIGH' : 'MEDIUM';

  const unknownRows = rows.filter((r) => r.playerSource === 'unknown').length;
  const fallbackNotes =
    fallbackCount > 0
      ? `${fallbackCount} linh kiện đội dùng thiết kế mới nhất đã hoàn thành (DesignID trống ở loadout — có nhãn nguồn 'latest')`
      : 'mọi đội đều có linh kiện đang gắn ở LoadoutID=1';

  const evidence: Evidence[] = [
    {
      source: 'Parts_Designs_StatValues.Value',
      label: `${rows.length} chỉ số aero (5 bộ phận × các chỉ số có thật) trên ${seenTeams.size} đội F1 — thang ~0–1000, cùng bộ phận + cùng chỉ số mới so sánh được`,
    },
    {
      source: 'Parts_CarLoadout (LoadoutID=1)',
      label: `Linh kiện hiện tại theo quy tắc khóa: L1 đang gắn → ${fallbackNotes}${unknownRows > 0 ? `; ${unknownRows} hàng của đội bạn không rõ nguồn (không điền số)` : ''}`,
    },
    {
      source: 'Parts_Enum_Type / Parts_Enum_Stats',
      label: 'Bộ phận aero 3–7 (Body…Floor) và 8 chỉ số aero đọc từ enum của chính save; giá trị lấy cột Value',
    },
  ];

  const assumptions: Assumption[] = [
    {
      text: "Mạnh nhất là mạnh nhất TỪNG CHỈ SỐ (đội khác nhau ở từng hàng) — không có một 'đội nhanh nhất' duy nhất, không điểm tổng hợp, không trọng số",
    },
    {
      text: '% là % GIÁ TRỊ CHỈ SỐ (so với mạnh nhất / trung bình grid, làm tròn 1 chữ số thập phân) — save không chứa công thức đổi chỉ số aero ra thời gian vòng',
    },
    {
      text: `Trung bình grid tính trên các đội CÓ chỉ số đó (meanTeams từng hàng); bằng giá trị → đội có TeamID nhỏ hơn đứng tên 'mạnh nhất'`,
    },
  ];

  const warnings: string[] = [];
  if (rows.length === 0) warnings.push('AERO_STATS_UNAVAILABLE');
  if (seenTeams.size < 11 && rows.length > 0) warnings.push('F1_TEAM_SET_INCOMPLETE');

  return {
    data: {
      rows,
      playerTeamId,
      rivalTeamId: rivalTeamId ?? 0,
      rivalOptions: rivalCandidates.map((id) => ({ teamId: id, teamName: teamNameOf.get(id) ?? `Team ${id}` })),
      f1TeamCount: seenTeams.size,
      fallbackCount,
    },
    confidence,
    evidence,
    assumptions,
    recommendations: [], // v0.8.0 scope: presentation only — no advice engine yet
    warnings,
  };
}

/** Latest-completed-day helper kept export-free — internal tie-break is
 *  documented in resolveTeamPart. (No other engine touches parts today.) */
export type { ResolvedPart };
