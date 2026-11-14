/**
 * Results engine unit tests — v0.5.6 (docs/03 §5.2 companion board).
 *
 * Locked against the project owner's verified Miami 2027 save aggregates
 * (autosave-3.sav, 6 races done). The fixture in ../helpers/miami-fixture is a
 * synthetic row-level reproduction: every number asserted below is COMPUTED
 * by buildResultsBoard from those rows.
 *
 * Locked table (rank by points):
 *   1  Red Bull Racing     201  33.5  1.0  (n=6)   1/12   −9
 *   2  Mercedes            149  24.8  2.5  (n=6)   1/12   −9
 *   3  McLaren              99  16.5  4.5  (n=6)   1/12  +28
 *   4  Ferrari              54   9.0  7.0  (n=6)   0/12  −21
 *   5  CustomTeam (you)     51   8.5  7.0  (n=6)   1/12  +81
 *   6  Williams Racing      36   6.0  7.0  (n=6)   1/12  +14
 *   7  Alpine               11   1.8  11   (n=5)   5/12   −4
 *   8  Haas F1               4   0.7 14.0  (n=6)   1/12   +6
 *   9  AlphaTauri            1   0.2 12.0  (n=6)   2/12  +28
 *   10 Aston Martin          0   0.0 14.5  (n=6)   0/12  +34
 *   11 Alfa Romeo Racing     0   0.0 16   (n=5)   6/12   −6
 * Head-to-head vs you (W–L, your perspective):
 *   Alpine 5–1 · Williams 4–2 · Ferrari 3–3 · Haas 4–2 · AlphaTauri 4–2 ·
 *   Aston Martin 6–0 · McLaren 1–5 · Mercedes 1–5 · Red Bull 0–6 ·
 *   Alfa Romeo 6–0 (see note below)
 *
 * Alfa Romeo note: the owner's hand count said 5–0 with one race excluded
 * ("both teams without a finisher"), but the player has only 1 DNF in 12
 * starts and a finisher in all 6 races, so a both-DNF race involving the
 * player cannot exist. Under the prompt's own rule (a team with no finisher
 * loses — exactly how Miami vs Alpine counts as a win), Alfa Romeo's
 * zero-finisher race counts as a player win → 6–0. The rule as written is
 * normative; flagged to the owner in the v0.5.6 report.
 */

import { describe, it, expect } from 'vitest';
import { buildResultsBoard } from '@/engines/results.engine';
import { buildPaceBoard, buildRacePaceBoard } from '@/engines/pace.engine';
import type { SaveModel, Race } from '@/domain/types';
import { buildMiamiModel, MIAMI_SEASON_ID } from '../helpers/miami-fixture';

interface ExpectedRow {
  id: number;
  name: string;
  points: number;
  perRace: number;
  median: number;
  samples: number;
  dnf: number;
  starts: number;
  gained: number;
}

const EXPECTED_TABLE: ExpectedRow[] = [
  { id: 1, name: 'Red Bull Racing', points: 201, perRace: 33.5, median: 1, samples: 6, dnf: 1, starts: 12, gained: -9 },
  { id: 2, name: 'Mercedes', points: 149, perRace: 149 / 6, median: 2.5, samples: 6, dnf: 1, starts: 12, gained: -9 },
  { id: 3, name: 'McLaren', points: 99, perRace: 16.5, median: 4.5, samples: 6, dnf: 1, starts: 12, gained: 28 },
  { id: 4, name: 'Ferrari', points: 54, perRace: 9, median: 7, samples: 6, dnf: 0, starts: 12, gained: -21 },
  { id: 32, name: 'CustomTeam', points: 51, perRace: 8.5, median: 7, samples: 6, dnf: 1, starts: 12, gained: 81 },
  { id: 5, name: 'Williams Racing', points: 36, perRace: 6, median: 7, samples: 6, dnf: 1, starts: 12, gained: 14 },
  { id: 6, name: 'Alpine', points: 11, perRace: 11 / 6, median: 11, samples: 5, dnf: 5, starts: 12, gained: -4 },
  { id: 7, name: 'Haas F1', points: 4, perRace: 4 / 6, median: 14, samples: 6, dnf: 1, starts: 12, gained: 6 },
  { id: 8, name: 'AlphaTauri', points: 1, perRace: 1 / 6, median: 12, samples: 6, dnf: 2, starts: 12, gained: 28 },
  { id: 9, name: 'Aston Martin', points: 0, perRace: 0, median: 14.5, samples: 6, dnf: 0, starts: 12, gained: 34 },
  { id: 10, name: 'Alfa Romeo Racing', points: 0, perRace: 0, median: 16, samples: 5, dnf: 6, starts: 12, gained: -6 },
];

