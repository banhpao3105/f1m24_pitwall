/**
 * Grid Engine (v0.7.0) — derives the pre-race grid from qualifying plus
 * Races_GridPenalties, assesses weekend data readiness, and correlates
 * allocation CarIDs with drivers via the practice-usage signal.
 *
 * Every rule here is anchored to verified data (owner's Monza 2027 saves +
 * two local 1.11 saves probed during development):
 *
 * GRID (verified exact): with each driver's highest QualifyingStage row,
 * order by (stage desc, FinishingPos asc). Reproduced StartingPos for all
 * 22 F1 drivers of a completed real race with ZERO mismatches. RaceFormula
 * filters F1 (1) from F2 (2) / F3 (3).
 *
 * PENALTIES: Races_QualifyingResults.GridPenalty is 0 on every verified
 * save — real penalties live in Races_GridPenalties. Pending rows
 * (Served = 0, ServeInRace = 1) apply to the UPCOMING race (verified:
 * the same rows flip Served 0 → 1 across the race weekend in real saves).
 * Places come from the game's own enum table Races_Enum_PenaltyType
 * (3 = CausingCollision → 3 places, verified against the enum rows).
 * BACK OF GRID: the "exceeded season limit" reasons (0 engine / 1 ERS /
 * 2 gearbox) and ParcFermeBreach (5, 0 places) plus PitLaneStart = 1 all
 * drop the car to the END of the grid — the owner-verified Monza case
 * (driver quali P7 → P22, everyone behind moves up one) is exactly this
 * shape. CarID in the penalty table is the car index WITHIN the team (1–2);
 * it resolves through the CarID→team map (carTeams, Save_CarConfig-verified)
 * and then the car→driver correlation below.
 *
 * CAR → DRIVER: Save_CarTyreAllocation.LapsCompleted grouped by
 * SessionLastUsedIn vs Races_PracticeResults.LapCount per driver per
 * session. An exact per-session lap match for BOTH cars of a team picks
 * the assignment; ambiguity or a dead signal (LapsCompleted all 0 on some
 * real saves) leaves the seat UNVERIFIED — the UI then shows "Xe 1 / Xe 2"
 * and the seat falls back to StaffID order, flagged as an assumption
 * (spec: never build per-car views on an unverified guess).
 *
 * Pure functions only — SaveModel in, plain data out (docs/02 layering).
 */

import type { SaveModel, Race, Driver } from '../domain/types';

/* ── grid derivation ─────────────────────────────────────────────────────── */

export interface GridEntry {
  driverId: number;
  driverName: string;
  teamId: number;
  /** Final grid slot (1-based, penalties applied). */
  gridPos: number;
  /** Position from the qualifying classification (penalties NOT applied). */
  qualiPos: number;
  /** Places lost to a place-count penalty (0 when none / back of grid). */
  penaltyPlaces: number;
  /** True when the car drops to the back of the grid. */
  backOfGrid: boolean;
}

export interface UnresolvedPenalty {
  /** Races_GridPenalties TeamID as stored (the sequential F1 index). */
  teamId: number;
  /** Car index within the team (1–2) as stored. */
  carInTeam: number;
  /** ReasonForPenalty (the game's Races_Enum_PenaltyType value). */
  reason: number;
  pitLaneStart: number;
}

export interface DerivedGrid {
  grid: GridEntry[];
  appliedPenalties: number;
  /** False when a penalized car's seat had to fall back to StaffID order. */
  seatMappingVerified: boolean;
  /** Pending penalties that could not be applied to the grid. */
  unresolvedPenalties: number;
  /**
   * v0.7.1 — WHY each pending penalty was not applied: the save carries it
   * but no VERIFIED seat could eat it (dead practice-lap signal → the
   * StaffID-order guess may never move a driver on the grid). The UI lists
   * these instead of silently hiding them.
   */
  unresolvedList: UnresolvedPenalty[];
}

const EXCEED_LIMIT_REASONS = new Set([0, 1, 2]); // engine / ERS / gearbox
const PARC_FERME_REASON = 5;

/** Pending race penalties: Served = 0 (verified application tracker). */
function pendingRacePenalties(model: SaveModel): {
  teamId: number;
  carInTeam: number;
  reason: number;
  pitLaneStart: number;
}[] {
  const rows = model.gridPenalties?.rows ?? [];
  return rows
    .filter((r) => r.served === 0 && (r.serveInRace ?? 1) === 1)
    .map((r) => ({
      teamId: r.teamId,
      carInTeam: r.carInTeam,
      reason: r.reasonForPenalty,
      pitLaneStart: r.pitLaneStart ?? 0,
    }));
}

