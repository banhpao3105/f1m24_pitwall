/**
 * Sim engine unit tests — Phase 2 (docs/05 §9.2).
 * Deterministic SaveModel fixtures; quali sim falls back grid → practice.
 *
 * v0.5.5: race sim ranks by RACE pace (average lap, Time/Laps); the
 * fastest-lap median is a tiebreak only. The verified fixture encodes the
 * SQL-checked numbers of the real Bahrain Day 46507 save (prompt mục 0):
 * driver medians over 4 races 2027 — O'Ward #10 (0.493s), Ricciardo #12
 * (0.573s), not the old fastest-lap projection P19/P21. Quali sim
 * (Ricciardo P17 / O'Ward P21) must stay unchanged.
 */

import { describe, it, expect } from 'vitest';
import { buildSim, Q3_FRACTION } from '@/engines/sim.engine';
import type { SaveModel, Race, RaceResult } from '@/domain/types';
import { emptyPhase2Sections } from '../helpers/model';

let nextId = 5000;

function makeRace(partial: Partial<Race> = {}): Race {
  const id = partial.raceId ?? nextId++;
  return {
    raceId: id,
    seasonId: 2024,
    trackId: 1,
    trackName: 'Sim Track',
    day: id * 10,
    state: 2,
    isSprint: false,
    laps: 40,
    results: [],
    ...partial,
  };
}

function makeModel(races: Race[], overrides: Partial<SaveModel> = {}): SaveModel {
  return {
    meta: {
      id: 'test', fileName: 'test.sav', fileSizeBytes: 1,
      gameVersion: 'F1M24', saveGameVersion: 3, parsedAt: '2026-01-01T00:00:00Z',
      seasonId: 2024, day: 400, playerTeamId: 1,
      tablesPresent: [], tablesMissing: [], warnings: [],
    },
    player: { teamId: 1, teamName: 'Player Racing', customTeamEnabled: false },
    teams: [
      { teamId: 1, teamName: 'Player Racing', isCustomTeam: false, formula: 1 },
      { teamId: 2, teamName: 'Rival Racing', isCustomTeam: false, formula: 1 },
    ],
    drivers: [],
    staff: [],
    seasons: [],
    races,
    standings: { drivers: [], teams: [] },
    tyres: [],
    ...emptyPhase2Sections(),
    availability: [],
    ...overrides,
  };
}

/** driver 1/2 = team 1 (player), driver 3/4 = team 2. Race-pace offsets
 *  mirror the fastest-lap offsets so both metrics agree on the order. */
function field(race: Race, fastestBase = 90_000): Race {
  const base = fastestBase;
  const mk = (
    driverId: number, driverName: string, teamId: number, teamName: string,
    finishingPos: number, points: number, off: number,
  ): RaceResult => ({
    driverId, driverName, teamId, teamName, finishingPos, points, dnf: false,
    fastestLapMs: base + off,
    laps: 40,
    totalTimeMs: (base + off) * 40,
  });
  race.results = [
    mk(1, 'Alpha One', 1, 'Player Racing', 1, 25, 0),
    mk(2, 'Alpha Two', 1, 'Player Racing', 2, 18, 400),
    mk(3, 'Beta One', 2, 'Rival Racing', 3, 15, 200),
    mk(4, 'Beta Two', 2, 'Rival Racing', 4, 12, 600),
  ];
  race.qualifying = [
    { driverId: 1, driverName: 'Alpha One', teamId: 1, finishingPos: 2 },
    { driverId: 2, driverName: 'Alpha Two', teamId: 1, finishingPos: 3 },
    { driverId: 3, driverName: 'Beta One', teamId: 2, finishingPos: 1 },
    { driverId: 4, driverName: 'Beta Two', teamId: 2, finishingPos: 4 },
  ];
  return race;
}

/** Compact row builder for the tiebreak fixtures. */
function simRow(
  driverId: number, driverName: string, teamId: number, finishingPos: number,
  o: { fl?: number; gap?: number; dnf?: boolean; noTime?: boolean } = {},
): RaceResult {
  const laps = 40;
  return {
    driverId, driverName, teamId, teamName: `Team ${teamId}`,
    finishingPos, points: 0, dnf: o.dnf ?? false,
    fastestLapMs: o.dnf ? undefined : 90_000 + (o.fl ?? 0),
    laps: o.dnf ? 12 : laps,
    totalTimeMs: o.dnf || o.noTime || o.gap == null
      ? undefined
      : (90_000 + o.gap) * laps,
  };
}

