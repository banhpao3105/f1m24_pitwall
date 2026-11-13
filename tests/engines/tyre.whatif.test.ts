/**
 * Tyre engine what-if unit tests — Phase 2 (docs/03 §5.3 what-if).
 * Baseline plan comes from the verified evaluateStrategy optimum
 * (S→M 11/19, 30 laps, lives S14/M22/H30, deltas 0/0.55/1.05, pit 20.7s).
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateStrategy,
  whatIfPitShift,
  buildWetPlan,
} from '@/engines/tyre.engine';
import type { SaveModel, TyreAllocation } from '@/domain/types';
import { emptyPhase2Sections } from '../helpers/model';

const LAPS = 30;
const MAX_STINT = { S: 14, M: 22, H: 30 };
const DELTAS = { S: 0, M: 0.55, H: 1.05 };
const PIT_COST = 20.7;

function baseline() {
  const result = evaluateStrategy(['S', 'M'], LAPS, MAX_STINT, DELTAS, PIT_COST);
  expect(result).not.toBeNull();
  const stints = result!.stints.map((s) => ({ ...s }));
  return {
    order: ['S', 'M'] as ('S' | 'M')[],
    stops: 1,
    timeS: result!.timeS,
    stints,
    pitLaps: [stints[0].laps],
    vsBestS: null,
  };
}

describe('whatIfPitShift', () => {
  it('shift=0 returns the baseline unchanged', () => {
    const base = baseline();
    const r = whatIfPitShift(base, LAPS, MAX_STINT, DELTAS, PIT_COST, 0);
    expect(r.shifted).toBe(base);
    expect(r.deltaS).toBe(0);
    expect(r.clamped).toBe(false);
  });

  it('shift +2 later costs time (longer soft stint hits deg curve)', () => {
    const base = baseline();
    const r = whatIfPitShift(base, LAPS, MAX_STINT, DELTAS, PIT_COST, 2);
    expect(r.shifted).not.toBeNull();
    expect(r.shifted!.pitLaps[0]).toBe(base.pitLaps[0] + 2);
    expect(r.shifted!.stints[0].laps).toBe(base.stints[0].laps + 2);
    expect(r.deltaS).not.toBeNull();
    expect(r.deltaS!).toBeGreaterThan(0); // later pit on soft = more deg
  });

  it('shift -2 earlier also changes the split', () => {
    const base = baseline();
    const r = whatIfPitShift(base, LAPS, MAX_STINT, DELTAS, PIT_COST, -2);
    expect(r.shifted!.pitLaps[0]).toBe(base.pitLaps[0] - 2);
    expect(r.deltaS).not.toBeNull();
  });

  it('clamps to tyre life and reports clamped=true', () => {
    const base = baseline();
    // Soft life is 14; baseline first stint is 11 → +10 must clamp at 14
    const r = whatIfPitShift(base, LAPS, MAX_STINT, DELTAS, PIT_COST, 10);
    expect(r.shifted).not.toBeNull();
    expect(r.shifted!.stints[0].laps).toBeLessThanOrEqual(MAX_STINT.S);
    expect(r.clamped).toBe(true);
  });

  it('returns null for infeasible shifts', () => {
    const base = baseline();
    // -20 would force the first stint below MIN_STINT_LAPS=4
    const r = whatIfPitShift(base, LAPS, MAX_STINT, DELTAS, PIT_COST, -20);
    expect(r.shifted).toBeNull();
    expect(r.deltaS).toBeNull();
    expect(r.clamped).toBe(true);
  });
});

describe('buildWetPlan', () => {
  const modelWithWet = (iLife: number | null, wLife: number | null): SaveModel => {
    const tyres: TyreAllocation[] = [];
    if (iLife != null) {
      tyres.push({ carId: 1, tyreSetId: 1, weekendTyreType: 1, frontLeftWear: 1, availabilityState: 0, estimatedLapLifeRemaining: iLife });
    }
    if (wLife != null) {
      tyres.push({ carId: 1, tyreSetId: 2, weekendTyreType: 0, frontLeftWear: 1, availabilityState: 0, estimatedLapLifeRemaining: wLife });
    }
    return {
      meta: {
        id: 't', fileName: 't.sav', fileSizeBytes: 1,
        gameVersion: 'F1M24', saveGameVersion: 3, parsedAt: '2026-01-01T00:00:00Z',
        seasonId: 2024, day: 1, playerTeamId: 1,
        tablesPresent: [], tablesMissing: [], warnings: [],
      },
      player: { teamId: 1, teamName: 'P', customTeamEnabled: false },
      teams: [], drivers: [], staff: [], seasons: [], races: [],
      standings: { drivers: [], teams: [] },
      tyres,
      ...emptyPhase2Sections(),
      availability: [],
    };
  };

  it('builds I→W plan from allocation lives', () => {
    const plan = buildWetPlan(modelWithWet(12, 40), 30);
    expect(plan).not.toBeNull();
    expect(plan!.stints).toEqual([
      { compound: 'I', laps: 12 },
      { compound: 'W', laps: 18 },
    ]);
    expect(plan!.pitLaps).toEqual([12]);
    expect(plan!.source).toBe('allocation');
  });

  it('single-inter plan carries an explicit note when W life unknown', () => {
    const plan = buildWetPlan(modelWithWet(12, null), 30);
    expect(plan!.stints).toEqual([
      { compound: 'I', laps: 12 },
      { compound: 'I', laps: 18 },
    ]);
    expect(plan!.note).toBeTruthy();
  });

  it('returns null when the save has no wet allocation', () => {
    expect(buildWetPlan(modelWithWet(null, null), 30)).toBeNull();
  });
});
