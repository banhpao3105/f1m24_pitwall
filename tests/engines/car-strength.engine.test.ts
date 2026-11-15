/**
 * Car Strength Engine tests — v0.8.0 (prompt §Bước 1 tests a/b/c).
 *
 * The post-Monza .sav is not in this sandbox, so the DoD table is locked
 * through tests/helpers/car-strength-fixture.ts (see its header for the
 * clearly-labelled synthetic distribution). What is locked EXACTLY here:
 *   - the 22-row shape (5 aero parts × the stats each part really has),
 *   - player values, best team + value, grid mean, Williams value per row,
 *   - the 3 REAL fallback cases (RB FW 763, RB RW 840, Williams SP 843)
 *     resolving with source 'latest' — including a fallback design BEING
 *     the best (Red Bull RearWing DRSDelta),
 *   - the 'unknown' degradation (no zero-fill),
 *   - pct rounding to 1 decimal (≤ 0.1 drift vs the DoD percents on two
 *     rows, because DoD percents were computed from raw values — exact
 *     equality is asserted on every row within that documented tolerance
 *     and on the headline rows exactly).
 *
 * Engine is pure: the other engines' numbers (pace/tyre/results) are not
 * touched by this module — it reads only parts/teams/player from the model.
 */

import { describe, it, expect } from 'vitest';
import { buildCarStrength, resolveTeamPart, DEFAULT_RIVAL_TEAM_ID } from '@/engines/car-strength.engine';
import {
  buildCarStrengthFixture,
  DOD_TABLE,
  F1_TEAM_NAMES,
  PLAYER_TEAM,
} from '../helpers/car-strength-fixture';

const byRow = (model: ReturnType<typeof buildCarStrengthFixture>) => {
  const board = buildCarStrength(model);
  const key = (part: string, stat: string) => `${part}/${stat}`;
  const map = new Map(board.data.rows.map((r) => [key(r.part, r.stat), r]));
  return { board, map, key };
};

