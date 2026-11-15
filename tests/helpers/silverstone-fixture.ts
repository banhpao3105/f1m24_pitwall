/**
 * Silverstone 2027 pre-race fixture (v0.6.1, chủ dự án cung cấp — mục 5):
 *   Race 199 · 52 vòng · Day 46579 · save pre-race.
 *
 * Practice (1 session, F1, Races_PracticeResults RaceID 199): mỗi tay đua
 * CHỈ có 1 dòng best-lap trên ĐÚNG 1 hợp chất (22 tay đua: S 8, M 7, H 7) —
 * không tính được same-driver gaps. Best lap từng hợp chất:
 *   S 90.759s (Piastri) · M 91.470s (+0.711) · H 91.365s (+0.606 thô —
 *   vòng H nhanh nhất là của Russell chạy long-run, không so được với M).
 *
 * Allocation fresh sets (giống nhau mọi xe, 440 dòng thật rút gọn):
 *   EstimatedLapLifeRemaining S 23 / M 34 / H 43 (v0.6.3: median thật của
 *   save — bộ cũ 23/35/53 suy M từ durability ratio và H từ tỉ lệ là SAI,
 *   vách mòn H35 bị tính 446s thay vì ~70s); I 48 / W 62;
 *   EstimatedLapTime          S 88.91 / M 89.48 / H 89.80 (+0.57 / +0.89);
 *   I 95.32 / W 105.35 (wet trên đường khô — đúng mức chậm hơn S).
 * Mapping WeekendTyreType (v0.6.2, kiểm chứng từ bảng trên): 0=H, 1=M,
 * 2=S, 3=I, 4=W — comment cũ "0=W, 1=I, 2=S, 3=M, 4=H" SAI và là gốc của
 * bug delta H +16.45s ở v0.6.1.
 *
 * 3 chặng hoàn thành (track khác) với 2 pit/driver → stintFactor meta
 * samples 3 → expectedStops = 2 (meta) — giống save thật.
 *
 * V0.5.6 trên save thật: deltas S 0 / M 0.71 / H 0.86 (ép), paceSource M/H
 * "practice", confidence HIGH, xếp hạng S→H 69.2s = H→S 69.2s tốt nhất.
 */

import type {
  SaveModel,
  Race,
  PracticeResult,
  TyreAllocation,
} from '@/domain/types';
import { emptyPhase2Sections } from './model';

export const SILVERSTONE_RACE_ID = 199;
export const SILVERSTONE_TRACK_ID = 210;
export const SILVERSTONE_LAPS = 52;

/** One practice row = one driver's single best lap on one compound. */
function prow(
  driverId: number,
  session: number,
  bestLapS: number,
  bestLapTyre: number,
): PracticeResult {
  return {
    driverId,
    teamId: (driverId % 2) + 1,
    session,
    bestLapMs: Math.round(bestLapS * 1000),
    bestLapTyre,
  };
}

/**
 * 22 rows, 1 session — S 8 drivers (fastest 90.759), M 7 (91.470),
 * H 7 (91.365). Each driver appears exactly once (one compound only).
 */
export function silverstonePracticeRows(): PracticeResult[] {
  const rows: PracticeResult[] = [];
  let d = 0;
  // S — 8 drivers, fastest 90.759 (Piastri)
  for (let i = 0; i < 8; i++) rows.push(prow(++d, 1, 90.759 + i * 0.08, 2));
  // M — 7 drivers, fastest 91.470 (+0.711 vs S)
  for (let i = 0; i < 7; i++) rows.push(prow(++d, 1, 91.47 + i * 0.09, 1));
  // H — 7 drivers, fastest 91.365 (+0.606 raw vs S — Russell long-run)
  for (let i = 0; i < 7; i++) rows.push(prow(++d, 1, 91.365 + i * 0.07, 0));
  return rows;
}

/**
 * Fresh allocation — full 5-type table of the real save (types mirrored
 * from the v0.6.2 mapping audit): S type 2, M type 1, H type 0, Inter
 * type 3, Wet type 4. Inter/Wet EstimatedLapTime (95.32/105.35) is the
 * regression trap: with the old wrong mapping (3=M/4=H) the M/H medians
 * jump to 95.32/105.35 and getAllocationPace cannot return +0.57/+0.89.
 * `withLapTime=false` strips EstimatedLapTime to exercise the 'clamped'
 * path (no allocation estimate available).
 */
