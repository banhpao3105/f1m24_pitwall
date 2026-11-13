/**
 * Personnel Engine v1 — Phase 2 (docs/03-ANALYTICS-ENGINES.md §5.7).
 *
 * Questions: "Ai nhanh hơn / giữ lốp tốt hơn? Ký ai, giữ ai, hợp đồng nào
 * sắp hết?"
 *
 * Sources:
 *   - Form + duel + tyre preservation: Races_Results / Races_QualifyingResults
 *     / Races_PitStopTimings — verified data (Phase 0/1), HIGH/MEDIUM.
 *   - Contracts / patience / morale: adaptive repos (CANDIDATE columns) —
 *     degraded to LOW when unmapped.
 *
 * Model constants (documented):
 *   CONTRACT_ALERT_DAYS = 60  — "sắp hết hạn" window (model threshold).
 *
 * Pure functions over the SaveModel — no React, no DB, no fetch.
 */

import type { Confidence, Evidence, Assumption, Recommendation } from '../domain/provenance';
import type { EngineResult } from '../domain/types';
import type { SaveModel, StaffContractRow } from '../domain/types';

export const CONTRACT_ALERT_DAYS = 60;
export const FORM_RACES = 5;

export interface FormChip {
  raceId: number;
  /** 'W' = win, 'DNF', otherwise P{pos}. */
  label: string;
  finishingPos: number | null;
  dnf: boolean;
}

export interface DriverCard {
  staffId: number;
  name: string;
  teamId: number | null;
  teamName: string | null;
  points: number | null;
  position: number | null;
  form: FormChip[];
  qualiMedian: number | null;
  raceMedian: number | null;
  /** Median laps per stint across completed races — tyre preservation proxy. */
  avgStintLaps: number | null;
  dnfRate: number | null;
  isPlayer: boolean;
}

export interface ContractCard {
  staffId: number;
  name: string;
  role: 'driver' | 'staff';
  teamId: number | null;
  salary: number | null;
  endDay: number | null;
  daysLeft: number | null;
  expiring: boolean;
  morale: number | null;
}

export interface PersonnelBoard {
  drivers: DriverCard[];
  contracts: ContractCard[];
  patience: {
    staffId: number;
    name: string | null;
    suitability: number | null;
    opinion: number | null;
    threshold: number | null;
  }[];
  hasContractData: boolean;
  hasPatienceData: boolean;
}

export interface DuelSide {
  staffId: number;
  name: string;
  qualiWins: number;
  raceWins: number;
  points: number | null;
  avgStintLaps: number | null;
  dnfCount: number;
  races: number;
}