describe('buildCarStrength — the DoD table (v0.8.0)', () => {
  const model = buildCarStrengthFixture();
  const { board, map, key } = byRow(model);

  it('emits exactly the 22 DoD rows in part→stat order', () => {
    expect(board.data.rows).toHaveLength(22);
    expect(board.data.rows.map((r) => key(r.part, r.stat))).toEqual(
      DOD_TABLE.map((d) => `${d.part}/${d.stat}`),
    );
  });

  it('player values, best team + value, mean and Williams match the DoD table', () => {
    for (const d of DOD_TABLE) {
      const r = map.get(key(d.part, d.stat))!;
      expect(r.playerValue, `${d.part}/${d.stat} player`).toBeCloseTo(d.player, 6);
      expect(r.bestTeamId, `${d.part}/${d.stat} best team`).toBe(d.bestTeam);
      expect(r.bestTeamName, `${d.part}/${d.stat} best name`).toBe(F1_TEAM_NAMES[d.bestTeam]);
      expect(r.bestValue, `${d.part}/${d.stat} best value`).toBeCloseTo(d.best, 6);
      expect(r.meanValue, `${d.part}/${d.stat} mean`).toBeCloseTo(d.mean, 6);
      expect(r.rivalTeamId, `${d.part}/${d.stat} rival id`).toBe(6);
      expect(r.rivalValue, `${d.part}/${d.stat} rival value`).toBeCloseTo(d.rival, 6);
    }
  });

  it('percentages round to 1 decimal and match the DoD table (≤ 0.1 rounding drift)', () => {
    for (const d of DOD_TABLE) {
      const r = map.get(key(d.part, d.stat))!;
      expect(Math.abs((r.pctBest ?? 0) - d.pctBest), `${d.part}/${d.stat} pctBest`).toBeLessThanOrEqual(0.1);
      expect(Math.abs((r.pctMean ?? 0) - d.pctMean), `${d.part}/${d.stat} pctMean`).toBeLessThanOrEqual(0.1);
      // one-decimal quantisation, always
      expect(r.pctBest).toBe(Math.round((r.pctBest as number) * 10) / 10);
      expect(r.pctMean).toBe(Math.round((r.pctMean as number) * 10) / 10);
    }
  });

  it('the headline DoD numbers are exact: RW LowDF 32.4/36.9, Floor DragReduction 69.2/75.4, FW AirFlowFront 96.4/102.6', () => {
    const rwLow = map.get(key('RearWing', 'LowSpeedDownforce'))!;
    expect(rwLow.playerValue).toBeCloseTo(222.0, 6);
    expect(rwLow.pctBest).toBe(32.4);
    expect(rwLow.pctMean).toBe(36.9);
    const floorDrag = map.get(key('Floor', 'DragReduction'))!;
    expect(floorDrag.pctBest).toBe(69.2);
    expect(floorDrag.pctMean).toBe(75.4);
    const fwFront = map.get(key('FrontWing', 'AirFlowFront'))!;
    expect(fwFront.pctBest).toBe(96.4);
    expect(fwFront.pctMean).toBe(102.6);
  });

  it('the player is above the grid mean on exactly the 4 DoD rows and never the best (AI is stronger on that save)', () => {
    // the DoD save's own AI state: the best team is always an AI team —
    // the player's story there is "4 stats above the grid MEAN"
    expect(board.data.rows.every((r) => r.bestTeamId !== PLAYER_TEAM)).toBe(true);
    expect(board.data.rows.every((r) => (r.pctBest ?? 100) < 100)).toBe(true);
    const aboveMean = board.data.rows.filter((r) => (r.pctMean ?? 0) > 100);
    expect(aboveMean.map((r) => key(r.part, r.stat))).toEqual([
      'FrontWing/AirFlowFront',
      'FrontWing/LowSpeedDownforce',
      'RearWing/DRSDelta',
      'RearWing/DragReduction',
    ]);
  });

  it('all 11 F1 teams participate; Prema (F2) never appears', () => {
    expect(board.data.f1TeamCount).toBe(11);
    expect(board.data.rivalOptions.map((o) => o.teamId).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(board.data.rows.every((r) => r.bestTeamId !== 11)).toBe(true);
  });

  it('high confidence with provenance, and NO recommendations (no advice engine in v0.8.0)', () => {
    expect(board.confidence).toBe('HIGH');
    expect(board.data.rows.length).toBeGreaterThan(0);
    expect(board.evidence.some((e) => e.source.includes('Parts_Designs_StatValues'))).toBe(true);
    expect(board.evidence.some((e) => e.source.includes('Parts_CarLoadout'))).toBe(true);
    expect(board.recommendations).toEqual([]);
    expect(board.assumptions.some((a) => a.text.includes('TỪNG CHỈ SỐ'))).toBe(true);
    expect(board.assumptions.some((a) => a.text.includes('thời gian vòng'))).toBe(true);
  });
});

describe('buildCarStrength — fallback + unknown sources (v0.8.0)', () => {
  const model = buildCarStrengthFixture();
  const { board, map, key } = byRow(model);

  it('the 3 REAL fallback rows resolve to designs 763/840/843 with source "latest"', () => {
    // Red Bull FrontWing → 763, RearWing → 840; Williams SidePods → 843
    expect(resolveTeamPart(model, 3, 'frontwing')).toEqual({ designId: 763, source: 'latest' });
    expect(resolveTeamPart(model, 3, 'rearwing')).toEqual({ designId: 840, source: 'latest' });
    expect(resolveTeamPart(model, 6, 'sidepods')).toEqual({ designId: 843, source: 'latest' });
    // the player's parts are installed
    expect(resolveTeamPart(model, PLAYER_TEAM, 'body')).toEqual({ designId: 724, source: 'installed' });
    expect(resolveTeamPart(model, PLAYER_TEAM, 'floor')).toEqual({ designId: 692, source: 'installed' });
    expect(board.data.fallbackCount).toBe(3);
  });

  it('a fallback design CAN be the best — Red Bull RearWing DRSDelta 815.0, source labelled', () => {
    const r = map.get(key('RearWing', 'DRSDelta'))!;
    expect(r.bestTeamId).toBe(3);
    expect(r.bestValue).toBeCloseTo(815.0, 6);
    expect(r.bestSource).toBe('latest');
  });

  it('Williams rival values on SidePods come from the fallback design (source labelled)', () => {
    for (const stat of ['AirFlowFront', 'DragReduction', 'AirFlowMiddle']) {
      const r = map.get(key('SidePods', stat))!;
      expect(r.rivalSource).toBe('latest');
      expect(r.rivalValue).toBeCloseTo(DOD_TABLE.find((d) => d.part === 'SidePods' && d.stat === stat)!.rival, 6);
    }
    // non-fallback rival rows are installed
    expect(map.get(key('Body', 'DRSDelta'))!.rivalSource).toBe('installed');
  });

  it('L2 is ignored for resolution (player L1 = L2 on the DoD save)', () => {
    // the fixture mirrors L1 into L2 for the player; values must be L1's
    expect(resolveTeamPart(model, PLAYER_TEAM, 'frontwing')).toEqual({ designId: 722, source: 'installed' });
  });
});

describe('buildCarStrength — the unknown degradation (v0.8.0)', () => {
  const model = buildCarStrengthFixture({ playerSidePodsUnknown: true });
  const board = buildCarStrength(model);
  const map = new Map(board.data.rows.map((r) => [`${r.part}/${r.stat}`, r]));

  it('the player SidePods rows are "unknown" — no value, no percentages, no zeros', () => {
    for (const stat of ['AirFlowFront', 'DragReduction', 'AirFlowMiddle']) {
      const r = map.get(`SidePods/${stat}`)!;
      expect(r.playerValue).toBeNull();
      expect(r.playerDesignId).toBeNull();
      expect(r.playerSource).toBe('unknown');
      expect(r.pctBest).toBeNull();
      expect(r.pctMean).toBeNull();
      // the row itself still exists — the other 10 teams have the stat
      expect(r.bestValue).not.toBeNull();
      expect(r.meanValue).not.toBeNull();
      expect(r.rivalValue).not.toBeNull();
    }
  });

  it('other parts stay installed and the board still completes', () => {
    expect(map.get('Body/DRSDelta')!.playerSource).toBe('installed');
    expect(map.get('Floor/DragReduction')!.playerValue).toBeCloseTo(537.3, 6);
    expect(board.data.rows).toHaveLength(22);
  });
});

describe('buildCarStrength — rival option (v0.8.0)', () => {
  const model = buildCarStrengthFixture();

  it('defaults to Williams (6) and honours a different rival without touching the rest', () => {
    const def = buildCarStrength(model);
    expect(def.data.rivalTeamId).toBe(DEFAULT_RIVAL_TEAM_ID);
    expect(def.data.rivalTeamId).toBe(6);

    const rb = buildCarStrength(model, { rivalTeamId: 3 });
    expect(rb.data.rivalTeamId).toBe(3);
    expect(rb.data.rows[0].rivalTeamName).toBe('Red Bull Racing');
    const row = rb.data.rows.find((r) => r.part === 'RearWing' && r.stat === 'DRSDelta')!;
    // the prompt's head-to-head check: switching to Red Bull → 815.0
    expect(row.rivalValue).toBeCloseTo(815.0, 6);
    // player/best/mean columns are untouched by the rival switch
    expect(row.playerValue).toBeCloseTo(782.4, 6);
    expect(row.bestValue).toBeCloseTo(815.0, 6);
    expect(row.meanValue).toBeCloseTo(769.3, 6);

    const ferrari = buildCarStrength(model, { rivalTeamId: 1 });
    expect(ferrari.data.rows.find((r) => r.part === 'Body' && r.stat === 'DRSDelta')!.rivalValue).toBeCloseTo(739.3, 6);
  });

  it('falls back to Williams when the requested rival is the player or unknown', () => {
    const self = buildCarStrength(model, { rivalTeamId: PLAYER_TEAM });
    expect(self.data.rivalTeamId).toBe(6);
    const bogus = buildCarStrength(model, { rivalTeamId: 11 }); // Prema F2
    expect(bogus.data.rivalTeamId).toBe(6);
  });
});
