/**
 * v0.8.0 car-strength fixtures — built from the owner-verified DoD table
 * (prompt v0.8.0, post-Monza save Day 46636, 13/21 races, race 202 Monza).
 *
 * The post-Monza .sav itself is NOT in this sandbox (same situation as the
 * v0.7.1/v0.7.2 Monza numbers), so the DoD table is locked here as a
 * fixture: every row carries the verified player value, best team + value,
 * grid mean, both percentages and the Williams value.
 *
 * Fixture construction (clearly labelled SYNTHETIC distribution):
 *   - 11 F1 teams (1 Ferrari … 10 Aston Martin, 32 CustomTeam); Prema 11 is
 *     F2 and never appears.
 *   - Per (part, stat) row: the best team holds the DoD best value, Williams
 *     holds the DoD rival value, the player holds the DoD player value, and
 *     the remaining 8 teams share the residual (11·mean − best − williams −
 *     player)/8 — which reproduces the DoD mean EXACTLY while keeping every
 *     fill value below the best (asserted at build time).
 *   - The three REAL fallback cases of the DoD save are baked in: Red Bull
 *     FrontWing/RearWing and Williams SidePods have NULL loadout DesignIDs
 *     and resolve to their latest completed designs 763/840/843.
 *   - Percentage drift note: DoD percentages were computed from RAW values;
 *     this fixture feeds 1-decimal values, so pct can drift by ≤ 0.1 on a
 *     couple of rows (documented in the engine test assertions).
 */

import { emptyPhase2Sections } from './model';
import type { SaveModel, PartDesign, CarLoadoutRow, Team } from '@/domain/types';

export const PLAYER_TEAM = 32;

/** TeamID → the name the save carries (verified on the real save). */
export const F1_TEAM_NAMES: Record<number, string> = {
  1: 'Ferrari',
  2: 'McLaren',
  3: 'Red Bull Racing',
  4: 'Mercedes AMG Petronas F1',
  5: 'Alpine',
  6: 'Williams Racing',
  7: 'Haas F1',
  8: 'AlphaTauri',
  9: 'Alfa Romeo Racing',
  10: 'Aston Martin',
  32: 'CustomTeam',
};

/** One DoD table row (all numbers as printed in the prompt — 1 decimal). */
export interface DodRow {
  part: string;
  stat: string;
  player: number;
  bestTeam: number;
  best: number;
  mean: number;
  pctBest: number;
  pctMean: number;
  rival: number;
}