/** Back of the grid: exceeded season allocation, parc-ferme (pit lane), or
 * an explicit PitLaneStart flag. Place-count penalties use the enum. */
function isBackOfGrid(reason: number, pitLaneStart: number, places: number): boolean {
  if (pitLaneStart === 1) return true;
  if (EXCEED_LIMIT_REASONS.has(reason)) return true;
  if (reason === PARC_FERME_REASON) return true;
  return places <= 0;
}

export function deriveGrid(model: SaveModel, raceId: number): DerivedGrid | null {
  const race = model.races.find((r) => r.raceId === raceId);
  if (!race) return null;
  return deriveGridForRace(model, race);
}

function deriveGridForRace(model: SaveModel, race: Race): DerivedGrid | null {
  const qualiRows = race.qualifying ?? [];
  if (qualiRows.length === 0) return null;
  /* RaceFormula exists on 1.11+ saves — filter F1 when the column is
   * populated at all; legacy models without it keep every row. */
  const hasFormula = qualiRows.some((q) => q.raceFormula != null);
  const f1Rows = hasFormula ? qualiRows.filter((q) => q.raceFormula === 1) : qualiRows;
  if (f1Rows.length === 0) return null;

  /* the model already keeps the highest stage per driver — re-apply max for
     robustness against hand-built fixtures */
  const bestStage = new Map<number, (typeof f1Rows)[number]>();
  for (const q of f1Rows) {
    const cur = bestStage.get(q.driverId);
    if (!cur || (q.stage ?? 0) > (cur.stage ?? 0)) bestStage.set(q.driverId, q);
  }
  const ordered = [...bestStage.values()].sort(
    (a, b) => (b.stage ?? 0) - (a.stage ?? 0) || a.finishingPos - b.finishingPos,
  );
  const qualiPosByDriver = new Map(ordered.map((q, i) => [q.driverId, i + 1]));

  /* ── penalties ── */
  const carDrivers = resolveCarDrivers(model, race.raceId);
  const pending = pendingRacePenalties(model);
  let applied = 0;
  const unresolved: UnresolvedPenalty[] = [];
  let seatMappingVerified = true;
  const backOfGrid = new Set<number>();
  const placePenalty = new Map<number, number>();
  for (const p of pending) {
    const carId = carIdForPenalty(model, p.teamId, p.carInTeam);
    const mapped = carId != null ? carDrivers.byCar.get(carId) ?? null : null;
    const driverId = mapped?.driverId ?? null;
    if (driverId == null || !qualiPosByDriver.has(driverId)) {
      unresolved.push(p);
      continue;
    }
    /* v0.7.1: the seat that eats the penalty must be a VERIFIED mapping —
       applying a penalty to a StaffID-order guess (a dead practice-lap
       signal) can move the WRONG driver 19 places, which is worse than
       not applying it. Unverified seat → the penalty stays unresolved and
       the grid keeps the qualifying order; the UI lists it. */
    if (!mapped!.verified) {
      seatMappingVerified = false;
      unresolved.push(p);
      continue;
    }
    const places = model.gridPenalties?.reasonPlaces?.[p.reason] ?? 0;
    if (isBackOfGrid(p.reason, p.pitLaneStart, places)) {
      backOfGrid.add(driverId);
    } else {
      placePenalty.set(driverId, Math.max(placePenalty.get(driverId) ?? 0, places));
    }
    applied++;
  }

  /* apply: place penalties push each driver back N slots (processed in
     quali order, on the live array — later moves see earlier ones), then
     back-of-grid drivers go to the end preserving their quali order. */
  let list = ordered.map((q) => q.driverId);
  for (const [driverId, places] of [...placePenalty.entries()].sort(
    (a, b) => (qualiPosByDriver.get(a[0]) ?? 0) - (qualiPosByDriver.get(b[0]) ?? 0),
  )) {
    const from = list.indexOf(driverId);
    if (from < 0) continue;
    const to = Math.min(list.length - 1, from + places);
    list.splice(from, 1);
    list.splice(to, 0, driverId);
  }
  const kept = list.filter((d) => !backOfGrid.has(d));
  const dropped = ordered.map((q) => q.driverId).filter((d) => backOfGrid.has(d));
  list = [...kept, ...dropped];

  const nameOf = (id: number): string => {
    const q = bestStage.get(id);
    if (q && 'driverName' in q && q.driverName) return q.driverName;
    return model.drivers.find((d) => d.staffId === id)?.fullName ?? `Driver ${id}`;
  };
  const grid: GridEntry[] = list.map((driverId, i) => {
    const q = bestStage.get(driverId);
    return {
      driverId,
      driverName: nameOf(driverId),
      teamId: q?.teamId ?? 0,
      gridPos: i + 1,
      qualiPos: qualiPosByDriver.get(driverId) ?? i + 1,
      penaltyPlaces: placePenalty.get(driverId) ?? 0,
      backOfGrid: backOfGrid.has(driverId),
    };
  });
  return {
    grid,
    appliedPenalties: applied,
    seatMappingVerified,
    unresolvedPenalties: unresolved.length,
    unresolvedList: unresolved,
  };
}