const EXPECTED_H2H: [number, number, number][] = [
  [6, 5, 1],   // Alpine 5–1
  [5, 4, 2],   // Williams 4–2
  [4, 3, 3],   // Ferrari 3–3
  [7, 4, 2],   // Haas 4–2
  [8, 4, 2],   // AlphaTauri 4–2
  [9, 6, 0],   // Aston Martin 6–0
  [3, 1, 5],   // McLaren 1–5
  [2, 1, 5],   // Mercedes 1–5
  [1, 0, 6],   // Red Bull 0–6
  [10, 6, 0],  // Alfa Romeo 6–0 (rule as written — see header note)
];

describe('buildResultsBoard — locked Miami 2027 aggregates (6 races)', () => {
  const model = buildMiamiModel();
  const result = buildResultsBoard(model);
  const board = result.data;

  it('ranks all 11 teams exactly like the verified table', () => {
    expect(board.racesConsidered).toBe(6);
    expect(board.rows).toHaveLength(11);
    board.rows.forEach((row, i) => {
      const e = EXPECTED_TABLE[i];
      expect(row.teamId).toBe(e.id);
      expect(row.teamName).toBe(e.name);
      expect(row.rank).toBe(i + 1);
      expect(row.points).toBe(e.points);
      expect(row.pointsPerRace).toBeCloseTo(e.perRace, 9);
      expect(row.medianBestFinish).toBe(e.median);
      expect(row.samples).toBe(e.samples);
      expect(row.dnfCount).toBe(e.dnf);
      expect(row.starts).toBe(e.starts);
      expect(row.positionsGained).toBe(e.gained);
    });
  });

  it('marks the player row and nothing else', () => {
    const player = board.rows.find((r) => r.isPlayer);
    expect(player?.teamId).toBe(32);
    expect(board.rows.filter((r) => r.isPlayer)).toHaveLength(1);
    expect(player?.headToHead).toBeNull();
    expect(board.playerTeamId).toBe(32);
    expect(board.seasonId).toBe(MIAMI_SEASON_ID);
  });

  it('locks every head-to-head record vs the player (your perspective)', () => {
    for (const [teamId, wins, losses] of EXPECTED_H2H) {
      const row = board.rows.find((r) => r.teamId === teamId)!;
      expect(row.headToHead).not.toBeNull();
      expect(row.headToHead!.wins).toBe(wins);
      expect(row.headToHead!.losses).toBe(losses);
      expect(row.headToHead!.excluded).toBe(0);
    }
  });

  it('carries confidence HIGH with full provenance', () => {
    expect(result.confidence).toBe('HIGH');
    expect(result.warnings).toHaveLength(0);
    expect(result.evidence.some((e) => e.source.startsWith('Races_Results'))).toBe(true);
    const texts = result.assumptions.map((a) => a.text);
    expect(texts).toContain(
      'Vị trí leo được thiên vị đội phân hạng tệ (đội đầu đoàn thường âm vì không còn chỗ để leo) — chỉ đọc cùng điểm số, không đọc riêng',
    );
    expect(texts).toContain(
      'Median best finish loại chặng đội không có xe về đích (xem cột mẫu); DNF hiện ở cột riêng, không bị giấu như ở bảng pace',
    );
  });

  it('recommendation compares the player against the nearest chaser', () => {
    const rec = result.recommendations[0];
    expect(rec.id).toBe(`results-rival-${MIAMI_SEASON_ID}`);
    // player P5/51 — reference is the team directly above (Ferrari P4/54)
    expect(rec.title).toContain('P5/11');
    expect(rec.title).toContain('51 điểm');
    expect(rec.title).toContain('Ferrari');
    expect(rec.why).toContain('Đối đầu với Ferrari: thắng 3–thua 3 trên 6 chặng chạm mặt (loại 0)');
    expect(rec.why).toContain('điểm 51 vs 54');
    expect(rec.why).toContain('DNF 1 vs 0');
    expect(rec.why).toContain('median best finish 7 vs 7');
    expect(rec.why).toContain('leo vị trí +81 vs -21');
    expect(rec.confidence).toBe('HIGH');
  });

  it('is deterministic', () => {
    const a = buildResultsBoard(buildMiamiModel());
    const b = buildResultsBoard(buildMiamiModel());
    expect(JSON.stringify(a.data)).toBe(JSON.stringify(b.data));
  });
});