/** The 22 verified rows, in the prompt's order. */
export const DOD_TABLE: DodRow[] = [
  { part: 'Body', stat: 'DRSDelta', player: 676.2, bestTeam: 1, best: 739.3, mean: 705.1, pctBest: 91.5, pctMean: 95.9, rival: 656.4 },
  { part: 'Body', stat: 'DragReduction', player: 690.0, bestTeam: 1, best: 829.1, mean: 774.1, pctBest: 83.2, pctMean: 89.1, rival: 759.4 },
  { part: 'Body', stat: 'AirFlowMiddle', player: 636.4, bestTeam: 4, best: 803.5, mean: 730.9, pctBest: 79.2, pctMean: 87.1, rival: 751.2 },
  { part: 'FrontWing', stat: 'AirFlowFront', player: 808.9, bestTeam: 4, best: 838.9, mean: 788.2, pctBest: 96.4, pctMean: 102.6, rival: 790.8 },
  { part: 'FrontWing', stat: 'AirFlowTolerance', player: 441.9, bestTeam: 8, best: 758.2, mean: 679.3, pctBest: 58.3, pctMean: 65.1, rival: 725.0 },
  { part: 'FrontWing', stat: 'LowSpeedDownforce', player: 754.5, bestTeam: 1, best: 815.0, mean: 736.8, pctBest: 92.6, pctMean: 102.4, rival: 712.7 },
  { part: 'FrontWing', stat: 'MedSpeedDownforce', player: 340.2, bestTeam: 4, best: 792.7, mean: 649.6, pctBest: 42.9, pctMean: 52.4, rival: 628.8 },
  { part: 'FrontWing', stat: 'HighSpeedDownforce', player: 317.7, bestTeam: 4, best: 759.8, mean: 644.7, pctBest: 41.8, pctMean: 49.3, rival: 652.2 },
  { part: 'RearWing', stat: 'AirFlowTolerance', player: 372.2, bestTeam: 8, best: 741.3, mean: 650.1, pctBest: 50.2, pctMean: 57.3, rival: 671.6 },
  { part: 'RearWing', stat: 'DRSDelta', player: 782.4, bestTeam: 3, best: 815.0, mean: 769.3, pctBest: 96.0, pctMean: 101.7, rival: 732.3 },
  { part: 'RearWing', stat: 'DragReduction', player: 775.5, bestTeam: 8, best: 804.1, mean: 756.7, pctBest: 96.4, pctMean: 102.5, rival: 712.7 },
  { part: 'RearWing', stat: 'LowSpeedDownforce', player: 222.0, bestTeam: 4, best: 686.2, mean: 602.4, pctBest: 32.4, pctMean: 36.9, rival: 672.7 },
  { part: 'RearWing', stat: 'MedSpeedDownforce', player: 678.4, bestTeam: 2, best: 795.6, mean: 718.4, pctBest: 85.3, pctMean: 94.4, rival: 717.4 },
  { part: 'RearWing', stat: 'HighSpeedDownforce', player: 298.1, bestTeam: 4, best: 741.3, mean: 658.5, pctBest: 40.2, pctMean: 45.3, rival: 698.3 },
  { part: 'SidePods', stat: 'AirFlowFront', player: 308.3, bestTeam: 5, best: 766.1, mean: 685.9, pctBest: 40.2, pctMean: 44.9, rival: 682.9 },
  { part: 'SidePods', stat: 'DragReduction', player: 419.9, bestTeam: 3, best: 802.9, mean: 721.2, pctBest: 52.3, pctMean: 58.2, rival: 767.0 },
  { part: 'SidePods', stat: 'AirFlowMiddle', player: 697.2, bestTeam: 2, best: 805.3, mean: 728.0, pctBest: 86.6, pctMean: 95.8, rival: 703.0 },
  { part: 'Floor', stat: 'AirFlowTolerance', player: 454.9, bestTeam: 8, best: 767.3, mean: 685.3, pctBest: 59.3, pctMean: 66.4, rival: 680.0 },
  { part: 'Floor', stat: 'DragReduction', player: 537.3, bestTeam: 9, best: 776.6, mean: 712.9, pctBest: 69.2, pctMean: 75.4, rival: 733.7 },
  { part: 'Floor', stat: 'LowSpeedDownforce', player: 674.1, bestTeam: 4, best: 748.7, mean: 690.1, pctBest: 90.0, pctMean: 97.7, rival: 710.8 },
  { part: 'Floor', stat: 'MedSpeedDownforce', player: 688.5, bestTeam: 3, best: 757.1, mean: 706.6, pctBest: 90.9, pctMean: 97.4, rival: 690.8 },
  { part: 'Floor', stat: 'HighSpeedDownforce', player: 690.8, bestTeam: 5, best: 770.8, mean: 729.0, pctBest: 89.6, pctMean: 94.8, rival: 683.3 },
];

/** The REAL player L1 design ids on the DoD save (prompt §Bước 1 test (a)). */
export const PLAYER_DESIGN_IDS: Record<string, number> = {
  Body: 724,
  FrontWing: 722,
  RearWing: 723,
  SidePods: 650,
  Floor: 692,
};

/** The three REAL fallback cases of the DoD save (prompt §Bước 1). */
export const FALLBACK_CASES = [
  { teamId: 3, part: 'FrontWing', designId: 763, day: 46492 },
  { teamId: 3, part: 'RearWing', designId: 840, day: 46546 },
  { teamId: 6, part: 'SidePods', designId: 843, day: 46547 },
] as const;

const F1_IDS = [...Object.keys(F1_TEAM_NAMES).map(Number)];

/**
 * Per (team, part) value map — the synthetic distribution described in the
 * header. Player/best/rival carry their DoD values; the other 8 teams share
 * the residual so the mean reproduces EXACTLY.
 */
function teamValuesByPart(): Map<string, Map<number, Map<string, number>>> {
  const byPart = new Map<string, Map<number, Map<string, number>>>();
  for (const row of DOD_TABLE) {
    const perTeam = byPart.get(row.part) ?? new Map<number, Map<string, number>>();
    const get = (teamId: number) => {
      const m = perTeam.get(teamId) ?? new Map<string, number>();
      perTeam.set(teamId, m);
      return m;
    };
    get(row.bestTeam).set(row.stat, row.best);
    get(PLAYER_TEAM).set(row.stat, row.player);
    get(6).set(row.stat, row.rival);
    const others = F1_IDS.filter((id) => id !== row.bestTeam && id !== PLAYER_TEAM && id !== 6);
    const residual = row.mean * 11 - row.best - row.rival - row.player;
    const fill = residual / others.length;
    if (fill >= row.best) {
      throw new Error(
        `fixture construction broken for ${row.part}/${row.stat}: fill ${fill} >= best ${row.best}`,
      );
    }
    for (const id of others) get(id).set(row.stat, fill);
    byPart.set(row.part, perTeam);
  }
  return byPart;
}

/** Synthetic design id for a non-player, non-fallback team-part. */
function syntheticDesignId(teamId: number, part: string): number {
  const partIdx = ['Body', 'FrontWing', 'RearWing', 'SidePods', 'Floor'].indexOf(part);
  return 900 + teamId * 10 + partIdx;
}

