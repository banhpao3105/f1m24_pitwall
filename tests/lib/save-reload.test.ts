// @vitest-environment jsdom
/**
 * v0.8.1 unit tests — the F5 re-read decision logic (src/lib/save-reload.ts):
 *  - inspectHandleOnBoot: granted+changed / granted+unchanged / prompt /
 *    NotFoundError / unsupported — boot only ever queryPermission;
 *  - requestAndReloadSave (sidebar one-click): granted+changed re-parses,
 *    denied stays silent, unchanged no-ops, missing drops the handle,
 *    foreign handle / no API → failed.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/lib/save-db', () => ({
  getLastActiveSaveId: vi.fn(),
  getLastActiveHandle: vi.fn(),
  getSave: vi.fn(),
  setLastActiveHandle: vi.fn(),
  setLastActiveSaveId: vi.fn(),
  putSave: vi.fn(),
  deleteSave: vi.fn(),
  listSaves: vi.fn(),
}));

vi.mock('@/lib/parse-controller', () => ({
  startParseFlow: vi.fn(),
}));

import {
  inspectHandleOnBoot,
  requestAndReloadSave,
  isFsAccessSupported,
  fileChangedComparedToStored,
} from '@/lib/save-reload';
import {
  getLastActiveSaveId,
  getLastActiveHandle,
  getSave,
  setLastActiveHandle,
  type StoredHandle,
  type StoredSave,
} from '@/lib/save-db';
import { startParseFlow } from '@/lib/parse-controller';
import { useSaveStore } from '@/store/save.store';
import { useSaveReloadStore } from '@/store/save-reload.store';
import { makeTestModel, makeFakeHandle, stubFsAccessGlobals, unstubFsAccessGlobals } from '../helpers/model';

const storedModel = makeTestModel('sha-a', { day: 46635, fileName: 'save4.sav', fileSizeBytes: 3 });
const stored: StoredSave = { model: storedModel, savedAt: '2026-01-01T00:00:00Z', fileLastModified: 1000 };

const diskFile = (lastModified = 1000): File =>
  new File([new Uint8Array([9, 9, 9])], 'save4.sav', { lastModified });

function handleFor(overrides: Parameters<typeof makeFakeHandle>[1] = {}): StoredHandle {
  return {
    handle: makeFakeHandle('save4.sav', { file: diskFile(), ...overrides }),
    saveId: 'sha-a',
    fileName: 'save4.sav',
  };
}

beforeEach(() => {
  stubFsAccessGlobals();
  vi.clearAllMocks();
  useSaveStore.getState().reset();
  useSaveReloadStore.getState().set('none', null, null);
});

afterEach(() => {
  unstubFsAccessGlobals();
});

describe('isFsAccessSupported', () => {
  it('detects the stubbed Chromium globals', () => {
    expect(isFsAccessSupported()).toBe(true);
  });

  it('false when the picker API is missing (Firefox/Safari)', () => {
    stubFsAccessGlobals(false);
    expect(isFsAccessSupported()).toBe(false);
  });
});

describe('fileChangedComparedToStored', () => {
  it('unchanged when name+size+lastModified match', () => {
    expect(fileChangedComparedToStored(diskFile(1000), stored)).toBe(false);
  });

  it('changed on lastModified; legacy record without lastModified falls back to name+size', () => {
    expect(fileChangedComparedToStored(diskFile(2000), stored)).toBe(true);
    const legacy: StoredSave = { model: storedModel, savedAt: stored.savedAt };
    expect(fileChangedComparedToStored(diskFile(9999), legacy)).toBe(false);
    expect(
      fileChangedComparedToStored(
        new File([new Uint8Array([1, 2, 3, 4])], 'save4.sav', { lastModified: 1000 }),
        legacy,
      ),
    ).toBe(true);
  });
});

describe('inspectHandleOnBoot (boot — queryPermission only)', () => {
  it('granted + unchanged → unchanged', async () => {
    const record = handleFor();
    await expect(inspectHandleOnBoot(record, stored)).resolves.toEqual({ kind: 'unchanged' });
    expect(record.handle.requestPermission).not.toHaveBeenCalled();
  });

  it('granted + file changed → changed with the fresh file', async () => {
    const record = handleFor({ file: diskFile(2000) });
    const outcome = await inspectHandleOnBoot(record, stored);
    expect(outcome.kind).toBe('changed');
    expect(outcome.kind === 'changed' && outcome.file.lastModified).toBe(2000);
    expect(record.handle.requestPermission).not.toHaveBeenCalled();
  });

  it('queryPermission prompt → needs-permission (no gesture at boot)', async () => {
    const record = handleFor({ queryPermission: async () => 'prompt' as PermissionState });
    await expect(inspectHandleOnBoot(record, stored)).resolves.toEqual({ kind: 'needs-permission' });
  });

  it('getFile NotFoundError → missing', async () => {
    const record = handleFor({
      getFile: async () => {
        throw new DOMException('gone', 'NotFoundError');
      },
    });
    await expect(inspectHandleOnBoot(record, stored)).resolves.toEqual({ kind: 'missing' });
  });

  it('no FS Access API → unsupported', async () => {
    stubFsAccessGlobals(false);
    const record = handleFor();
    await expect(inspectHandleOnBoot(record, stored)).resolves.toEqual({ kind: 'unsupported' });
  });
});

describe('requestAndReloadSave (sidebar one-click — requestPermission)', () => {
  it('granted + changed → re-parses and reports the fresh day', async () => {
    vi.mocked(getLastActiveSaveId).mockResolvedValue('sha-a');
    vi.mocked(getLastActiveHandle).mockResolvedValue(
      handleFor({ file: diskFile(2000) }),
    );
    vi.mocked(getSave).mockResolvedValue(stored);
    const reloaded = makeTestModel('sha-b', { day: 46636, fileName: 'save4.sav', fileSizeBytes: 3 });
    vi.mocked(startParseFlow).mockImplementation(async () => {
      useSaveStore.getState().setReady(reloaded);
    });

    await expect(requestAndReloadSave()).resolves.toEqual({
      kind: 'granted-reloaded',
      day: 46636,
      fileName: 'save4.sav',
    });
    expect(startParseFlow).toHaveBeenCalledTimes(1);
    expect(useSaveReloadStore.getState()).toMatchObject({
      capability: 'auto',
      saveId: 'sha-b',
      fileName: 'save4.sav',
    });
  });

  it('user denies → denied, no parse, state untouched', async () => {
    vi.mocked(getLastActiveSaveId).mockResolvedValue('sha-a');
    vi.mocked(getLastActiveHandle).mockResolvedValue(
      handleFor({ requestPermission: async () => 'denied' as PermissionState }),
    );
    vi.mocked(getSave).mockResolvedValue(stored);

    await expect(requestAndReloadSave()).resolves.toEqual({ kind: 'denied' });
    expect(startParseFlow).not.toHaveBeenCalled();
  });

  it('granted + unchanged → no parse, capability flips to auto', async () => {
    vi.mocked(getLastActiveSaveId).mockResolvedValue('sha-a');
    vi.mocked(getLastActiveHandle).mockResolvedValue(handleFor());
    vi.mocked(getSave).mockResolvedValue(stored);

    await expect(requestAndReloadSave()).resolves.toEqual({ kind: 'granted-unchanged' });
    expect(startParseFlow).not.toHaveBeenCalled();
    expect(useSaveReloadStore.getState()).toMatchObject({ capability: 'auto', saveId: 'sha-a' });
  });

  it('file vanished after granting → granted-missing + handle dropped', async () => {
    vi.mocked(getLastActiveSaveId).mockResolvedValue('sha-a');
    vi.mocked(getLastActiveHandle).mockResolvedValue(
      handleFor({
        getFile: async () => {
          throw new DOMException('gone', 'NotFoundError');
        },
      }),
    );
    vi.mocked(getSave).mockResolvedValue(stored);

    await expect(requestAndReloadSave()).resolves.toEqual({ kind: 'granted-missing' });
    expect(setLastActiveHandle).toHaveBeenCalledWith(null);
    expect(useSaveReloadStore.getState().capability).toBe('none');
  });

  it('handle belongs to another save (drag-drop afterwards) → failed', async () => {
    vi.mocked(getLastActiveSaveId).mockResolvedValue('sha-other');
    vi.mocked(getLastActiveHandle).mockResolvedValue(handleFor());

    await expect(requestAndReloadSave()).resolves.toEqual({ kind: 'failed' });
    expect(startParseFlow).not.toHaveBeenCalled();
  });

  it('no FS Access API → failed (button should not even render)', async () => {
    stubFsAccessGlobals(false);
    vi.mocked(getLastActiveSaveId).mockResolvedValue('sha-a');
    vi.mocked(getLastActiveHandle).mockResolvedValue(handleFor());

    await expect(requestAndReloadSave()).resolves.toEqual({ kind: 'failed' });
  });
});
