/**
 * Car engine unit tests — Phase 2. Covers design-points league, pace
 * fallback league, durability risk bands, dev queue points-per-budget,
 * and the LOW degradation path when Parts data is absent.
 */

import { describe, it, expect } from 'vitest';
import {
  buildCarLab,
  DURABILITY_RISK_HIGH_BELOW,
  DURABILITY_RISK_WATCH_BELOW,
} from '@/engines/car.engine';
import type { SaveModel, Race } from '@/domain/types';
import { emptyPhase2Sections } from '../helpers/model';

function makeModel(overrides: Partial<SaveModel> = {}): SaveModel {
  return {
    meta: {
      id: 'test', fileName: 'test.sav', fileSizeBytes: 1,
      gameVersion: 'F1M24', saveGameVersion: 3, parsedAt: '2026-01-01T00:00:00Z',
      seasonId: 2024, day: 100, playerTeamId: 1,
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
    races: [] as Race[],
    standings: { drivers: [], teams: [] },
    tyres: [],
    ...emptyPhase2Sections(),
    availability: [],
    ...overrides,
  };
}

/** One completed race where team 1 is fastest (for pace fallback league). */
function raceWithPace(): Race {
  return {
    raceId: 10, seasonId: 2024, trackId: 1, trackName: 'T', day: 50,
    state: 2, isSprint: false, laps: 30,
    results: [
      { driverId: 1, driverName: 'A', teamId: 1, teamName: 'Player Racing', finishingPos: 1, points: 25, dnf: false, fastestLapMs: 90_000 },
      { driverId: 2, driverName: 'B', teamId: 2, teamName: 'Rival Racing', finishingPos: 2, points: 18, dnf: false, fastestLapMs: 90_500 },
    ],
  };
}

describe('buildCarLab — league', () => {
  it('0.5.3: league is always the pace board — no design-points source, no score field', () => {
    // The F1M24 schema has NO design-points column (verified 1.11.0) and
    // Parts_Designs_StatValues sums are not comparable across teams, so the
    // points concept was dropped (option b) instead of emitting score: null.
    const model = makeModel({
      parts: {
        ...emptyPhase2Sections().parts,
        designs: [
          { designId: 1, teamId: 2, partType: 'FrontWing', points: 90, stats: [] },
          { designId: 2, teamId: 1, partType: 'FrontWing', points: 120, stats: [] },
          { designId: 3, teamId: 1, partType: 'Floor', points: 30, stats: [] },
        ],
        tablesPresent: { designs: true, items: false, statValues: false, loadouts: false, expertise: false },
      },
      races: [raceWithPace()],
    });
    const lab = buildCarLab(model);
    expect(lab.data.league.source).toBe('pace');
    expect(lab.data.league.rows[0].isPlayer).toBe(true);
    for (const row of lab.data.league.rows) {
      expect('score' in row).toBe(false); // no fake-null score in the output
      expect(row.rank).toBeGreaterThan(0);
    }
    expect(lab.evidence.some((e) => e.source.includes('pace board'))).toBe(true);
  });

  it('falls back to pace league and labels the source', () => {
    const model = makeModel({ races: [raceWithPace()] });
    const lab = buildCarLab(model);
    expect(lab.data.league.source).toBe('pace');
    expect(lab.data.league.rows[0].isPlayer).toBe(true);
    expect(lab.evidence.some((e) => e.source.includes('pace board'))).toBe(true);
  });
});

describe('buildCarLab — durability', () => {
  it('classifies risks against documented thresholds', () => {
    const model = makeModel({
      parts: {
        designs: [],
        items: [
          { itemId: 1, teamId: 1, partType: 'FrontWing', condition: 0.3 },
          { itemId: 2, teamId: 1, partType: 'Floor', condition: 0.55 },
          { itemId: 3, teamId: 1, partType: 'RearWing', condition: 0.9 },
          { itemId: 4, teamId: 1, partType: 'Engine', condition: 0.2 },
        ],
        loadouts: [],
        expertise: [],
        tablesPresent: { designs: true, items: true, statValues: false, loadouts: false, expertise: false },
      },
    });
    const lab = buildCarLab(model);
    const byType = new Map(lab.data.parts.map((p) => [p.partType, p]));
    expect(byType.get('FrontWing')?.risk).toBe('HIGH');
    expect(byType.get('Floor')?.risk).toBe('WATCH');
    expect(byType.get('RearWing')?.risk).toBe('LOW');
    expect(byType.get('Engine')?.isSupplier).toBe(true);
    expect(lab.data.supplierNotePresent).toBe(true);
    expect(DURABILITY_RISK_HIGH_BELOW).toBe(0.4);
    expect(DURABILITY_RISK_WATCH_BELOW).toBe(0.7);
  });

  it('emits a HIGH-risk replacement recommendation with 6 fields', () => {
    const model = makeModel({
      parts: {
        designs: [],
        items: [{ itemId: 1, teamId: 1, partType: 'Gearbox', condition: 0.25 }],
        loadouts: [],
        expertise: [],
        tablesPresent: { designs: true, items: true, statValues: false, loadouts: false, expertise: false },
      },
    });
    const lab = buildCarLab(model);
    const rec = lab.recommendations.find((r) => r.id === 'car-durability-high');
    expect(rec).toBeDefined();
    expect(rec!.action).toContain('Gearbox');
    expect(rec!.riskIfIgnored).toBeTruthy();
    expect(rec!.evidence.length).toBeGreaterThan(0);
  });
});

describe('buildCarLab — dev queue', () => {
  it('ranks by points per million when cost maps', () => {
    const model = makeModel({
      parts: {
        ...emptyPhase2Sections().parts,
        designs: [
          { designId: 1, teamId: 1, partType: 'FrontWing', points: 100, cost: 1_000_000, stats: [] },
          { designId: 2, teamId: 1, partType: 'Floor', points: 120, cost: 2_000_000, stats: [] },
        ],
        tablesPresent: { designs: true, items: false, statValues: false, loadouts: false, expertise: false },
      },
    });
    const lab = buildCarLab(model);
    expect(lab.data.devQueue[0].designId).toBe(1); // 100 pts/1M beats 60 pts/1M
    expect(lab.data.devQueue[0].pointsPerMillion).toBe(100);
    const rec = lab.recommendations.find((r) => r.id === 'car-dev-queue');
    expect(rec?.title).toContain('FrontWing');
  });

  it('degrades to LOW with explicit recommendation when no parts data', () => {
    const lab = buildCarLab(makeModel());
    expect(lab.confidence).toBe('LOW');
    expect(lab.warnings).toContain('PARTS_DATA_UNAVAILABLE');
    const rec = lab.recommendations.find((r) => r.id === 'car-nodata');
    expect(rec?.confidence).toBe('LOW');
    expect(lab.assumptions.some((a) => a.text.includes('Parts_*'))).toBe(true);
  });

  it('0.4.1 regression: healthy mapped parts do NOT trigger degraded-mode rec', () => {
    // Real-save shape (verified 1.11.0): Parts_Items map fine, all conditions
    // healthy, and Parts_Designs has NO Points column → empty queue. The old
    // logic fired "chế độ suy giảm" here; it must now report healthy status.
    const model = makeModel({
      parts: {
        designs: [
          { designId: 1, teamId: 1, partType: 'FrontWing', stats: [] },
          { designId: 2, teamId: 1, partType: 'Floor', stats: [] },
        ],
        items: [
          { itemId: 1, designId: 1, partType: 'FrontWing', condition: 0.95 },
          { itemId: 2, designId: 2, partType: 'Floor', condition: 0.88 },
        ],
        loadouts: [],
        expertise: [],
        tablesPresent: { designs: true, items: true, statValues: false, loadouts: false, expertise: false },
      },
    });
    const lab = buildCarLab(model);
    expect(lab.data.parts.length).toBeGreaterThan(0);
    expect(lab.data.devQueue).toHaveLength(0);
    expect(lab.recommendations.find((r) => r.id === 'car-nodata')).toBeUndefined();
    const healthy = lab.recommendations.find((r) => r.id === 'car-parts-healthy');
    expect(healthy).toBeDefined();
    expect(healthy?.title).toContain('Không có part nào trong vùng rủi ro');
    expect(healthy?.why).toContain('Parts_Designs.Points');
  });
});
