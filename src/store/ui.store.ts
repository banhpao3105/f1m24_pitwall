/**
 * UI/session store — Phase 0 (docs/02-ARCHITECTURE.md §3.4).
 * Locale + persisted preference + Phase 3 command-palette state.
 * Keep this store free of save data.
 * Default is VI at SSR/first paint; persisted value (or browser detection,
 * docs/06-DECISIONS.md Q5) applies right after rehydration to avoid
 * hydration mismatches.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { detectLocale, type Locale } from '@/lib/i18n/config';

interface UiState {
  locale: Locale;
  /** Phase 3 — command palette (docs/04 §7.4). Not persisted. */
  paletteOpen: boolean;
  setLocale: (locale: Locale) => void;
  setPaletteOpen: (open: boolean) => void;
  togglePalette: () => void;
}

const STORAGE_KEY = 'pitwall:ui';

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      locale: 'vi',
      paletteOpen: false,
      setLocale: (locale) => set({ locale }),
      setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
      togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      // paletteOpen is session-only — never restore it.
      partialize: (state) => ({ locale: state.locale }),
      onRehydrateStorage: () => (state) => {
        // No stored preference yet → follow the browser (Q5: default VI).
        if (state && localStorage.getItem(STORAGE_KEY) === null) {
          useUiStore.setState({ locale: detectLocale() });
        }
      },
    },
  ),
);
