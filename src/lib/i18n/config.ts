/**
 * i18n configuration — Phase 0.
 *
 * PLANNING DEVIATION (documented): docs/02-ARCHITECTURE.md §3.1 wants
 * next-intl locale routing `/vi/*`, `/en/*`. The current sandbox preview
 * only exposes the `/` route, so Phase 0 ships next-intl WITHOUT locale
 * prefixes: locale lives in Zustand (persisted to localStorage), default
 * follows the browser with VI fallback (docs/06-DECISIONS.md Q5).
 * Revisit when the app leaves the sandbox / Phase 1 adds routing.
 */

import vi from '@/messages/vi.json';
import en from '@/messages/en.json';

export const locales = ['vi', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'vi';

export const messages: Record<Locale, typeof vi> = { vi, en };

export function isLocale(value: string | null | undefined): value is Locale {
  return value === 'vi' || value === 'en';
}

/** Browser language detection with VI fallback (docs/06-DECISIONS.md Q5). */
export function detectLocale(): Locale {
  if (typeof navigator === 'undefined') return defaultLocale;
  const lang = navigator.language?.toLowerCase() ?? '';
  if (lang.startsWith('vi')) return 'vi';
  if (lang.startsWith('en')) return 'en';
  return defaultLocale;
}