function fallbackDesignId(teamId: number, part: string): number | undefined {
  return FALLBACK_CASES.find((f) => f.teamId === teamId && f.part === part)?.designId;
}

function isFallbackNull(teamId: number, part: string): boolean {
  return FALLBACK_CASES.some((f) => f.teamId === teamId && f.part === part);
}

export interface FixtureOptions {
  /** Drop the player's SidePods entirely (loadout + designs) → 'unknown'. */
  playerSidePodsUnknown?: boolean;
}

/** The DoD-faithful SaveModel (parts section only — the engine reads parts,
 * teams, player; everything else is the standard empty baseline). */
export function buildCarStrengthFixture(options: FixtureOptions = {}): SaveModel {
  const byPart = teamValuesByPart();
  const designs: PartDesign[] = [];
  const loadouts: CarLoadoutRow[] = [];

  for (const [part, perTeam] of byPart) {
    for (const teamId of F1_IDS) {
      if (options.playerSidePodsUnknown && teamId === PLAYER_TEAM && part === 'SidePods') {
        continue; // no loadout row, no design → 'unknown'
      }
      const stats = [...perTeam.get(teamId)!.entries()].map(([name, value]) => ({ name, value }));
      const fallback = isFallbackNull(teamId, part);
      const designId = teamId === PLAYER_TEAM
        ? PLAYER_DESIGN_IDS[part]
        : (fallbackDesignId(teamId, part) ?? syntheticDesignId(teamId, part));
      const fb = FALLBACK_CASES.find((f) => f.teamId === teamId && f.part === part);
      designs.push({
        designId,
        teamId,
        partType: part,
        dayCompleted: fb?.day ?? 46_000, // "completed" — the fallback filter needs > 0
        stats,
      });
      loadouts.push({
        teamId,
        loadoutId: 1,
        partType: part,
        ...(fallback ? {} : { designId }), // NULL DesignID on the fallback rows
      });
    }
  }
  /* the player's L2 mirrors L1 on the DoD save (verified: 0 differences) —
   * the engine must read L1 and ignore L2 for resolution */
  for (const l of [...loadouts]) {
    if (l.teamId === PLAYER_TEAM) loadouts.push({ ...l, loadoutId: 2 });
  }

  const teams: Team[] = F1_IDS.map((teamId) => ({
    teamId,
    teamName: F1_TEAM_NAMES[teamId],
    isCustomTeam: teamId === PLAYER_TEAM,
    formula: 1,
  }));

  return {
    meta: {
      id: 'car-strength-fixture',
      fileName: 'autosave.sav',
      fileSizeBytes: 1,
      gameVersion: 'F1M24' as const,
      saveGameVersion: 11,
      parsedAt: '2027-01-01T00:00:00Z',
      seasonId: 3,
      day: 46636, // the DoD save day
      playerTeamId: PLAYER_TEAM,
      tablesPresent: [],
      tablesMissing: [],
      warnings: [],
    },
    player: { teamId: PLAYER_TEAM, teamName: 'CustomTeam', customTeamEnabled: true },
    teams,
    drivers: [],
    staff: [],
    seasons: [{ seasonId: 3 }],
    standings: {
      drivers: [],
      teams: [
        /* DoD-verified: Williams 95 (P7) directly above CustomTeam 92 (P8).
         * The other nine teams are synthetic-but-consistent fillers so the
         * head-to-head gap line works for EVERY rival choice. */
        { position: 1, id: 3, name: 'Red Bull Racing', points: 180 },
        { position: 2, id: 2, name: 'McLaren', points: 150 },
        { position: 3, id: 4, name: 'Mercedes AMG Petronas F1', points: 140 },
        { position: 4, id: 1, name: 'Ferrari', points: 120 },
        { position: 5, id: 5, name: 'Alpine', points: 110 },
        { position: 6, id: 10, name: 'Aston Martin', points: 100 },
        { position: 7, id: 6, name: 'Williams Racing', points: 95 },
        { position: 8, id: PLAYER_TEAM, name: 'CustomTeam', points: 92 },
        { position: 9, id: 7, name: 'Haas F1', points: 60 },
        { position: 10, id: 8, name: 'AlphaTauri', points: 45 },
        { position: 11, id: 9, name: 'Alfa Romeo Racing', points: 30 },
      ],
    },
    tyres: [],
    races: [],
    gridPenalties: {
      rows: [],
      reasonPlaces: {},
      carTeams: [],
      carTeamsVerified: false,
    },
    ...emptyPhase2Sections(),
    parts: {
      designs,
      items: [],
      loadouts,
      expertise: [],
      tablesPresent: { designs: true, items: false, statValues: true, loadouts: true, expertise: false },
    },
    availability: [],
  } as SaveModel;
}
