'use client';

/**
 * Privacy note — Phase 0 (docs rule 1: LOCAL-FIRST, must be visible in UI).
 * The exact sentence "Generated locally — no data leaves your device." is
 * kept from the old Gazette per docs/05-ROADMAP-STANDARDS.md §9.5.
 */

import { useTranslations } from 'next-intl';
import { ShieldCheck, Lock } from 'lucide-react';

export function PrivacyNote() {
  const t = useTranslations('privacy');

  return (
    <div
      className="rounded-lg border border-line bg-surface p-4"
      aria-label={t('localOnly')}
    >
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-teal" aria-hidden="true" />
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-teal">{t('localOnly')}</p>
          <p className="flex items-start gap-2 text-xs text-ink-soft">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
            <span>{t('readonly')}</span>
          </p>
          <p className="text-xs leading-relaxed text-ink-faint">{t('detail')}</p>
        </div>
      </div>
    </div>
  );
}
