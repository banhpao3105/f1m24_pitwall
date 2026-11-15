/**
 * Save-reload UI state — v0.8.1.
 * Mirrors what the boot re-read decided for the currently open save so the
 * sidebar footer can reflect it. `saveId` scopes the state to one save: a
 * later "Change save" / drag-drop of another save must not leave a stale
 * capability rendered next to the wrong file.
 */

import { create } from 'zustand';

export type ReloadCapability =
  /** No handle for this save (drag-dropped, cleared, or not picked yet). */
  | 'none'
  /** Handle active + permission granted → F5 re-reads automatically. */
  | 'auto'
  /** Handle exists but permission must be re-granted (one-click button). */
  | 'needs-permission'
  /** Handle exists but the browser lacks the FS Access API. */
  | 'unsupported';

interface SaveReloadState {
  capability: ReloadCapability;
  saveId: string | null;
  fileName: string | null;
  set: (
    capability: ReloadCapability,
    saveId: string | null,
    fileName: string | null,
  ) => void;
}

export const useSaveReloadStore = create<SaveReloadState>()((set) => ({
  capability: 'none',
  saveId: null,
  fileName: null,
  set: (capability, saveId, fileName) =>
    set({ capability, saveId, fileName }),
}));
