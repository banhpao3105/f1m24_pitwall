// @vitest-environment jsdom
/**
 * v0.8.1 component tests — SaveAutoRestore boot tree. Real save-db on an
 * in-memory idb-keyval mock; parse + toast mocked. Covers the locked boot
 * decision tree:
 *   granted+changed → re-parse; granted+unchanged → cache (parsedAt intact);
 *   prompt → cache + needs-permission; NotFoundError → cache + handle
 *   dropped; no handle → plain restore; foreign handle → plain restore;
 *   no API → cache + unsupported.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import '@testing-library/jest-dom/vitest';
import { messages } from '@/lib/i18n/config';

vi.mock('idb-keyval', async () => {
  const { createIdbMemoryMock } = await import('../helpers/idb-mock');
  return createIdbMemoryMock();
});

vi.mock('@/lib/parse-controller', () => ({
  startParseFlow: vi.fn(),
  cancelParseFlow: vi.fn(),
}));

vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

import * as idb from 'idb-keyval';
import { SaveAutoRestore, __resetRestoreToastForTests } from '@/components/pitwall/SaveAutoRestore';
import {
  putSave,
  getSave,
  setLastActiveSaveId,
  getLastActiveHandle,
  setLastActiveHandle,
} from '@/lib/save-db';
import { startParseFlow } from '@/lib/parse-controller';
import { toast } from '@/hooks/use-toast';
import { useSaveStore } from '@/store/save.store';
import { useSaveReloadStore } from '@/store/save-reload.store';
import {
  makeTestModel,
  makeFakeHandle,
  stubFsAccessGlobals,
  unstubFsAccessGlobals,
} from '../helpers/model';

const mem = (idb as unknown as { __mem: Map<string, unknown> }).__mem;

const cachedModel = makeTestModel('sha-a', { day: 46635, fileName: 'save4.sav', fileSizeBytes: 3 });
const freshModel = makeTestModel('sha-b', { day: 46636, fileName: 'save4.sav', fileSizeBytes: 3 });

function diskFile(lastModified: number): File {
  return new File([new Uint8Array([9, 9, 9])], 'save4.sav', { lastModified });
}

async function seed(options: {
  fileLastModified?: number;
  handleRecord?: {
    handle: ReturnType<typeof makeFakeHandle>;
    saveId: string;
    fileName: string;
  } | null;
}): Promise<void> {
  await putSave(cachedModel, options.fileLastModified);
  await setLastActiveSaveId(cachedModel.meta.id);
  if (options.handleRecord !== undefined) {
    await setLastActiveHandle(options.handleRecord);
  }
}

beforeEach(() => {
  stubFsAccessGlobals();
  vi.clearAllMocks();
  mem.clear();
  useSaveStore.getState().reset();
  useSaveReloadStore.getState().set('none', null, null);
  __resetRestoreToastForTests();
  vi.mocked(startParseFlow).mockImplementation(async () => {
    useSaveStore.getState().setReady(freshModel);
  });
});

afterEach(() => {
  cleanup();
  unstubFsAccessGlobals();
});

function renderRestore(): void {
  render(
    <NextIntlClientProvider locale="vi" messages={messages.vi} timeZone="Asia/Shanghai">
      <SaveAutoRestore />
    </NextIntlClientProvider>,
  );
}

describe('SaveAutoRestore — v0.8.1 boot tree', () => {
  it('granted + file changed → re-parses from disk + reload toast + auto state', async () => {
    await seed({
      fileLastModified: 1000,
      handleRecord: { handle: makeFakeHandle('save4.sav', { file: diskFile(2000) }), saveId: 'sha-a', fileName: 'save4.sav' },
    });

    renderRestore();

    await waitFor(() => expect(useSaveStore.getState().status).toBe('ready'));
    expect(startParseFlow).toHaveBeenCalledTimes(1);
    expect(useSaveStore.getState().model?.meta.day).toBe(46636);
    expect(useSaveReloadStore.getState()).toMatchObject({
      capability: 'auto',
      saveId: 'sha-b',
      fileName: 'save4.sav',
    });
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: messages.vi.library.reloadedTitle }),
    );
  });

  it('granted + file unchanged → cache restored, parsedAt intact, no re-parse', async () => {
    await seed({
      fileLastModified: 1000,
      handleRecord: { handle: makeFakeHandle('save4.sav', { file: diskFile(1000) }), saveId: 'sha-a', fileName: 'save4.sav' },
    });

    renderRestore();

    await waitFor(() => expect(useSaveStore.getState().status).toBe('ready'));
    expect(startParseFlow).not.toHaveBeenCalled();
    expect(useSaveStore.getState().model?.meta.parsedAt).toBe(cachedModel.meta.parsedAt);
    expect(useSaveStore.getState().model?.meta.day).toBe(46635);
    expect(useSaveReloadStore.getState()).toMatchObject({ capability: 'auto', saveId: 'sha-a' });
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: messages.vi.library.restoredTitle }),
    );
  });

  it('queryPermission prompt → cache + needs-permission flag (never requestPermission at boot)', async () => {
    await seed({
      fileLastModified: 1000,
      handleRecord: {
        handle: makeFakeHandle('save4.sav', {
          file: diskFile(2000),
          queryPermission: async () => 'prompt' as PermissionState,
        }),
        saveId: 'sha-a',
        fileName: 'save4.sav',
      },
    });

    renderRestore();

    await waitFor(() => expect(useSaveStore.getState().status).toBe('ready'));
    expect(startParseFlow).not.toHaveBeenCalled();
    expect(useSaveStore.getState().model?.meta.day).toBe(46635);
    expect(useSaveReloadStore.getState()).toMatchObject({
      capability: 'needs-permission',
      saveId: 'sha-a',
    });
  });

  it('file gone (NotFoundError) → cache + toast + handle dropped', async () => {
    await seed({
      fileLastModified: 1000,
      handleRecord: {
        handle: makeFakeHandle('save4.sav', {
          getFile: async () => {
            throw new DOMException('gone', 'NotFoundError');
          },
        }),
        saveId: 'sha-a',
        fileName: 'save4.sav',
      },
    });

    renderRestore();

    await waitFor(() => expect(useSaveStore.getState().status).toBe('ready'));
    expect(startParseFlow).not.toHaveBeenCalled();
    expect(useSaveStore.getState().model?.meta.day).toBe(46635);
    expect(await getLastActiveHandle()).toBeNull();
    expect(useSaveReloadStore.getState().capability).toBe('none');
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: messages.vi.library.reloadMissingTitle }),
    );
  });

  it('no handle record → plain cache restore (pre-0.8.1 behavior)', async () => {
    await seed({ fileLastModified: 1000, handleRecord: null });

    renderRestore();

    await waitFor(() => expect(useSaveStore.getState().status).toBe('ready'));
    expect(startParseFlow).not.toHaveBeenCalled();
    expect(useSaveStore.getState().model?.meta.id).toBe('sha-a');
    expect(useSaveReloadStore.getState().capability).toBe('none');
  });

  it('handle belongs to another save (drag-drop afterwards) → ignored, plain restore', async () => {
    await seed({
      fileLastModified: 1000,
      handleRecord: { handle: makeFakeHandle('save4.sav', { file: diskFile(2000) }), saveId: 'sha-older', fileName: 'save4.sav' },
    });

    renderRestore();

    await waitFor(() => expect(useSaveStore.getState().status).toBe('ready'));
    expect(startParseFlow).not.toHaveBeenCalled();
    expect(useSaveStore.getState().model?.meta.id).toBe('sha-a');
    expect(useSaveReloadStore.getState().capability).toBe('none');
  });

  it('browser without the FS Access API → cache + unsupported flag', async () => {
    stubFsAccessGlobals(false);
    await seed({
      fileLastModified: 1000,
      handleRecord: { handle: makeFakeHandle('save4.sav', { file: diskFile(2000) }), saveId: 'sha-a', fileName: 'save4.sav' },
    });

    renderRestore();

    await waitFor(() => expect(useSaveStore.getState().status).toBe('ready'));
    expect(startParseFlow).not.toHaveBeenCalled();
    expect(useSaveStore.getState().model?.meta.id).toBe('sha-a');
    expect(useSaveReloadStore.getState()).toMatchObject({
      capability: 'unsupported',
      saveId: 'sha-a',
    });
  });

  it('legacy stored record without fileLastModified → still restored', async () => {
    await putSave(cachedModel); // no fileLastModified — pre-0.8.1 record
    await setLastActiveSaveId(cachedModel.meta.id);
    expect((await getSave('sha-a'))?.fileLastModified).toBeUndefined();

    renderRestore();

    await waitFor(() => expect(useSaveStore.getState().status).toBe('ready'));
    expect(useSaveStore.getState().model?.meta.id).toBe('sha-a');
    expect(startParseFlow).not.toHaveBeenCalled();
  });
});
