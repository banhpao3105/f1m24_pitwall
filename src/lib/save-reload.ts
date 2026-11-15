/**
 * v0.8.1 — F5 re-read of the picked save file (File System Access API).
 *
 * Contract (locked in prompt v0.8.1):
 *  - Boot may ONLY call `queryPermission` (no user gesture needed). It must
 *    NEVER call `requestPermission` or open a picker — that belongs to the
 *    explicit one-click button in the sidebar footer.
 *  - The stored handle is used only when it belongs to the currently
 *    last-active save (`record.saveId === lastActiveId`) — a drag-dropped
 *    save opened afterwards must never get another file's content.
 *  - The cached parse is re-parsed ONLY when the file on disk actually
 *    changed (name / size / lastModified); an unchanged file restores the
 *    cache untouched (parsedAt stays identical).
 *  - `NotFoundError` from `getFile()` (file moved/deleted) → restore the
 *    cache, drop the handle so we stop retrying.
 *  - Everything degrades to today's cache-restore behavior. Firefox/Safari
 *    never stored a handle → plain restore, always.
 *
 * Privacy: the handle lives in IndexedDB on the user's device only; the raw
 * .sav is still never persisted or uploaded.
 */

import {
  getLastActiveHandle,
  getLastActiveSaveId,
  getSave,
  setLastActiveHandle,
  type StoredHandle,
  type StoredSave,
} from '@/lib/save-db';
import { startParseFlow } from '@/lib/parse-controller';
import { useSaveStore } from '@/store/save.store';
import { useSaveReloadStore } from '@/store/save-reload.store';

/** Boot-time decision for the stored handle. */
export type BootReloadOutcome =
  | { kind: 'unsupported' }
  | { kind: 'needs-permission' }
  | { kind: 'missing' }
  | { kind: 'unchanged' }
  | { kind: 'changed'; file: File };

/** Result of the sidebar one-click "allow re-read" button. */
export type GrantReloadOutcome =
  | { kind: 'granted-unchanged' }
  | { kind: 'granted-reloaded'; day: number; fileName: string }
  | { kind: 'granted-missing' }
  | { kind: 'denied' }
  | { kind: 'failed' };

/** Chromium only — picker API AND the permission methods on the handle. */
export function isFsAccessSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.showOpenFilePicker === 'function' &&
    typeof FileSystemFileHandle !== 'undefined' &&
    typeof FileSystemFileHandle.prototype.queryPermission === 'function'
  );
}

/** Disk-change detector: name, size, and lastModified (when known). */
export function fileChangedComparedToStored(
  file: File,
  stored: StoredSave,
): boolean {
  if (file.name !== stored.model.meta.fileName) return true;
  if (file.size !== stored.model.meta.fileSizeBytes) return true;
  if (
    stored.fileLastModified != null &&
    file.lastModified !== stored.fileLastModified
  ) {
    return true;
  }
  return false;
}

function isMissingError(err: unknown): boolean {
  return (err as DOMException | undefined)?.name === 'NotFoundError';
}

/**
 * Boot inspection — `queryPermission` ONLY. Returned outcome drives the
 * boot tree in SaveAutoRestore (cache restore vs re-parse vs one-click).
 */
export async function inspectHandleOnBoot(
  record: StoredHandle,
  stored: StoredSave,
): Promise<BootReloadOutcome> {
  if (!isFsAccessSupported()) return { kind: 'unsupported' };

  let perm: PermissionState;
  try {
    perm =
      (await record.handle.queryPermission?.({ mode: 'read' })) ?? 'prompt';
  } catch {
    return { kind: 'needs-permission' };
  }
  if (perm !== 'granted') return { kind: 'needs-permission' };

  let file: File;
  try {
    file = await record.handle.getFile();
  } catch (err) {
    if (isMissingError(err)) return { kind: 'missing' };
    // Unknown failure → safest fallback: cache + offer the one-click button.
    return { kind: 'needs-permission' };
  }

  return fileChangedComparedToStored(file, stored)
    ? { kind: 'changed', file }
    : { kind: 'unchanged' };
}

/**
 * Sidebar one-click: `requestPermission({ mode: 'read' })` (must be called
 * from a user gesture) → re-read the file → re-parse when it changed.
 * Denied → everything stays as it was (cache still on screen).
 */
export async function requestAndReloadSave(): Promise<GrantReloadOutcome> {
  const activeId = await getLastActiveSaveId();
  const record = await getLastActiveHandle();
  if (
    !activeId ||
    !record ||
    record.saveId !== activeId ||
    !isFsAccessSupported()
  ) {
    return { kind: 'failed' };
  }

  let perm: PermissionState;
  try {
    perm =
      (await record.handle.requestPermission?.({ mode: 'read' })) ?? 'denied';
  } catch {
    return { kind: 'denied' };
  }
  if (perm !== 'granted') return { kind: 'denied' };

  const stored = await getSave(activeId);
  if (!stored) return { kind: 'failed' };

  let file: File;
  try {
    file = await record.handle.getFile();
  } catch (err) {
    if (isMissingError(err)) {
      await setLastActiveHandle(null);
      useSaveReloadStore.getState().set('none', null, null);
      return { kind: 'granted-missing' };
    }
    return { kind: 'failed' };
  }

  if (!fileChangedComparedToStored(file, stored)) {
    useSaveReloadStore
      .getState()
      .set('auto', activeId, record.fileName);
    return { kind: 'granted-unchanged' };
  }

  await startParseFlow(file, record.handle);
  const { status, model } = useSaveStore.getState();
  if (status === 'ready' && model) {
    useSaveReloadStore
      .getState()
      .set('auto', model.meta.id, model.meta.fileName);
    return {
      kind: 'granted-reloaded',
      day: model.meta.day,
      fileName: model.meta.fileName,
    };
  }
  return { kind: 'failed' };
}