/* ── v0.5.5 verified-Bahrain fixture ──────────────────────────────────────
 * Encodes the SQL-verified Bahrain Day 46507 numbers (prompt mục 0) as a
 * synthetic 2027 season — no real save data, only the published aggregates.
 * Session-best average lap rotates Verstappen → Russell → Piastri → Hadjar
 * so each keeps its verified median. Player team (CustomTeam, id 110):
 * O'Ward + Ricciardo with their REAL per-race average-lap gaps.
 */
const ROSTER: { id: number; name: string; teamId: number }[] = [
  { id: 1, name: 'Verstappen', teamId: 101 },
  { id: 2, name: 'Russell', teamId: 101 },
  { id: 3, name: 'Piastri', teamId: 102 },
  { id: 4, name: 'Hadjar', teamId: 102 },
  { id: 5, name: 'Norris', teamId: 103 },
  { id: 6, name: 'Antonelli', teamId: 103 },
  { id: 7, name: 'Albon', teamId: 104 },
  { id: 8, name: 'Leclerc', teamId: 104 },
  { id: 9, name: 'Gasly', teamId: 105 },
  { id: 10, name: "O'Ward", teamId: 110 },
  { id: 11, name: 'De Vries', teamId: 105 },
  { id: 12, name: 'Ricciardo', teamId: 110 },
  { id: 13, name: 'Bearman', teamId: 106 },
  { id: 14, name: 'Reserve 14', teamId: 106 },
  { id: 15, name: 'Reserve 15', teamId: 107 },
  { id: 16, name: 'Reserve 16', teamId: 107 },
  { id: 17, name: 'Reserve 17', teamId: 108 },
  { id: 18, name: 'Reserve 18', teamId: 108 },
  { id: 19, name: 'Reserve 19', teamId: 109 },
  { id: 20, name: 'Reserve 20', teamId: 109 },
  { id: 21, name: 'Mini', teamId: 111 },
  { id: 22, name: 'Sub One', teamId: 111 },
];

const PLAYER_TEAM = 110;
/** Verified median average-lap gap per driver (seconds). */
const RACE_PACE_BASE: Record<string, number> = {
  Verstappen: 0.002, Russell: 0.108, Piastri: 0.145, Hadjar: 0.211,
  Norris: 0.314, Antonelli: 0.315, Albon: 0.386, Leclerc: 0.432,
  Gasly: 0.47, 'De Vries': 0.573, Bearman: 0.611,
  'Reserve 14': 0.7, 'Reserve 15': 0.9, 'Reserve 16': 1.1,
  'Reserve 17': 1.3, 'Reserve 18': 1.5, 'Reserve 19': 1.8, 'Reserve 20': 2.0,
  Mini: 2.221,
};
/** Fastest-lap deltas — tiebreak only. O'Ward/Ricciardo are the real
 *  values quoted in the prompt (+2.23s / +2.308s); De Vries < Ricciardo
 *  reproduces the verified #11/#12 order on their 0.573s tie. */
const FL_DELTA: Record<string, number> = {
  Verstappen: 0, Russell: 0.108, Piastri: 0.145, Hadjar: 0.211,
  Norris: 0.314, Antonelli: 0.315, Albon: 0.386, Leclerc: 0.432,
  Gasly: 0.47, "O'Ward": 2.23, 'De Vries': 1.5, Ricciardo: 2.308,
  Bearman: 0.611, 'Reserve 14': 0.7, 'Reserve 15': 0.9, 'Reserve 16': 1.1,
  'Reserve 17': 1.3, 'Reserve 18': 1.5, 'Reserve 19': 1.8, 'Reserve 20': 2.0,
  Mini: 2.9, 'Sub One': 0.5,
};
/** Verified quali medians: Ricciardo 17, O'Ward 21 (unchanged by v0.5.5). */
const QUALI_POS: Record<string, number> = {
  Verstappen: 1, Russell: 2, Piastri: 3, Hadjar: 4, Norris: 5, Antonelli: 6,
  Albon: 7, Leclerc: 8, Gasly: 9, 'De Vries': 10, Bearman: 11,
  'Reserve 14': 12, 'Reserve 15': 13, 'Reserve 16': 14, 'Reserve 17': 15,
  'Reserve 18': 16, Ricciardo: 17, 'Reserve 19': 18, 'Reserve 20': 19,
  Mini: 20, "O'Ward": 21, 'Sub One': 22,
};
/** Race order: Albert Park, Thượng Hải, Suzuka, Bahrain (idx 0..3). */
const TRACKS = ['Albert Park', 'Thượng Hải', 'Suzuka', 'Bahrain'];
const BEST_BY_RACE = ['Verstappen', 'Russell', 'Piastri', 'Hadjar'];