/** Penalty (TeamID, CarID 1|2) → allocation CarID (0–21) via the verified
 * F1-team order (Teams formula=1, TeamID asc — car pairs (0,1), (2,3)…). */
function carIdForPenalty(model: SaveModel, teamId: number, carInTeam: number): number | null {
  const map = model.gridPenalties?.carTeams ?? [];
  if (map.length === 0) return null;
  const teamCars = map.filter((c) => c.teamId === teamId).map((c) => c.carId).sort((a, b) => a - b);
  const idx = carInTeam === 1 ? 0 : carInTeam === 2 ? 1 : -1;
  if (idx < 0 || teamCars.length <= idx) return null;
  return teamCars[idx];
}

/* ── CarID → driver correlation (practice-usage signal) ─────────────────── */

export interface CarDriverMap {
  byCar: Map<number, { driverId: number; verified: boolean }>;
  /** True when at least one seat is practice-verified. */
  verified: boolean;
  /** CarIDs whose seat fell back to StaffID order. */
  fallbackCars: number[];
}

/**
 * Correlates each allocation CarID with its driver. Primary signal: per-
 * session LapsCompleted (allocation) vs LapCount (practice results) — an
 * exact match for both cars of a team picks the assignment. Fallback when
 * the signal is dead: StaffID order within the team (car 1 = lower StaffID),
 * explicitly flagged UNVERIFIED so the UI can label it.
 */
export function resolveCarDrivers(model: SaveModel, raceId?: number): CarDriverMap {
  const byCar = new Map<number, { driverId: number; verified: boolean }>();
  const fallbackCars: number[] = [];
  const carTeams = model.gridPenalties?.carTeams ?? [];
  if (carTeams.length === 0) return { byCar, verified: false, fallbackCars };

  const teamIds = [...new Set(carTeams.map((c) => c.teamId))];
  /* current-weekend practice rows (the allocation's SessionLastUsedIn refers
     to the race being planned — fall back to the newest race with laps) */
  const practiceRace = pickPracticeRace(model, raceId);
  const driverLaps = new Map<string, number>(); // `${driverId}:${session}` → laps
  if (practiceRace) {
    for (const p of practiceRace.practice ?? []) {
      if (p.lapCount == null) continue;
      driverLaps.set(`${p.driverId}:${p.session}`, (driverLaps.get(`${p.driverId}:${p.session}`) ?? 0) + p.lapCount);
    }
  }
  const carLaps = new Map<string, number>(); // `${carId}:${session}` → laps
  for (const t of model.tyres) {
    if (t.lapsCompleted == null || t.lapsCompleted <= 0) continue;
    const key = `${t.carId}:${t.sessionLastUsedIn ?? -1}`;
    carLaps.set(key, (carLaps.get(key) ?? 0) + t.lapsCompleted);
  }

  for (const teamId of teamIds) {
    const cars = carTeams.filter((c) => c.teamId === teamId).map((c) => c.carId).sort((a, b) => a - b);
    const drivers: Driver[] = model.drivers
      .filter((d) => d.teamId === teamId)
      .sort((a, b) => a.staffId - b.staffId);
    if (cars.length !== 2 || drivers.length !== 2) continue;
    const [c1, c2] = cars;
    const [d1, d2] = drivers;

    const score = (a: number, b: number): number => {
      let matches = 0;
      for (const [key, laps] of carLaps) {
        const session = key.split(':')[1];
        if (key === `${a}:${session}` && driverLaps.get(`${b}:${session}`) === laps) matches++;
      }
      return matches;
    };
    const straight = score(c1, d1.staffId) + score(c2, d2.staffId);
    const crossed = score(c1, d2.staffId) + score(c2, d1.staffId);
    if (straight > 0 && straight > crossed) {
      byCar.set(c1, { driverId: d1.staffId, verified: true });
      byCar.set(c2, { driverId: d2.staffId, verified: true });
    } else if (crossed > 0 && crossed > straight) {
      byCar.set(c1, { driverId: d2.staffId, verified: true });
      byCar.set(c2, { driverId: d1.staffId, verified: true });
    } else {
      /* dead signal — StaffID order fallback, flagged unverified */
      byCar.set(c1, { driverId: d1.staffId, verified: false });
      byCar.set(c2, { driverId: d2.staffId, verified: false });
      fallbackCars.push(c1, c2);
    }
  }
  return {
    byCar,
    verified: byCar.size > 0 && fallbackCars.length === 0,
    fallbackCars,
  };
}

