/**
 * Shared SaveModel test fixture — Phase 2.
 * `emptyPhase2Sections()` gives the v1 adaptive sections in their "no data"
 * state so engine tests start from a deterministic degradation baseline.
 */

import { vi } from 'vitest';
import type { SaveModel } from '@/domain/types';

/**
 * v0.8.1 — shared minimal SaveModel factory for lib/component tests.
 * Deterministic, no optional sections; `id` doubles as the file name.
 */
export function makeTestModel(
  id: string,
  opts: { day?: number; fileName?: string; fileSizeBytes?: number } = {},
): SaveModel {
  return {
    meta: {
      id,
      fileName: opts.fileName ?? `${id}.sav`,
      fileSizeBytes: opts.fileSizeBytes ?? 128,
      gameVersion: 'F1M24',
      saveGameVersion: 3,
      parsedAt: '2026-01-01T00:00:00Z',
      seasonId: 2024,
      day: opts.day ?? 200,
      playerTeamId: 1,
      tablesPresent: [],
      tablesMissing: [],
      warnings: [],
    },
    player: { teamId: 1, teamName: 'P', customTeamEnabled: false },
    teams: [],
    drivers: [],
    staff: [],
    seasons: [{ seasonId: 2024 }],
    races: [],
    standings: { drivers: [], teams: [] },
    tyres: [],
    ...emptyPhase2Sections(),
    availability: [],
  };
}

/** v0.8.1 — fake FileSystemFileHandle for unit tests (plain object). */
export function makeFakeHandle(
  name: string,
  opts: {
    file?: File;
    getFile?: () => Promise<File>;
    queryPermission?: () => Promise<PermissionState>;
    requestPermission?: () => Promise<PermissionState>;
  } = {},
): FileSystemFileHandle {
  return {
    kind: 'file',
    name,
    // vi.fn-wrapped so tests can assert call/no-call on every method.
    getFile: vi.fn(
      opts.getFile ??
        (async () =>
          opts.file ??
          new File([new Uint8Array([1, 2, 3])], name, { lastModified: 1000 })),
    ),
    queryPermission: vi.fn(
      opts.queryPermission ?? (async () => 'granted' as PermissionState),
    ),
    requestPermission: vi.fn(
      opts.requestPermission ?? (async () => 'granted' as PermissionState),
    ),
  } as unknown as FileSystemFileHandle;
}

/** Installs the globals `isFsAccessSupported()` looks for (jsdom tests). */
export function stubFsAccessGlobals(support = true): void {
  class FakeFsFileHandle {
    // Prototype METHOD (not a class field) — the support check reads
    // FileSystemFileHandle.prototype.queryPermission, mirroring Chromium.
    queryPermission(): Promise<PermissionState> {
      return Promise.resolve('granted');
    }
  }
  const g = globalThis as unknown as {
    FileSystemFileHandle?: unknown;
    window?: unknown;
  };
  if (support) {
    g.FileSystemFileHandle = FakeFsFileHandle;
    Object.defineProperty(window, 'showOpenFilePicker', {
      value: () => Promise.resolve([]),
      configurable: true,
      writable: true,
    });
  } else {
    delete g.FileSystemFileHandle;
    Object.defineProperty(window, 'showOpenFilePicker', {
      value: undefined,
      configurable: true,
      writable: true,
    });
  }
}

export function unstubFsAccessGlobals(): void {
  const g = globalThis as unknown as { FileSystemFileHandle?: unknown };
  delete g.FileSystemFileHandle;
  Object.defineProperty(window, 'showOpenFilePicker', {
    value: undefined,
    configurable: true,
    writable: true,
  });
}

export function emptyPhase2Sections(): Pick<
  SaveModel,
  'parts' | 'finance' | 'personnel' | 'regulations' | 'playerStrategy'
> {
  return {
    parts: {
      designs: [],
      items: [],
      loadouts: [],
      expertise: [],
      tablesPresent: {
        designs: false,
        items: false,
        statValues: false,
        loadouts: false,
        expertise: false,
      },
    },
    finance: {
      transactions: [],
      tablesPresent: { balance: false, transactions: false },
    },
    personnel: {
      contracts: [],
      performance: [],
      patience: [],
      tablesPresent: { contracts: false, performance: false, patience: false },
    },
    playerStrategy: { tablePresent: false, plans: [] },
    regulations: [],
  };
}