function avgGapFor(name: string, raceIdx: number): number | null {
  if (BEST_BY_RACE[raceIdx] === name) return 0;
  if (name === "O'Ward") {
    // real per-race: 0.443 / 0.493 / DNF / 1.796 → median 0.493
    return [0.443, 0.493, null, 1.796][raceIdx];
  }
  if (name === 'Ricciardo') {
    // real per-race: 0.554 / 0.592 / 0.421 / 1.113 → median 0.573
    return [0.554, 0.592, 0.421, 1.113][raceIdx];
  }
  if (name === 'Sub One') return raceIdx === 3 ? 3.0 : null; // 1 sample only
  return RACE_PACE_BASE[name] ?? null;
}

/** Bahrain Day 46507 reality (prompt mục 0): Ricciardo P9→P4, O'Ward P22→P9. */
const BAHRAIN_START: Record<string, number> = { Ricciardo: 9, "O'Ward": 22 };
const BAHRAIN_FINISH: Record<string, number> = { Verstappen: 1, Ricciardo: 4, "O'Ward": 9 };

function verifiedRace(raceIdx: number, seasonId: number): Race {
  const results: RaceResult[] = [];
  const quali: { driverId: number; driverName: string; teamId: number; finishingPos: number }[] = [];
  for (const d of ROSTER) {
    const gap = avgGapFor(d.name, raceIdx);
    if (gap == null && d.name === "O'Ward") {
      // Suzuka DNF: no Time/Laps, no fastest-lap delta — excluded from both
      results.push({
        driverId: d.id, driverName: d.name, teamId: d.teamId, teamName: `T${d.teamId}`,
        finishingPos: 22, points: 0, dnf: true, laps: 31,
      });
    } else if (gap == null) {
      continue; // Sub One absent before Bahrain
    } else {
      const avgLapMs = 90_000 + Math.round(gap * 1000);
      results.push({
        driverId: d.id, driverName: d.name, teamId: d.teamId, teamName: `T${d.teamId}`,
        finishingPos: raceIdx === 3 ? (BAHRAIN_FINISH[d.name] ?? 15) : 1,
        startingPos: raceIdx === 3 ? (BAHRAIN_START[d.name] ?? 15) : QUALI_POS[d.name],
        points: 0, dnf: false,
        fastestLapMs: 90_000 + Math.round((FL_DELTA[d.name] ?? 3) * 1000),
        laps: 50, totalTimeMs: avgLapMs * 50,
      });
    }
    quali.push({ driverId: d.id, driverName: d.name, teamId: d.teamId, finishingPos: QUALI_POS[d.name] });
  }
  return {
    raceId: 190 + raceIdx,
    seasonId,
    trackId: raceIdx + 1,
    trackName: TRACKS[raceIdx],
    day: 46_400 + raceIdx * 10,
    state: 2,
    isSprint: false,
    laps: 50,
    results,
    qualifying: quali,
  };
}

function verifiedModel(): SaveModel {
  const races = [
    ...TRACKS.map((_, i) => verifiedRace(i, 2027)),
    {
      raceId: 199, seasonId: 2027, trackId: 5, trackName: 'Jeddah',
      day: 46_450, state: 1, isSprint: false, laps: 50, results: [],
    },
  ];
  return makeModel(races, {
    meta: {
      id: 'verified', fileName: 'autosave-2.sav', fileSizeBytes: 1,
      gameVersion: 'F1M24', saveGameVersion: 3, parsedAt: '2026-01-01T00:00:00Z',
      seasonId: 2027, day: 46_450, playerTeamId: PLAYER_TEAM,
      tablesPresent: [], tablesMissing: [], warnings: [],
    },
    player: { teamId: PLAYER_TEAM, teamName: 'CustomTeam', customTeamEnabled: true },
    teams: ROSTER.reduce<{ teamId: number; teamName: string; isCustomTeam: boolean; formula: number }[]>((acc, d) => {
      if (!acc.some((t) => t.teamId === d.teamId)) {
        acc.push({ teamId: d.teamId, teamName: `T${d.teamId}`, isCustomTeam: d.teamId === PLAYER_TEAM, formula: 1 });
      }
      return acc;
    }, []),
    standings: {
      drivers: [],
      teams: [101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111].map((id, i) => ({
        position: i + 1, id, name: `T${id}`, points: 100 - i * 10,
      })),
    },
  });
}