describe('buildResultsBoard — window, confidence and degradation', () => {
  const model = buildMiamiModel();

  it('narrows the window with maxRaces and degrades confidence', () => {
    const four = buildResultsBoard(model, { maxRaces: 4 });
    expect(four.data.racesConsidered).toBe(4);
    expect(four.confidence).toBe('HIGH');

    const three = buildResultsBoard(model, { maxRaces: 3 });
    expect(three.data.racesConsidered).toBe(3);
    expect(three.confidence).toBe('MEDIUM');

    const one = buildResultsBoard(model, { maxRaces: 1 });
    expect(one.data.racesConsidered).toBe(1);
    expect(one.confidence).toBe('LOW');
    expect(one.assumptions.some((a) => a.text.includes('dễ đổi sau 1 chặng'))).toBe(true);
  });

  it('warns and degrades with no completed races', () => {
    const empty: SaveModel = {
      ...buildMiamiModel(),
      races: buildMiamiModel().races.map((r) => ({ ...r, state: 1 })),
    };
    const result = buildResultsBoard(empty);
    expect(result.warnings).toContain('NO_COMPLETED_RACES');
    expect(result.data.rows).toHaveLength(0);
    expect(result.confidence).toBe('LOW');
    expect(result.recommendations[0].id).toBe(`results-nodata-${MIAMI_SEASON_ID}`);
  });

  it('excludes DNF rows from best finish, gained and head-to-head', () => {
    // Alpine: Miami (r6 in the window) has both cars DNF → no sample from
    // that race, but the player still wins it head-to-head (5–1 includes it).
    const result = buildResultsBoard(model);
    const alpine = result.data.rows.find((r) => r.teamId === 6)!;
    expect(alpine.samples).toBe(5);
    expect(alpine.dnfCount).toBe(5);
    expect(alpine.headToHead!.wins).toBe(5);

    // Ferrari: zero DNFs, all 12 starts classified
    const ferrari = result.data.rows.find((r) => r.teamId === 4)!;
    expect(ferrari.dnfCount).toBe(0);
    expect(ferrari.starts).toBe(12);
  });

  it('ranks ties by median best finish, then positions gained', () => {
    // Aston Martin (0 pts, median 14.5) must rank ABOVE Alfa Romeo (0 pts,
    // median 16) even though Alfa gained more? No: Alfa −6 vs Aston +34 —
    // the median decides first here; assert the order explicitly.
    const rows = buildResultsBoard(model).data.rows;
    const aston = rows.findIndex((r) => r.teamId === 9);
    const alfa = rows.findIndex((r) => r.teamId === 10);
    expect(aston).toBeLessThan(alfa);
  });
});