function pickPracticeRace(model: SaveModel, raceId?: number): Race | null {
  if (raceId != null) {
    const r = model.races.find((x) => x.raceId === raceId);
    if (r && (r.practice ?? []).length > 0) return r;
  }
  const withPractice = model.races
    .filter((r) => (r.practice ?? []).some((p) => p.lapCount != null))
    .sort((a, b) => b.day - a.day);
  return withPractice[0] ?? null;
}

/* ── tyre inventory (v0.7.0 step 3) ──────────────────────────────────────── */

export type InventoryCompound = 'S' | 'M' | 'H' | 'I' | 'W';

export interface InventorySet {
  tyreSetId: number;
  compound: InventoryCompound;
  /** MIN of the four wheel-wear columns (0 fresh … 1 worn). */
  wear: number;
  /** EstimatedLapLifeRemaining (the game's own life estimate). */
  lifeRemaining: number | null;
  lapsCompleted: number;
  sessionLastUsedIn: number | null;
  /** AvailabilityState === 0 — see the availability note in buildTyreInventory. */
  available: boolean;
  /** Repo convention: FrontLeftWear >= 0.99 (unchanged since v0.6.x). */
  fresh: boolean;
}

export interface InventoryCar {
  carId: number;
  /** Driver name when the seat mapping is verified, else "Xe 1/2". */
  label: string;
  driverId: number | null;
  seatVerified: boolean;
  sets: InventorySet[];
}

export interface InventoryCompoundAgg {
  compound: InventoryCompound;
  /** Fresh (wear ≥ 0.99) set count + average life across them. */
  fresh: number;
  freshLife: number | null;
  /** Scrubbed/used set count + wear and remaining-life ranges. */
  used: number;
  usedWear: [number, number] | null;
  usedLife: [number, number] | null;
}

export interface TyreInventory {
  cars: InventoryCar[];
  /** False when the CarID→team map itself is unverified (labels only). */
  perCar: boolean;
  /**
   * v0.7.1: ALWAYS the player's two cars — never the whole-championship
   * allocation. The v0.7.0 fallback aggregated model.tyres (440 sets, all
   * 22 cars) whenever the map was unverified, which displayed ×44/×24/×23
   * of fresh S/M/H as if they were the garage and produced a cap that
   * never bound (max field life ≥ model life).
   */
  teamAggregate: InventoryCompoundAgg[];
  /**
   * The feasibility cap per dry compound: min(model life, the best
   * remaining life among AVAILABLE sets of the player's team). This — not
   * the field-median model life — is what plans must physically survive.
   * Team-level conservative aggregate: the MIN across the player's cars.
   */
  maxStint: Record<'S' | 'M' | 'H', number>;
  /**
   * v0.7.1 — the same cap per CAR (keyed by CarID). The two-car split must
   * optimise each car against ITS OWN cap; `maxStint` (min across cars) is
   * only the conservative team-level display number. Both paths are locked
   * by tests so a future divergence between cars cannot be silently lost.
   */
  perCarMaxStint: Record<number, Record<'S' | 'M' | 'H', number>>;
  availableNote: 'state0' | 'none';
}