describe('buildSim — quali sim', () => {
  it('predicts grid from median quali positions', () => {
    const races = [
      ...[1, 2, 3].map((i) => field(makeRace({ raceId: i, trackId: 1 }))),
      // upcoming race the sim will target
      makeRace({ raceId: 999, state: 1, results: [] }),
    ];
    const model = makeModel(races);
    const sim = buildSim(model, 999); // upcoming race (not in model)
    expect(sim.warnings).toEqual([]);
    expect(sim.data.quali).toHaveLength(4);
    const p1 = sim.data.quali[0];
    // Beta One has quali median 1 across races → predicted P1
    expect(p1.driverId).toBe(3);
    expect(p1.predictedGridPos).toBe(1);
    expect(p1.source).toBe('quali');
    expect(p1.samples).toBe(3);
  });

  it('assigns Q3/Q2/Q1 bands per model rule', () => {
    const races = [field(makeRace())];
    const model = makeModel(races);
    const sim = buildSim(model, 999);
    const bands = sim.data.quali.map((q) => q.band);
    // 4 drivers → q3Cut = round(4*0.5)=2 → first two rows Q3
    expect(bands[0]).toBe('Q3');
    expect(bands[1]).toBe('Q3');
    expect(bands).toContain('Q2');
    expect(Q3_FRACTION).toBe(0.5);
  });

  it('falls back to grid positions when no quali data', () => {
    const race = field(makeRace());
    race.qualifying = undefined;
    race.results.forEach((r, i) => {
      r.startingPos = i + 1;
    });
    const model = makeModel([race]);
    const sim = buildSim(model, 999);
    expect(sim.data.quali.every((q) => q.source === 'grid')).toBe(true);
  });

  it('falls back to practice laps as LOW source', () => {
    const race = field(makeRace());
    race.qualifying = undefined;
    race.results.forEach((r) => {
      r.startingPos = undefined;
    });
    race.practice = [
      { driverId: 3, teamId: 2, session: 1, bestLapMs: 88_000, bestLapTyre: 2 },
      { driverId: 1, teamId: 1, session: 1, bestLapMs: 89_000, bestLapTyre: 2 },
    ];
    const model = makeModel([race]);
    const sim = buildSim(model, 999);
    const sources = new Set(sim.data.quali.map((q) => q.source));
    expect(sources.has('practice')).toBe(true);
    expect(sim.confidence).toBe('LOW');
    expect(sim.assumptions.some((a) => a.text.includes('quali history'))).toBe(true);
  });
});

describe('buildSim — race sim', () => {
  it('ranks by median race-pace delta; fastest-lap delta kept as tiebreak data', () => {
    const races = [1, 2].map((i) => field(makeRace({ raceId: i })));
    const model = makeModel(races);
    const sim = buildSim(model, 999);
    expect(sim.data.race[0].driverId).toBe(1); // race-pace delta 0
    expect(sim.data.race[0].racePaceDeltaS).toBe(0);
    expect(sim.data.race[0].paceDeltaS).toBe(0); // fastest-lap preserved
    expect(sim.data.race[0].samples).toBe(2);
    expect(sim.data.race[1].driverId).toBe(3); // +0.2 → P2
    expect(sim.data.race[0].isPlayer).toBe(true);
  });

  it('produces a 6-field recommendation against the nearest rival', () => {
    const races = [
      ...[1, 2, 3].map((i) => field(makeRace({ raceId: i }))),
      makeRace({ raceId: 999, state: 1, results: [] }),
    ];
    const model = makeModel(races);
    const sim = buildSim(model, 999);
    const rec = sim.recommendations[0];
    expect(rec.id).toMatch(/^sim-race-|^sim-nodata-/);
    expect(rec.action.length).toBeGreaterThan(0);
    expect(rec.why.length).toBeGreaterThan(0);
    expect(rec.evidence.length).toBeGreaterThan(0);
    expect(['HIGH', 'MEDIUM', 'LOW']).toContain(rec.confidence);
    expect(sim.confidence).toBe('HIGH'); // ≥2 quali samples + ≥2 race-pace samples
  });

  it('warns RACE_NOT_FOUND for unknown race id', () => {
    const sim = buildSim(makeModel([]), 12345);
    expect(sim.warnings).toEqual(['RACE_NOT_FOUND:12345']);
    expect(sim.recommendations).toEqual([]);
  });

  it('flags completed races with RACE_ALREADY_COMPLETED', () => {
    const sim = buildSim(makeModel([field(makeRace({ raceId: 7 }))]), 7);
    expect(sim.warnings).toContain('RACE_ALREADY_COMPLETED');
  });
});

