'use client';

/**
 * Locale switch — Phase 0. VI/EN from day 0 (docs rule 6).
 * Plain segmented control, keyboard accessible, no dropdown needed.
 */

import { useUiStore } from '@/store/ui.store';
import { locales, type Locale } from '@/lib/i18n/config';
import { useTranslations } from 'next-intl';
import { Languages } from 'lucide-react';
import { cn } from '@/lib/utils';

export function LocaleSwitch() {
  const t = useTranslations('locale');
  const locale = useUiStore((s) => s.locale);
  const setLocale = useUiStore((s) => s.setLocale);
  // Persisted store rehydrates after mount and re-renders via subscription.
  const active: Locale = locale ?? 'vi';

  return (
    <div
      role="group"
      aria-label={t('label')}
      className="inline-flex items-center gap-1 rounded-md border border-line bg-raised p-0.5"
    >
      <Languages className="ml-1.5 h-3.5 w-3.5 text-ink-faint" aria-hidden="true" />
      {locales.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLocale(l)}
          aria-pressed={active === l}
          className={cn(
            'cursor-pointer rounded px-2 py-1 text-xs font-medium uppercase tracking-wide transition-colors duration-150',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring',
            active === l
              ? 'bg-teal text-void'
              : 'text-ink-soft hover:text-ink',
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
