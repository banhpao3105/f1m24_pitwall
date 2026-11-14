/**
 * Race gap rule tests — v0.5.4 step 3 (timing tower + gazette gap).
 * Bug reproduced on the real Bahrain 2027 save: lapped cars showed raw
 * time deficits (Sainz P8 +7.498s < Ricciardo P4 +63.449s — impossible).
 */

import { describe, it, expect } from 'vitest';
import { computeLapsDown, formatLapsDown } from '@/lib/race-gap';

describe('computeLapsDown', () => {
  it('one lap down → 1', () => {
    expect(computeLapsDown(56, 57)).toBe(1);
  });

  it('two laps down → 2', () => {
    expect(computeLapsDown(55, 57)).toBe(2);
  });

  it('same laps as winner → null (second gap applies unchanged)', () => {
    expect(computeLapsDown(57, 57)).toBeNull();
  });

  it('more laps than winner (data oddity) → null', () => {
    expect(computeLapsDown(58, 57)).toBeNull();
  });

  it('unknown car laps → null (gap column degrades, never invents)', () => {
    expect(computeLapsDown(undefined, 57)).toBeNull();
  });

  it('unknown winner laps → null', () => {
    expect(computeLapsDown(56, undefined)).toBeNull();
  });

  it('non-positive winner laps → null', () => {
    expect(computeLapsDown(56, 0)).toBeNull();
  });
});

describe('formatLapsDown — F1 broadcast convention (VI keeps LAP/LAPS)', () => {
  it('1 lap → "+1 LAP"', () => {
    expect(formatLapsDown(1)).toBe('+1 LAP');
  });

  it('2 laps → "+2 LAPS"', () => {
    expect(formatLapsDown(2)).toBe('+2 LAPS');
  });
});