describe('buildSim — race sim ranks by race pace (v0.5.5, verified Bahrain)', () => {
  const sim = buildSim(verifiedModel(), 199);
  const race = sim.data.race;
  const posOf = (name: string): number =>
    race.findIndex((r) => r.driverName === name) + 1;

  it('projects O\'Ward ~P10 and Ricciardo ~P12 — no longer P19/P21', () => {
    const oWard = race.find((r) => r.driverName === "O'Ward")!;
    const ricciardo = race.find((r) => r.driverName === 'Ricciardo')!;
    // DoD ranges: O'Ward P9–P12, Ricciardo P10–P13 — exact verified ranks locked
    expect(oWard.projectedFinish).toBe(10);
    expect(ricciardo.projectedFinish).toBe(12);
    expect(oWard.projectedFinish).toBeGreaterThanOrEqual(9);
    expect(oWard.projectedFinish).toBeLessThanOrEqual(12);
    expect(ricciardo.projectedFinish).toBeGreaterThanOrEqual(10);
    expect(ricciardo.projectedFinish).toBeLessThanOrEqual(13);
  });

  it('locks the verified race-pace medians and sample counts', () => {
    const oWard = race.find((r) => r.driverName === "O'Ward")!;
    const ricciardo = race.find((r) => r.driverName === 'Ricciardo')!;
    expect(oWard.racePaceDeltaS).toBe(0.493); // median of [1.796, 0.493, 0.443]
    expect(oWard.samples).toBe(3); // Suzuka DNF excluded
    expect(ricciardo.racePaceDeltaS).toBeCloseTo(0.573, 12); // median of 4
    expect(ricciardo.samples).toBe(4);
    // fastest-lap medians preserved unchanged (tiebreak data)
    expect(oWard.paceDeltaS).toBe(2.23);
    expect(ricciardo.paceDeltaS).toBe(2.308);
  });

  it('reproduces the verified driver order incl. the De Vries/Ricciardo tie', () => {
    // Top of the field per mục 0; De Vries beats Ricciardo on the
    // fastest-lap tiebreak at equal 0.573s race pace.
    expect(race[0].driverName).toBe('Verstappen');
    expect(race[1].driverName).toBe('Russell');
    expect(race[2].driverName).toBe('Piastri');
    expect(race[3].driverName).toBe('Hadjar');
    expect(race[8].driverName).toBe('Gasly');
    expect(race[9].driverName).toBe("O'Ward");
    expect(race[10].driverName).toBe('De Vries');
    expect(race[11].driverName).toBe('Ricciardo');
    expect(race[12].driverName).toBe('Bearman');
    expect(race[20].driverName).toBe('Mini');
    expect(posOf('Verstappen')).toBe(1);
    expect(posOf('Mini')).toBe(21);
  });

  it('keeps quali sim unchanged (Ricciardo P17, O\'Ward P21)', () => {
    const ricciardoQ = sim.data.quali.find((q) => q.driverName === 'Ricciardo')!;
    const oWardQ = sim.data.quali.find((q) => q.driverName === "O'Ward")!;
    expect(ricciardoQ.predictedGridPos).toBe(17);
    expect(oWardQ.predictedGridPos).toBe(21);
    expect(ricciardoQ.source).toBe('quali');
    expect(oWardQ.source).toBe('quali');
  });

  it('evidence names race pace as the ranking source and FL as tiebreak', () => {
    expect(sim.evidence.some((e) => e.source === 'Races_Results.Time / Laps')).toBe(true);
    expect(
      sim.evidence.some((e) => e.label.includes('chỉ dùng làm tiebreak')),
    ).toBe(true);
    expect(
      sim.assumptions.some((a) => a.text.includes('fastest-lap chỉ làm tiebreak')),
    ).toBe(true);
    expect(sim.confidence).toBe('HIGH');
  });

  it('recommendation quotes race pace as the main number', () => {
    const rec = sim.recommendations[0];
    expect(rec.id).toBe('sim-race-199');
    // playerBest = O'Ward (P10) — the why must lead with race pace
    expect(rec.why).toContain('Pace đua median +0.493s/vòng (Time/Laps, 3 chặng mẫu)');
    expect(rec.why).toContain('fastest-lap tiebreak +2.230s');
  });
});

