/**
 * IndexedDB persistence for parsed saves — Phase 0 (docs/01-AUDIT-DATA.md
 * §4.6). Stores the Normalized SaveModel keyed by the save's SHA-256 hash.
 * The raw .sav file is NEVER persisted (local-first privacy contract).
 * "Local data only" — deleting an entry here removes all traces.
 */

import { createStore, set, get, del, entries } from 'idb-keyval';
import type { SaveModel } from '@/domain/types';

const store = createStore('pitwall-db', 'saves');

/** Phase 3: pointer to the save the user had open last (auto-restore).
 * Kept in the SAME store but filtered out of listSaves(). */
const LAST_ACTIVE_KEY = 'pitwall:last-active';

/**
 * v0.8.1: FileSystemFileHandle of the file the user last picked via
 * `showOpenFilePicker` (Chromium only), so a plain F5 can re-read the file
 * from disk. The handle is structured-clonable in Chromium — it stays in
 * IndexedDB on the user's device; the raw .sav is STILL never persisted.
 * `saveId` ties the handle to the save it belongs to: when the user later
 * opens a different save (e.g. drag-dropped, no handle), the boot check
 * must NOT re-read this handle's file into the wrong session.
 */
const LAST_HANDLE_KEY = 'pitwall:last-active-handle';

export interface StoredHandle {
  handle: FileSystemFileHandle;
  /** SaveModel.meta.id the handle was captured with. */
  saveId: string;
  /** File name at capture time (display only — handle reads its own file). */
  fileName: string;
}

export interface StoredSave {
  model: SaveModel;
  savedAt: string; // ISO
  /** v0.8.1: File.lastModified at parse time — disk-change detector.
   * Legacy records (pre-0.8.1) lack it: treated as "unknown". */
  fileLastModified?: number;
}

export async function putSave(
  model: SaveModel,
  fileLastModified?: number,
): Promise<void> {
  const value: StoredSave = {
    model,
    savedAt: new Date().toISOString(),
    ...(fileLastModified != null ? { fileLastModified } : {}),
  };
  await set(model.meta.id, value, store);
}

export async function getSave(id: string): Promise<StoredSave | undefined> {
  return get<StoredSave>(id, store);
}

export async function deleteSave(id: string): Promise<void> {
  await del(id, store);
  // v0.8.1: a deleted save must not keep a re-read handle alive.
  const record = await get<StoredHandle | undefined>(LAST_HANDLE_KEY, store);
  if (record?.saveId === id) await del(LAST_HANDLE_KEY, store);
}

export async function listSaves(): Promise<StoredSave[]> {
  const all = await entries<string, StoredSave>(store);
  return all
    .filter(([key]) => key !== LAST_ACTIVE_KEY && key !== LAST_HANDLE_KEY)
    .map(([, value]) => value)
    .sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
}

/** Remember which save is open so a fresh page load can restore it.
 * Clearing the pointer also drops the re-read handle (no active save →
 * nothing to re-read on F5). */
export async function setLastActiveSaveId(id: string | null): Promise<void> {
  if (id == null) {
    await del(LAST_ACTIVE_KEY, store);
    await del(LAST_HANDLE_KEY, store);
    return;
  }
  await set(LAST_ACTIVE_KEY, { id, at: new Date().toISOString() }, store);
}

export async function getLastActiveSaveId(): Promise<string | null> {
  const v = await get<{ id: string; at: string }>(LAST_ACTIVE_KEY, store);
  return v?.id ?? null;
}

/** v0.8.1: remember the picked file's handle so F5 can re-read it from disk
 * (Chromium only; other browsers never store a handle). */
export async function setLastActiveHandle(
  record: StoredHandle | null,
): Promise<void> {
  if (record == null) {
    await del(LAST_HANDLE_KEY, store);
    return;
  }
  await set(LAST_HANDLE_KEY, record, store);
}

export async function getLastActiveHandle(): Promise<StoredHandle | null> {
  return (await get<StoredHandle | undefined>(LAST_HANDLE_KEY, store)) ?? null;
}