/**
 * Availability rule (documented, spec bước 3): the save ships NO enum table
 * for AvailabilityState (probed every *_Enum table on real 1.11 saves).
 * Verified observations across 440-row allocations on two real saves:
 *   (a) every fresh set (wear ≥ 0.99) except redundant duplicates carries
 *       AvailabilityState 0;
 *   (b) only states {0, 2} occur; state 2 marks sets already used in
 *       practice/quali sessions;
 *   (c) treating ONLY state 0 as race-available reproduces the owner's
 *       verified Monza cap {S 24, M 36, H 55} — the excluded state-2 sets
 *       never raise any verified cap (their lives are strictly below the
 *       fresh-set lives of the same compound).
 * The rule is deliberately conservative: a state-2 set is never proposed.
 */
export function buildTyreInventory(
  model: SaveModel,
  lives: Record<'S' | 'M' | 'H', number>,
  raceId?: number,
): TyreInventory | null {
  if (model.tyres.length === 0) return null;
  const carTeams = model.gridPenalties?.carTeams ?? [];
  const playerTeamId = model.player.teamId;
  const teamCars = carTeams.filter((c) => c.teamId === playerTeamId).map((c) => c.carId);
  /* v0.7.1: without the CarID→team mapping the player's sets cannot be
     identified — an honest absence, not a whole-championship guess. */
  if (teamCars.length === 0) return null;
  const perCar = model.gridPenalties?.carTeamsVerified !== false && teamCars.length === 2;

  const wearOf = (t: (typeof model.tyres)[number]): number => {
    const wheels = [t.frontLeftWear, t.frontRightWear, t.backLeftWear, t.backRightWear]
      .filter((w): w is number => w != null);
    return wheels.length > 0 ? Math.min(...wheels) : t.frontLeftWear;
  };

  const setsOf = (carId: number): InventorySet[] =>
    model.tyres
      .filter((t) => t.carId === carId)
      .map((t) => ({
        tyreSetId: t.tyreSetId,
        compound: (ALLOC_COMPOUND[t.weekendTyreType] ?? 'H') as InventoryCompound,
        wear: wearOf(t),
        lifeRemaining: t.estimatedLapLifeRemaining ?? null,
        lapsCompleted: t.lapsCompleted ?? 0,
        sessionLastUsedIn: t.sessionLastUsedIn ?? null,
        available: t.availabilityState === 0,
        fresh: t.frontLeftWear >= 0.99,
      }))
      .sort((a, b) => a.tyreSetId - b.tyreSetId);

  const carDrivers = resolveCarDrivers(model, raceId);
  let carIndex = 0;
  const cars: InventoryCar[] = teamCars.map((carId) => {
    const mapped = carDrivers.byCar.get(carId) ?? null;
    const idx = carIndex++;
    return {
      carId,
      label: mapped?.verified
        ? model.drivers.find((d) => d.staffId === mapped.driverId)?.fullName ?? `Xe ${idx + 1}`
        : `Xe ${idx + 1}`,
      driverId: mapped?.driverId ?? null,
      seatVerified: mapped?.verified ?? false,
      sets: setsOf(carId),
    };
  });

  /* aggregate across the player's cars — v0.7.1: ALWAYS. The old
     `perCar ? cars.flatMap(...) : model.tyres.map(...)` branch aggregated
     the WHOLE CHAMPIONSHIP (440 sets) whenever the map was unverified,
     displaying ×44/×24/×23 as the garage and building a cap from max field
     life that could never bind. The `perCar` flag now decides LABELS only
     (verified driver names vs "Xe 1 / Xe 2"), never the data scope. */
  const allSets = cars.flatMap((c) => c.sets);
  const teamAggregate: InventoryCompoundAgg[] = (['S', 'M', 'H', 'I', 'W'] as const)
    .map((compound) => {
      const rows = allSets.filter((s) => s.compound === compound);
      const freshRows = rows.filter((s) => s.fresh);
      const usedRows = rows.filter((s) => !s.fresh);
      const avg = (xs: number[]): number | null =>
        xs.length === 0 ? null : Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;
      const range = (xs: number[]): [number, number] | null =>
        xs.length === 0 ? null : [Math.min(...xs), Math.max(...xs)];
      return {
        compound,
        fresh: freshRows.length,
        freshLife: avg(freshRows.map((s) => s.lifeRemaining ?? 0).filter((v) => v > 0)),
        used: usedRows.length,
        usedWear: range(usedRows.map((s) => s.wear)),
        usedLife: range(usedRows.map((s) => s.lifeRemaining ?? 0).filter((v) => v > 0)),
      };
    });

  /* the feasibility cap — best AVAILABLE life per compound. v0.7.1 keeps
     the conservative min(per-car caps, team cap) for the team-level
     maxStint AND exposes each car's own cap so the two-car split can
     optimise every car against its own garage. All inputs are the
     player's sets — never the field's. */
  const carCap = (car: InventoryCar, compound: InventoryCompound): number => {
    const usable = car.sets.filter(
      (s) => s.compound === compound && s.available && (s.lifeRemaining ?? 0) > 0,
    );
    return usable.length > 0 ? Math.max(...usable.map((s) => s.lifeRemaining as number)) : 0;
  };
  const perCarMaxStint: Record<number, Record<'S' | 'M' | 'H', number>> = {};
  for (const car of cars) {
    perCarMaxStint[car.carId] = { S: 0, M: 0, H: 0 };
    for (const c of ['S', 'M', 'H'] as const) {
      const cap = carCap(car, c);
      perCarMaxStint[car.carId]![c] = cap > 0 ? Math.min(lives[c], Math.round(cap)) : lives[c];
    }
  }
  const capFor = (compound: InventoryCompound): number => {
    const perCarCaps = cars.map((car) => carCap(car, compound));
    const teamCap = (() => {
      const usable = allSets.filter(
        (s) => s.compound === compound && s.available && (s.lifeRemaining ?? 0) > 0,
      );
      return usable.length > 0 ? Math.max(...usable.map((s) => s.lifeRemaining as number)) : 0;
    })();
    const candidates = perCarCaps.length === 2 ? [...perCarCaps, teamCap] : [teamCap];
    const best = Math.min(...candidates);
    return best > 0 ? best : 0;
  };
  const maxStint: Record<'S' | 'M' | 'H', number> = { S: 0, M: 0, H: 0 };
  for (const c of ['S', 'M', 'H'] as const) {
    const cap = capFor(c);
    maxStint[c] = cap > 0 ? Math.min(lives[c], Math.round(cap)) : lives[c];
  }

  return { cars, perCar, teamAggregate, maxStint, perCarMaxStint, availableNote: 'state0' };
}

