/**
 * v0.8.1 unit tests — parse-controller handle capture:
 *  (a) picker path (handle present) → handle record persisted, tied to the
 *      freshly parsed save id;
 *  (b) drag-drop path (no handle) → an existing handle record is NEVER
 *      overwritten or deleted (locked decision: only a selection WITH a
 *      handle may replace it);
 *  and the session still lands in the store (ready) on every path.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('idb-keyval', async () => {
  const { createIdbMemoryMock } = await import('../helpers/idb-mock');
  return createIdbMemoryMock();
});

vi.mock('@/parser/worker/parse-client', () => ({
  createParseSession: () => ({
    start: async (file: File, onProgress?: (p: { percent: number; stage: string }) => void) => {
      onProgress?.({ percent: 50, stage: 'mock' });
      return {
        model: makeModel(`sha-${file.name}-${file.size}`),
        worker: { terminate: () => {} },
      };
    },
    cancel: () => {},
  }),
}));

vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

import * as idb from 'idb-keyval';
import { startParseFlow } from '@/lib/parse-controller';
import {
  putSave,
  getSave,
  getLastActiveHandle,
  getLastActiveSaveId,
} from '@/lib/save-db';
import { useSaveStore } from '@/store/save.store';
import type { SaveModel } from '@/domain/types';
import { emptyPhase2Sections } from '../helpers/model';

const mem = (idb as unknown as { __mem: Map<string, unknown> }).__mem;

function makeModel(id: string): SaveModel {
  return {
    meta: {
      id,
      fileName: `${id}.sav`,
      fileSizeBytes: 128,
      gameVersion: 'F1M24',
      saveGameVersion: 3,
      parsedAt: '2026-01-01T00:00:00Z',
      seasonId: 2024,
      day: 200,
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

function fakeHandle(name: string): FileSystemFileHandle {
  return {
    kind: 'file',
    name,
    getFile: async () => new File([new Uint8Array([1])], name),
    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted',
  } as unknown as FileSystemFileHandle;
}

describe('parse-controller — handle capture (v0.8.1)', () => {
  beforeEach(() => {
    mem.clear();
    useSaveStore.getState().reset();
  });

  it('(a) picker path: handle is stored and tied to the parsed save id', async () => {
    const handle = fakeHandle('save4.sav');
    const file = new File([new Uint8Array(8)], 'save4.sav');

    await startParseFlow(file, handle);

    const record = await getLastActiveHandle();
    expect(record?.handle).toBe(handle);
    expect(record?.fileName).toBe('save4.sav');
    expect(record?.saveId).toBe('sha-save4.sav-8');
    // last-active points at the same fresh save
    expect(await getLastActiveSaveId()).toBe('sha-save4.sav-8');
    expect(useSaveStore.getState().status).toBe('ready');
  });

  it('(b) drag-drop (no handle) never overwrites the existing handle', async () => {
    const handle = fakeHandle('save4.sav');
    await startParseFlow(new File([new Uint8Array(8)], 'save4.sav'), handle);

    // Later session: user drags a DIFFERENT save in (no handle involved).
    await startParseFlow(new File([new Uint8Array(9)], 'autosave.sav'));

    const record = await getLastActiveHandle();
    expect(record?.handle).toBe(handle);
    expect(record?.saveId).toBe('sha-save4.sav-8');
    // …but last-active DID move to the drag-dropped save → handle and
    // last-active now disagree; boot must ignore the handle in this state.
    expect(await getLastActiveSaveId()).toBe('sha-autosave.sav-9');
    expect(useSaveStore.getState().status).toBe('ready');
  });

  it('(c) putSave stays compatible with the legacy no-lastModified call', async () => {
    await putSave(makeModel('legacy'));
    const stored = await getSave('legacy');
    expect(stored?.model.meta.id).toBe('legacy');
    expect(stored?.fileLastModified).toBeUndefined();
  });
});