export interface Duel {
  a: DuelSide;
  b: DuelSide;
  /** Head-to-head counts across races where both were classified. */
  h2h: { qualiA: number; qualiB: number; raceA: number; raceB: number; races: number };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function driverName(model: SaveModel, id: number): string {
  return (
    model.drivers.find((d) => d.staffId === id)?.fullName ??
    model.races.flatMap((r) => r.results).find((res) => res.driverId === id)?.driverName ??
    `Driver ${id}`
  );
}

function teamNameOf(model: SaveModel, id: number | undefined): string | null {
  if (id == null) return null;
  return model.teams.find((t) => t.teamId === id)?.teamName ?? `Team ${id}`;
}

/** Tyre preservation proxy: median laps/stint from pit stop history. */
function avgStintLapsFor(model: SaveModel, driverId: number): number | null {
  const stintsPerRace: number[] = [];
  for (const race of model.races) {
    if (race.state !== 2) continue;
    const res = race.results.find((r) => r.driverId === driverId);
    if (!res || res.dnf) continue;
    const laps = res.laps ?? race.laps;
    if (!laps || laps <= 0) continue;
    const stops = (race.pitStops ?? []).filter((p) => p.driverId === driverId).length;
    stintsPerRace.push(laps / (stops + 1));
  }
  const m = median(stintsPerRace);
  return m != null ? Math.round(m * 10) / 10 : null;
}

function formFor(model: SaveModel, driverId: number): FormChip[] {
  const completed = model.races
    .filter((r) => r.state === 2)
    .sort((a, b) => b.day - a.day)
    .slice(0, FORM_RACES);
  const chips: FormChip[] = [];
  for (const race of completed) {
    const res = race.results.find((r) => r.driverId === driverId);
    if (!res) continue;
    chips.push({
      raceId: race.raceId,
      label: res.dnf ? 'DNF' : res.finishingPos === 1 ? 'W' : `P${res.finishingPos}`,
      finishingPos: res.dnf ? null : res.finishingPos,
      dnf: res.dnf,
    });
  }
  return chips;
}

export function buildPersonnel(model: SaveModel): EngineResult<PersonnelBoard> {
  const playerTeamId = model.player.teamId;
  const completedRaces = model.races.filter((r) => r.state === 2 && r.results.length > 0);

  const cards: DriverCard[] = model.drivers.map((d) => {
    const results = completedRaces.flatMap((r) => r.results.filter((res) => res.driverId === d.staffId));
    const qualiPositions = completedRaces.flatMap((r) =>
      (r.qualifying ?? []).filter((q) => q.driverId === d.staffId).map((q) => q.finishingPos),
    );
    const racePositions = results.filter((r) => !r.dnf).map((r) => r.finishingPos);
    const standing = model.standings.drivers.find((s) => s.id === d.staffId) ?? null;
    const dnfRate = results.length > 0 ? results.filter((r) => r.dnf).length / results.length : null;
    return {
      staffId: d.staffId,
      name: d.fullName,
      teamId: d.teamId ?? null,
      teamName: teamNameOf(model, d.teamId),
      points: standing?.points ?? null,
      position: standing?.position ?? null,
      form: formFor(model, d.staffId),
      qualiMedian: median(qualiPositions),
      raceMedian: median(racePositions),
      avgStintLaps: avgStintLapsFor(model, d.staffId),
      dnfRate: dnfRate != null ? Math.round(dnfRate * 100) / 100 : null,
      isPlayer: d.teamId === playerTeamId,
    };
  });

  /* contracts (adaptive)
   *
   * 0.4.1 bug fix: Staff_Contracts is contract HISTORY — one staff can have
   * several rows (renewals verified in the real 1.11.0 save), which produced
   * duplicate React keys and double rows in the Strategy list. The board
   * exposes ONE row per staff — the contract in force:
   *   1. the latest contract that has already started (StartDay ≤ current
   *      day), tie-break: higher EndSeason;
   *   2. otherwise (all future-dated) the earliest StartDay.
   * The raw rows stay in the model for the Gazette transfer history.
   */
  const pickCurrent = (rows: StaffContractRow[]): StaffContractRow => {
    const started = rows.filter((r) => r.startDay != null && r.startDay <= model.meta.day);
    const pool = started.length > 0 ? started : rows;
    if (started.length > 0) {
      return [...pool].sort(
        (a, b) => (b.startDay ?? -1) - (a.startDay ?? -1) || (b.endSeason ?? -1) - (a.endSeason ?? -1),
      )[0];
    }
    return [...pool].sort((a, b) => (a.startDay ?? Infinity) - (b.startDay ?? Infinity))[0];
  };
  const contractsByStaff = new Map<number, StaffContractRow[]>();
  for (const c of model.personnel.contracts) {
    const list = contractsByStaff.get(c.staffId);
    if (list) list.push(c);
    else contractsByStaff.set(c.staffId, [c]);
  }
  const nameById = new Map(model.drivers.map((d) => [d.staffId, d.fullName]));
  const moraleById = new Map(
    model.personnel.performance.filter((p) => p.morale != null).map((p) => [p.staffId, p.morale as number]),
  );
  const contracts: ContractCard[] = [...contractsByStaff.values()].map((rows) => {
    const c = pickCurrent(rows);
    const daysLeft = c.endDay != null ? c.endDay - model.meta.day : null;
    return {
      staffId: c.staffId,
      name: nameById.get(c.staffId) ?? `Staff ${c.staffId}`,
      role: c.contractType === 0 ? 'driver' : 'staff',
      teamId: c.teamId ?? null,
      salary: c.salary ?? null,
      endDay: c.endDay ?? null,
      daysLeft,
      expiring: daysLeft != null && daysLeft >= 0 && daysLeft <= CONTRACT_ALERT_DAYS,
      morale: moraleById.get(c.staffId) ?? null,
    };
  });

  /* patience intel — F1M24 stores one row per (staff, team). The decision-
   * relevant row is the one about the PLAYER team; when the team column is
   * unavailable (older schema) fall back to the first row per staff so the
   * list stays duplicate-free. */
  const playerPatience = model.personnel.patience.filter(
    (p) => p.teamId != null ? p.teamId === playerTeamId : true,
  );
  const patienceSeen = new Set<number>();
  const patience = playerPatience
    .filter((p) => {
      if (patienceSeen.has(p.staffId)) return false;
      patienceSeen.add(p.staffId);
      return true;
    })
    .map((p) => ({
      staffId: p.staffId,
      name: nameById.get(p.staffId) ?? null,
      suitability: p.suitability ?? null,
      opinion: p.opinion ?? null,
      threshold: p.threshold ?? null,
    }));

  const hasContractData = model.personnel.tablesPresent.contracts && contracts.length > 0;
  const hasPatienceData = model.personnel.tablesPresent.patience && patience.length > 0;

  const confidence: Confidence =
    hasContractData && cards.length > 0
      ? 'MEDIUM'
      : cards.length > 0
        ? 'MEDIUM'
        : 'LOW';

  const evidence: Evidence[] = [
    {
      source: 'Races_Results + Races_PitStopTimings',
      label: `Form ${FORM_RACES} chặng gần nhất + tyre preservation (laps/stint) cho ${cards.length} tay đua`,
    },
  ];
  if (hasContractData) {
    evidence.push({
      source: 'Staff_Contracts',
      label: `${contracts.length} hợp đồng đã map (ContractType=0 là driver)`,
    });
  }

  const assumptions: Assumption[] = [];
  if (!hasContractData) {
    assumptions.push({
      text: 'Staff_Contracts chưa map được cột/bảng — phần hợp đồng trống; introspect save thật để chốt candidate columns',
    });
  }
  assumptions.push({
    text: `Tyre preservation đo bằng laps/stint từ pit history — proxy, chưa tính smoothness của tay đua`,
  });

  /* recommendations (6-field standard) */
  const recommendations: Recommendation[] = [];
  const expiringDriver = contracts.find((c) => c.expiring && c.role === 'driver');
  const expiringStaff = contracts.find((c) => c.expiring && c.role === 'staff');
  const expiringAny = expiringDriver ?? expiringStaff;
  if (expiringAny) {
    recommendations.push({
      id: 'personnel-contract-expiry',
      title: `Hợp đồng ${expiringAny.name} sắp hết hạn`,
      action: `Mở đàm phán gia hạn ${expiringAny.name} (${expiringAny.role === 'driver' ? 'tay đua' : 'nhân sự'}) — còn ${expiringAny.daysLeft} ngày`,
      why: `EndDay ${expiringAny.endDay} − Day hiện tại ${model.meta.day} = ${expiringAny.daysLeft} ngày, dưới ngưỡng cảnh báo ${CONTRACT_ALERT_DAYS}${expiringAny.morale != null ? `; morale ${expiringAny.morale}` : ''}.`,
      confidence: 'MEDIUM',
      evidence,
      assumptions,
      riskIfIgnored: 'Hết hợp đồng → mất người miễn phí; tay đua chủ chốt sẽ kéo theo điểm xếp hạng đội',
    });
  }
  const playerDrivers = cards.filter((c) => c.isPlayer);
  if (playerDrivers.length >= 2) {
    const [a, b] = playerDrivers;
    const tyreEdge = (a.avgStintLaps ?? 0) - (b.avgStintLaps ?? 0);
    if (Math.abs(tyreEdge) >= 1) {
      const better = tyreEdge > 0 ? a : b;
      const worse = tyreEdge > 0 ? b : a;
      recommendations.push({
        id: 'personnel-duel-tyre',
        title: `${better.name} giữ lốp tốt hơn ${worse.name}`,
        action: `Ưu tiên chiến thuật dài stint cho ${better.name}; cho ${worse.name} pit sớm hơn theo plan của Tyre Lab`,
        why: `Median laps/stint: ${better.name} ${better.avgStintLaps} vs ${worse.name} ${worse.avgStintLaps} (chênh ${Math.abs(Math.round(tyreEdge * 10) / 10)} vòng/stint) — JTBD #8.`,
        confidence: 'MEDIUM',
        evidence,
        assumptions,
      });
    }
  }
  if (recommendations.length === 0 && cards.length === 0) {
    recommendations.push({
      id: 'personnel-nodata',
      title: 'Chưa có dữ liệu tay đua',
      action: 'Nạp save career có Staff_BasicData để Personnel bật đầy đủ',
      why: 'Không map được tay đua nào từ save.',
      confidence: 'LOW',
      evidence,
      assumptions,
    });
  }

  return {
    data: {
      drivers: cards,
      contracts,
      patience,
      hasContractData,
      hasPatienceData,
    },
    confidence,
    evidence,
    assumptions,
    recommendations,
    warnings: hasContractData ? [] : ['CONTRACT_DATA_UNAVAILABLE'],
  };
}

export function buildDriverDuel(
  model: SaveModel,
  aStaffId: number,
  bStaffId: number,
): EngineResult<Duel> {
  const completed = model.races
    .filter((r) => r.state === 2 && r.results.length > 0)
    .sort((a, b) => a.day - b.day);

  const side = (staffId: number): DuelSide => {
    let qualiWins = 0;
    let raceWins = 0;
    let dnfCount = 0;
    let races = 0;
    let pointsSum = 0;
    for (const race of completed) {
      const res = race.results.find((r) => r.driverId === staffId);
      if (res) {
        races += 1;
        if (res.dnf) dnfCount += 1;
        else pointsSum += res.points;
      }
      const qp = (race.qualifying ?? []).find((q) => q.driverId === staffId);
      if (qp) qualiWins += qp.finishingPos === 1 ? 1 : 0;
      if (res && !res.dnf && res.finishingPos === 1) raceWins += 1;
    }
    return {
      staffId,
      name: driverName(model, staffId),
      qualiWins,
      raceWins,
      points: races > 0 ? pointsSum : null,
      avgStintLaps: avgStintLapsFor(model, staffId),
      dnfCount,
      races,
    };
  };

  const a = side(aStaffId);
  const b = side(bStaffId);

  let qualiA = 0;
  let qualiB = 0;
  let raceA = 0;
  let raceB = 0;
  let h2hRaces = 0;
  for (const race of completed) {
    const qa = (race.qualifying ?? []).find((q) => q.driverId === aStaffId);
    const qb = (race.qualifying ?? []).find((q) => q.driverId === bStaffId);
    if (qa && qb) {
      h2hRaces += 1;
      if (qa.finishingPos < qb.finishingPos) qualiA += 1;
      else if (qb.finishingPos < qa.finishingPos) qualiB += 1;
    }
    const ra = race.results.find((r) => r.driverId === aStaffId);
    const rb = race.results.find((r) => r.driverId === bStaffId);
    if (ra && rb && !ra.dnf && !rb.dnf) {
      if (ra.finishingPos < rb.finishingPos) raceA += 1;
      else if (rb.finishingPos < ra.finishingPos) raceB += 1;
    }
  }

  const bothPresent = a.races > 0 && b.races > 0;
  const confidence: Confidence = h2hRaces >= 3 ? 'HIGH' : h2hRaces >= 1 ? 'MEDIUM' : 'LOW';

  const evidence: Evidence[] = [
    {
      source: 'Races_Results + Races_QualifyingResults',
      label: `Head-to-head trên ${h2hRaces} chặng có đủ dữ liệu (quali ${qualiA}-${qualiB}, race ${raceA}-${raceB})`,
    },
  ];
  const assumptions: Assumption[] = [];
  if (h2hRaces === 0) {
    assumptions.push({ text: 'Không có chặng nào cả 2 tay đua đều có kết quả — duel chỉ mang tham chiếu' });
  }

  const recommendations: Recommendation[] = [];
  if (bothPresent) {
    const tyreA = a.avgStintLaps ?? 0;
    const tyreB = b.avgStintLaps ?? 0;
    const winner =
      raceA !== raceB ? (raceA > raceB ? a : b) : qualiA !== qualiB ? (qualiA > qualiB ? a : b) : null;
    if (winner) {
      const loser = winner.staffId === a.staffId ? b : a;
      recommendations.push({
        id: 'duel-verdict',
        title: `${winner.name} đang thắng duel với ${loser.name}`,
        action: `Giữ ${winner.name} làm mốc so sánh; xếp thứ tự nâng cấp part/chiến thuật theo ${winner.name} trước`,
        why: `Race H2H ${a.name.split(' ').at(-1)} ${raceA}-${raceB} ${b.name.split(' ').at(-1)}, quali ${qualiA}-${qualiB}, điểm ${a.points ?? 0} vs ${b.points ?? 0}, giữ lốp ${a.avgStintLaps ?? 'n/a'} vs ${b.avgStintLaps ?? 'n/a'} laps/stint.`,
        confidence,
        evidence,
        assumptions,
      });
    }
  } else {
    recommendations.push({
      id: 'duel-nodata',
      title: 'Chưa đủ dữ liệu cho duel này',
      action: 'Nạp save sau vài chặng nữa để head-to-head có mẫu so sánh',
      why: `Cần cả 2 tay đua có kết quả trong cùng các chặng; hiện a=${a.races}, b=${b.races} chặng.`,
      confidence: 'LOW',
      evidence,
      assumptions,
    });
  }

  return {
    data: { a, b, h2h: { qualiA, qualiB, raceA, raceB, races: h2hRaces } },
    confidence,
    evidence,
    assumptions,
    recommendations,
    warnings: [],
  };
}
