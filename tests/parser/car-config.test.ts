/**
 * Save_CarConfig verification (v0.7.1 bước 1) — locked to the REAL Monza
 * pre-race save shape (save4.db, Day 46635, verified during diagnosis):
 *
 *   22 rows, (LoadoutID, TeamID) pairs = {(0,t),(1,t) : t ∈ 1..11} —
 *   LoadoutID is the seat WITHIN the team (0/1), TeamID is the sequential
 *   F1 team index 1..11 (team 11 = CustomTeam, TeamID 32 → CarID 20/21).
 *
 * The v0.7.0 check (`teamIndex === floor(loadoutId / 2) + 1`) evaluated to
 * 1 for EVERY real row and failed on the second row of any save — the cap
 * silently never applied. These tests lock the corrected set-based check:
 * the exact real pairs pass, any missing/duplicate/foreign pair fails.
 */

import { describe, it, expect } from 'vitest';
import { carConfigPairsVerified, type RawCarConfigRow } from '@/parser/repositories/car-config.repo';

/** The exact 22 rows of the real Monza pre-race save (ORDER BY LoadoutID). */
const MONZA_CAR_CONFIG: [number, number][] = [
  [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [0, 7], [0, 8], [0, 9], [0, 10], [0, 11],
  [1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6], [1, 7], [1, 8], [1, 9], [1, 10], [1, 11],
];

const rows = (pairs: [number, number][]): RawCarConfigRow[] =>
  pairs.map(([loadoutId, teamIndex]) => ({ loadoutId, teamIndex }));

describe('carConfigPairsVerified — the real Monza Save_CarConfig shape', () => {
  it('accepts the exact 22 real rows: LoadoutID {0,1} × TeamID {1..11}', () => {
    expect(MONZA_CAR_CONFIG).toHaveLength(22);
    expect(carConfigPairsVerified(rows(MONZA_CAR_CONFIG))).toBe(true);
  });

  it('accepts the rows in any order (set semantics, not sequence)', () => {
    const shuffled = [...MONZA_CAR_CONFIG].reverse();
    expect(carConfigPairsVerified(rows(shuffled))).toBe(true);
  });

  it('rejects a table missing one pair (21 rows — the negative DoD fixture)', () => {
    const dropOne = [...MONZA_CAR_CONFIG];
    dropOne.splice(3, 1); // remove a single (0,4) pair → 21 rows
    expect(dropOne).toHaveLength(21);
    expect(carConfigPairsVerified(rows(dropOne))).toBe(false);
  });

  it('rejects a duplicated pair even at 22 rows', () => {
    const dup = [...MONZA_CAR_CONFIG];
    dup[5] = dup[0]; // (0,1) twice → (0,6) missing
    expect(carConfigPairsVerified(rows(dup))).toBe(false);
  });

  it('rejects the WRONG v0.7.0 shape: LoadoutID 0..21 global (the old misread)', () => {
    // What the v0.7.0 comment claimed the table looked like: one row per
    // CarID 0..21. No real save has ever carried this shape.
    const oldMisread: [number, number][] = Array.from({ length: 22 }, (_, i) => [
      i,
      Math.floor(i / 2) + 1,
    ]);
    expect(carConfigPairsVerified(rows(oldMisread))).toBe(false);
  });

  it('rejects empty / truncated tables', () => {
    expect(carConfigPairsVerified([])).toBe(false);
    expect(carConfigPairsVerified(rows([[0, 1], [1, 1]]))).toBe(false);
  });
});
