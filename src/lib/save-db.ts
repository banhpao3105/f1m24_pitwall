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

export interface StoredSave {
  model: SaveModel;
  savedAt: string; // ISO
}

export async function putSave(model: SaveModel): Promise<void> {
  const value: StoredSave = { model, savedAt: new Date().toISOString() };
  await set(model.meta.id, value, store);
}

export async function getSave(id: string): Promise<StoredSave | undefined> {
  return get<StoredSave>(id, store);
}

export async function deleteSave(id: string): Promise<void> {
  await del(id, store);
}

export async function listSaves(): Promise<StoredSave[]> {
  const all = await entries<string, StoredSave>(store);
  return all
    .filter(([key]) => key !== LAST_ACTIVE_KEY)
    .map(([, value]) => value)
    .sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
}

/** Remember which save is open so a fresh page load can restore it. */
export async function setLastActiveSaveId(id: string | null): Promise<void> {
  if (id == null) {
    await del(LAST_ACTIVE_KEY, store);
    return;
  }
  await set(LAST_ACTIVE_KEY, { id, at: new Date().toISOString() }, store);
}

export async function getLastActiveSaveId(): Promise<string | null> {
  const v = await get<{ id: string; at: string }>(LAST_ACTIVE_KEY, store);
  return v?.id ?? null;
}
