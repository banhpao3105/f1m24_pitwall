/**
 * Bahrain mid-weekend fixture (v0.6.1, mục 5 — cập nhật v0.6.3 theo save
 * thật): lives S 33 / M 46 / H 59 (allocation median thật) · 57 vòng ·
 * KHÔNG có practice đo được → deltas = hằng số model (M 0.55 / H 1.05).
 *
 * v0.6.3: bộ cũ gán M/H vào WeekendTyreType 3/4 — sau khi sửa mapping
 * (0=H, 1=M, 2=S, 3=I, 4=W) 2 type đó là I/W nên getCompoundCaps bỏ qua,
 * lives M/H lọt qua đường dẫn xuất durability (50/77). Giờ set mang ĐÚNG
 * type 1/0 và median thật 46/59; đồng thời H ClerkLife cũ 77 cũng là số
 * suy từ tỉ lệ — sai giống H 53 của Silverstone.
 *
 * Kết quả engine trên lives thật (v0.6.3): S→M tốt nhất 64.0s (pit 24) —
 * không phải 61.1s/pit 23 như bộ cũ (đó là số với lives sai; thứ hạng giữ
 * nguyên). Mặt bằng meta là 3 pit/driver (3 chặng hoàn thành track khác,
 * mỗi driver 3 pit) → expectedStops = 3 (meta) — plan 1 pit của S→M nằm
 * dưới mặt bằng → confidence LOW (pillar h), đúng như save thật.
 *
 * 3 chặng hoàn thành (track khác) với 3 pit/driver → stintFactor meta
 * samples 3 → expectedStops = 3 — mặt bằng 2027 của save.
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

/** Fresh allocation: lives S 33 / M 46 / H 59 on the VERIFIED types
 * (S=2, M=1, H=0 — v0.6.2 mapping). No EstimatedLapTime needed — deltas
 * stay on the model constants because Bahrain has no practice rows. */
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
  add(3, 2, 33); // S — WeekendTyreType 2
  add(3, 1, 46); // M — WeekendTyreType 1 (v0.6.3: median thật, type đúng)
  add(3, 0, 59); // H — WeekendTyreType 0 (v0.6.3: median thật, type đúng)
  return sets;
}

/** Default mirrors the real save: the 2027 field ran 3 stops/driver
 * (meta expectedStops = 3). Pass another value for synthetic variants. */
export function buildBahrainModel(stopsPerDriver = 3): SaveModel {
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
