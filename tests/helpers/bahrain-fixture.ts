/**
 * Bahrain mid-weekend fixture (v0.6.1, mục 5 — backtest đã verify ở v0.5.1):
 *   lives S 33 / M 50 / H 77 (allocation) · 57 vòng · KHÔNG có practice
 *   đo được → deltas = hằng số model (M 0.55 / H 1.05).
 *
 * Khôi phục từ số liệu đã verify: S→M 61.1s (pit 23) = 34×0.55 +
 * degS(23,33) + degM(34,50) + 20.7; S→H 71.6s = 34×1.05 + degS(23,33) +
 * degH(34,77) + 20.7 — khớp đúng 2 con số của chủ dự án với pit lap 23.
 *
 * 3 chặng hoàn thành (track khác) với 1 pit/driver → stintFactor meta
 * samples 3 → expectedStops = 1 — mặt bằng 2027 của save (plan 1 pit của
 * game khớp mặt bằng này).
 */

import type { SaveModel, Race } from '@/domain/types';
import { emptyPhase2Sections } from './model';

export const BAHRAIN_RACE_ID = 5;
export const BAHRAIN_TRACK_ID = 30;
export const BAHRAIN_LAPS = 57;

function historyRaces(stopsPerDriver: number): Race[] {
  return [1, 2, 3].map((i) => ({
    raceId: i,
    seasonId: 3,
    trackId: 40 + i,
    trackName: `History ${i}`,
    day: 46100 + i * 10,
    state: 2,
    isSprint: false,
    laps: 52,
    results: Array.from({ length: 6 }, (_, k) => ({
      driverId: k + 1,
      driverName: `Driver ${k + 1}`,
      teamId: (k % 2) + 1,
      teamName: k % 2 === 0 ? 'Test Racing' : 'Rival Racing',
      finishingPos: k + 1,
      points: 0,
      dnf: false,
    })),
    pitStops: Array.from({ length: 6 * stopsPerDriver }, (_, k) => ({
      driverId: (k % 6) + 1,
      teamId: 1,
      lap: 14 + (k % 8),
      durationMs: 23000,
      pitStopId: 100 + i * 100 + k,
    })),
  }));
}

/** Fresh allocation: lives S 33 / M 50 / H 77 (no EstimatedLapTime needed —
 * deltas stay on the model constants because Bahrain has no practice rows). */
export function bahrainAllocation(): SaveModel['tyres'] {
  const sets: SaveModel['tyres'] = [];
  let id = 0;
  const add = (n: number, type: number, life: number) => {
    for (let i = 0; i < n; i++) {
      sets.push({
        carId: (i % 2) + 1,
        tyreSetId: ++id,
        weekendTyreType: type,
        frontLeftWear: 1,
        availabilityState: 0,
        estimatedLapLifeRemaining: life,
      });
    }
  };
  add(3, 2, 33); // S
  add(3, 3, 50); // M
  add(3, 4, 77); // H
  return sets;
}

export function buildBahrainModel(stopsPerDriver = 1): SaveModel {
  const target: Race = {
    raceId: BAHRAIN_RACE_ID,
    seasonId: 3,
    trackId: BAHRAIN_TRACK_ID,
    trackName: 'Bahrain',
    day: 46495,
    state: 0,
    isSprint: false,
    laps: BAHRAIN_LAPS,
    results: [],
  };
  return {
    meta: {
      id: 'bahrain-fixture',
      fileName: 'bahrain-midweekend.sav',
      fileSizeBytes: 1,
      gameVersion: 'F1M24',
      saveGameVersion: 3,
      parsedAt: '2027-01-01T00:00:00Z',
      seasonId: 3,
      day: 46495,
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
    races: [...historyRaces(stopsPerDriver), target],
    standings: { drivers: [], teams: [] },
    tyres: bahrainAllocation(),
    ...emptyPhase2Sections(),
    availability: [],
  };
}