/** WeekendTyreType → compound — the v0.6.2-verified encoding (0=H…4=W). */
export const ALLOC_COMPOUND: Record<number, InventoryCompound> = {
  0: 'H', 1: 'M', 2: 'S', 3: 'I', 4: 'W',
};

/* ── weekend readiness (the strategy data gate) ─────────────────────────── */

export type MissingDataKey = 'allocation' | 'practice' | 'quali';

export interface WeekendReadiness {
  /** Save_CarTyreAllocation has rows for the active weekend. */
  allocation: boolean;
  /** Practice sessions with results for this race. */
  practiceSessions: number;
  /** Final grid derivable from qualifying + penalties. */
  quali: boolean;
  /** All three gates passed AND the race has not already been run. */
  ready: boolean;
  missing: MissingDataKey[];
  /** The derived grid (null before qualifying). */
  grid: GridEntry[] | null;
  derivedGrid: DerivedGrid | null;
}

/**
 * The strategy data gate (v0.7.0, spec bước 2): the web may not predict ANY
 * strategy until the save carries the weekend's allocation, at least one
 * practice session, and a derivable qualifying grid. A completed race is
 * never "ready" — its allocation rows are wiped post-race and re-computing
 * a model-only plan for it would present a guess as a recommendation.
 */
export function assessReadiness(model: SaveModel, raceId: number): WeekendReadiness {
  const race = model.races.find((r) => r.raceId === raceId) ?? null;
  const allocation = model.tyres.length > 0;
  const practiceSessions = race
    ? new Set((race.practice ?? []).map((p) => p.session)).size
    : 0;
  const derivedGrid = race ? deriveGridForRace(model, race) : null;
  const quali = derivedGrid != null && derivedGrid.grid.length >= 2;
  const missing: MissingDataKey[] = [];
  if (!allocation) missing.push('allocation');
  if (practiceSessions < 1) missing.push('practice');
  if (!quali) missing.push('quali');
  const ready = race != null && race.state !== 2 && allocation && practiceSessions >= 1 && quali;
  return {
    allocation,
    practiceSessions,
    quali,
    ready,
    missing,
    grid: derivedGrid?.grid ?? null,
    derivedGrid,
  };
}