export function silverstoneAllocation(withLapTime = true): TyreAllocation[] {
  const sets: TyreAllocation[] = [];
  let id = 0;
  const add = (n: number, type: number, life: number, lapTimeS?: number) => {
    for (let i = 0; i < n; i++) {
      sets.push({
        carId: (i % 2) + 1,
        tyreSetId: ++id,
        weekendTyreType: type,
        frontLeftWear: 1,
        availabilityState: 0,
        estimatedLapLifeRemaining: life,
        ...(withLapTime && lapTimeS != null ? { estimatedLapTimeS: lapTimeS } : {}),
      });
    }
  };
  add(3, 2, 23, 88.91); // S — WeekendTyreType 2
  add(3, 1, 34, 89.48); // M — WeekendTyreType 1 (v0.6.3: median thật 34, không phải 35)
  add(3, 0, 43, 89.8); // H — WeekendTyreType 0 (v0.6.3: median thật 43, không phải 53 suy từ tỉ lệ)
  add(3, 3, 48, 95.32); // Inter — WeekendTyreType 3
  add(3, 4, 62, 105.35); // Wet — WeekendTyreType 4
  return sets;
}

/** Completed races elsewhere, 2 stops/driver each → meta stintFactor 1/3. */
function metaHistoryRaces(): Race[] {
  return [1, 2, 3].map((i) => ({
    raceId: 190 + i,
    seasonId: 3,
    trackId: 100 + i,
    trackName: `History ${i}`,
    day: 46100 + i * 10,
    state: 2,
    isSprint: false,
    laps: 50,
    results: Array.from({ length: 6 }, (_, k) => ({
      driverId: k + 1,
      driverName: `Driver ${k + 1}`,
      teamId: (k % 2) + 1,
      teamName: k % 2 === 0 ? 'Test Racing' : 'Rival Racing',
      finishingPos: k + 1,
      points: 0,
      dnf: false,
    })),
    pitStops: Array.from({ length: 12 }, (_, k) => ({
      driverId: (k % 6) + 1,
      teamId: 1,
      lap: 14 + (k % 8),
      durationMs: 23000,
      pitStopId: 900 + i * 100 + k,
    })),
  }));
}

export interface SilverstoneOptions {
  /** Strip EstimatedLapTime → exercises the 'clamped' (no-allocation) path. */
  withoutEstimatedLapTime?: boolean;
}

/**
 * Full Silverstone pre-race SaveModel: target race 199 (state 0, active),
 * 1 practice session, allocation fresh sets, 3 meta history races.
 */
export function buildSilverstoneModel(
  options: SilverstoneOptions = {},
): SaveModel {
  const target: Race = {
    raceId: SILVERSTONE_RACE_ID,
    seasonId: 3,
    trackId: SILVERSTONE_TRACK_ID,
    trackName: 'Silverstone',
    day: 46579,
    state: 0,
    isSprint: false,
    laps: SILVERSTONE_LAPS,
    results: [],
    practice: silverstonePracticeRows(),
  };
  return {
    meta: {
      id: 'silverstone-fixture',
      fileName: 'silverstone-prerace.sav',
      fileSizeBytes: 1,
      gameVersion: 'F1M24',
      saveGameVersion: 3,
      parsedAt: '2027-01-01T00:00:00Z',
      seasonId: 3,
      day: 46579,
      playerTeamId: 1,
      tablesPresent: [],
      tablesMissing: [],
      warnings: [],
    },
    player: { teamId: 1, teamName: 'Test Racing', customTeamEnabled: false },
    teams: [],
    drivers: [],
    staff: [],
    seasons: [{ seasonId: 3 }],
    races: [...metaHistoryRaces(), target],
    standings: { drivers: [], teams: [] },
    tyres: silverstoneAllocation(!options.withoutEstimatedLapTime),
    ...emptyPhase2Sections(),
    /* the game's own strategist plan (mục 5): S→M→S, stint 15/20/17,
       pit 16/36 — reads back as stintLaps [15, 20, 17] on 52 laps */
    playerStrategy: {
      tablePresent: true,
      plans: [
        {
          loadoutId: 0,
          strategyId: 1,
          selected: true,
          stints: [
            { stintIndex: 0, compound: 'S', pitWindowStart: null, pitWindowEnd: null, expectedPitLap: null, optimalPitLap: null },
            { stintIndex: 1, compound: 'M', pitWindowStart: 14, pitWindowEnd: 18, expectedPitLap: 16, optimalPitLap: 16 },
            { stintIndex: 2, compound: 'S', pitWindowStart: 34, pitWindowEnd: 38, expectedPitLap: 36, optimalPitLap: 36 },
          ],
        },
        {
          loadoutId: 1,
          strategyId: 1,
          selected: true,
          stints: [
            { stintIndex: 0, compound: 'S', pitWindowStart: null, pitWindowEnd: null, expectedPitLap: null, optimalPitLap: null },
            { stintIndex: 1, compound: 'M', pitWindowStart: 14, pitWindowEnd: 18, expectedPitLap: 16, optimalPitLap: 16 },
            { stintIndex: 2, compound: 'S', pitWindowStart: 34, pitWindowEnd: 38, expectedPitLap: 36, optimalPitLap: 36 },
          ],
        },
      ],
    },
    availability: [],
  };
}