describe('buildSim — race-pace ranking rules (v0.5.5)', () => {
  it('tiebreak: equal race-pace median → lower fastest-lap delta wins', () => {
    // X and Y both +0.5s avg-lap (equal avg → equal gap); X FL +1.0s,
    // Y FL +0.4s → Y ahead
    const mk = (raceId: number, day: number): Race => {
      const r = makeRace({ raceId, day });
      r.results = [
        simRow(1, 'X', 1, 1, { fl: 1000, gap: 500 }),
        simRow(2, 'Y', 2, 2, { fl: 400, gap: 500 }),
      ];
      r.qualifying = [
        { driverId: 1, driverName: 'X', teamId: 1, finishingPos: 1 },
        { driverId: 2, driverName: 'Y', teamId: 2, finishingPos: 2 },
      ];
      return r;
    };
    const sim = buildSim(makeModel([mk(1, 10), mk(2, 20)]), 999);
    expect(sim.data.race[0].driverId).toBe(2);
    expect(sim.data.race[1].driverId).toBe(1);
  });

  it('race pace decides ahead of fastest lap when they disagree', () => {
    // Benchmark Z sets both session benchmarks (avg + FL). X avg-lap +0.3s
    // but FL +1.5s; Y avg-lap +0.4s, FL +0.1s → X ranks ahead of Y (race
    // pace primary) — the old fastest-lap-first model would have flipped them.
    const mk = (raceId: number, day: number): Race => {
      const r = makeRace({ raceId, day });
      r.results = [
        simRow(3, 'Z', 2, 1, { fl: 0, gap: 0 }),
        simRow(1, 'X', 1, 2, { fl: 1500, gap: 300 }),
        simRow(2, 'Y', 2, 3, { fl: 100, gap: 400 }),
      ];
      r.qualifying = [
        { driverId: 1, driverName: 'X', teamId: 1, finishingPos: 2 },
        { driverId: 2, driverName: 'Y', teamId: 2, finishingPos: 1 },
        { driverId: 3, driverName: 'Z', teamId: 2, finishingPos: 3 },
      ];
      return r;
    };
    const sim = buildSim(makeModel([mk(1, 10), mk(2, 20)]), 999);
    expect(sim.data.race.map((row) => row.driverId)).toEqual([3, 1, 2]);
  });

  it('driver without any Time/Laps sample ranks last despite the best fastest lap', () => {
    const mk = (raceId: number, day: number): Race => {
      const r = makeRace({ raceId, day });
      r.results = [
        simRow(1, 'Mid A', 1, 2, { fl: 800, gap: 400 }),
        simRow(2, 'Mid B', 2, 3, { fl: 900, gap: 500 }),
        simRow(3, 'Flashing Z', 2, 1, { fl: 0, noTime: true }), // no totalTimeMs
      ];
      r.qualifying = [
        { driverId: 1, driverName: 'Mid A', teamId: 1, finishingPos: 1 },
        { driverId: 2, driverName: 'Mid B', teamId: 2, finishingPos: 2 },
        { driverId: 3, driverName: 'Flashing Z', teamId: 2, finishingPos: 3 },
      ];
      return r;
    };
    const sim = buildSim(makeModel([mk(1, 10), mk(2, 20)]), 999);
    const z = sim.data.race.find((row) => row.driverName === 'Flashing Z')!;
    expect(z.racePaceDeltaS).toBeNull();
    expect(z.paceDeltaS).toBe(0); // fastest-lap delta still measured
    expect(z.projectedFinish).toBe(3); // null race pace → last
  });
});
