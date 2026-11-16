/**
 * v0.8.1 unit tests — save-db persistence contract:
 *  - putSave WITHOUT fileLastModified still reads back (legacy records)
 *  - putSave WITH fileLastModified stores the disk-change detector
 *  - handle record roundtrip + cascade rules:
 *      · setLastActiveHandle(null) removes it
 *      · setLastActiveSaveId(null) drops the handle too
 *      · deleteSave(id) drops the handle only when it points at that save
 *      · listSaves() never leaks the pointer/handle keys
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('idb-keyval', async () => {
  const { createIdbMemoryMock } = await import('../helpers/idb-mock');
  return createIdbMemoryMock();
});

import * as idb from 'idb-keyval';
import {
  putSave,
  getSave,
  deleteSave,
  listSaves,
  setLastActiveSaveId,
  getLastActiveSaveId,
  setLastActiveHandle,
  getLastActiveHandle,
  type StoredHandle,
} from '@/lib/save-db';
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

describe('save-db — StoredSave.fileLastModified (v0.8.1)', () => {
  beforeEach(() => {
    mem.clear();
  });

  it('(c) putSave without fileLastModified still reads back (legacy compat)', async () => {
    await putSave(makeModel('legacy'));
    const stored = await getSave('legacy');
    expect(stored?.model.meta.id).toBe('legacy');
    expect(stored?.fileLastModified).toBeUndefined();
    expect(stored?.savedAt).toBeTruthy();
  });

  it('putSave with fileLastModified persists the detector value', async () => {
    await putSave(makeModel('m1'), 1699999999999);
    const stored = await getSave('m1');
    expect(stored?.fileLastModified).toBe(1699999999999);
  });
});

describe('save-db — StoredSave.raw, the original .sav bytes (v0.9.8)', () => {
  beforeEach(() => {
    mem.clear();
  });

  it('putSave with raw stores the bytes; getSave hands back the EXACT bytes', async () => {
    // 64KB of varied bytes — byte-for-byte, not just a size check
    const bytes = new Uint8Array(65536);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 37 + (i % 251)) & 0xff;
    const raw = new Blob([bytes]);
    await putSave(makeModel('raw1'), 1700000000000, raw);
    const stored = await getSave('raw1');
    expect(stored?.raw).toBeInstanceOf(Blob);
    expect(stored?.raw?.size).toBe(bytes.length);
    const readBack = new Uint8Array(await stored!.raw!.arrayBuffer());
    expect(readBack).toEqual(bytes);
    // the rest of the record is unchanged by the new field
    expect(stored?.model.meta.id).toBe('raw1');
    expect(stored?.fileLastModified).toBe(1700000000000);
  });

  it('putSave WITHOUT raw reads back as a legacy model-only record', async () => {
    await putSave(makeModel('legacy2'));
    const stored = await getSave('legacy2');
    expect(stored?.raw).toBeUndefined();
    expect(stored?.model.meta.id).toBe('legacy2');
    expect(stored?.savedAt).toBeTruthy();
  });

  it('deleting a record removes model AND raw bytes together', async () => {
    const raw = new Blob([new Uint8Array([9, 8, 7])]);
    await putSave(makeModel('raw3'), undefined, raw);
    expect((await getSave('raw3'))?.raw?.size).toBe(3);
    await deleteSave('raw3');
    expect(await getSave('raw3')).toBeUndefined();
  });
});

describe('save-db — last-active handle record (v0.8.1)', () => {
  beforeEach(() => {
    mem.clear();
  });

  it('(a) setLastActiveHandle → getLastActiveHandle roundtrips the record', async () => {
    const handle = fakeHandle('save4.sav');
    const record: StoredHandle = { handle, saveId: 'sha-a', fileName: 'save4.sav' };
    await setLastActiveHandle(record);
    const read = await getLastActiveHandle();
    expect(read?.handle).toBe(handle);
    expect(read?.saveId).toBe('sha-a');
    expect(read?.fileName).toBe('save4.sav');
  });

  it('setLastActiveHandle(null) removes the record', async () => {
    await setLastActiveHandle({ handle: fakeHandle('a.sav'), saveId: 's', fileName: 'a.sav' });
    await setLastActiveHandle(null);
    expect(await getLastActiveHandle()).toBeNull();
  });

  it('setLastActiveSaveId(null) cascades: pointer AND handle are cleared', async () => {
    await setLastActiveSaveId('sha-a');
    await setLastActiveHandle({ handle: fakeHandle('a.sav'), saveId: 'sha-a', fileName: 'a.sav' });
    await setLastActiveSaveId(null);
    expect(await getLastActiveSaveId()).toBeNull();
    expect(await getLastActiveHandle()).toBeNull();
  });

  it('setLastActiveSaveId(id) does NOT touch an existing handle record', async () => {
    await setLastActiveHandle({ handle: fakeHandle('a.sav'), saveId: 'sha-a', fileName: 'a.sav' });
    await setLastActiveSaveId('sha-b');
    expect((await getLastActiveHandle())?.saveId).toBe('sha-a');
  });

  it('deleteSave drops the handle only when it points at the deleted save', async () => {
    await putSave(makeModel('sha-a'));
    await putSave(makeModel('sha-b'));
    await setLastActiveHandle({ handle: fakeHandle('a.sav'), saveId: 'sha-a', fileName: 'a.sav' });

    await deleteSave('sha-b'); // unrelated → handle stays
    expect((await getLastActiveHandle())?.saveId).toBe('sha-a');

    await deleteSave('sha-a'); // the handle's own save → handle gone
    expect(await getLastActiveHandle()).toBeNull();
  });

  it('listSaves() hides the last-active + handle pointer keys', async () => {
    await putSave(makeModel('sha-a'));
    await setLastActiveSaveId('sha-a');
    await setLastActiveHandle({ handle: fakeHandle('a.sav'), saveId: 'sha-a', fileName: 'a.sav' });
    const saves = await listSaves();
    expect(saves).toHaveLength(1);
    expect(saves[0]?.model.meta.id).toBe('sha-a');
    expect(mem.size).toBe(3); // 1 save + 2 pointers, nothing else leaked
  });
});
