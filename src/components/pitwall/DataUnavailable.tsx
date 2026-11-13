'use client';

/**
 * DataUnavailable — the shared explicit degraded-state card (docs/02 §3.5):
 * missing optional data never crashes and never fakes zeros; it says what
 * is missing, what the fallback is, and what confidence that implies.
 */

import { Info } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function DataUnavailable({
  title,
  detail,
  testId,
}: {
  title: string;
  detail?: string;
  testId?: string;
}) {
  const t = useTranslations('unavailable');
  return (
    <div
      className="flex items-start gap-2 rounded-lg border border-line bg-surface px-3 py-2.5"
      data-testid={testId ?? 'data-unavailable'}
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-xs font-medium text-ink-soft">{title}</p>
        {detail ? <p className="mt-0.5 text-[11px] text-ink-faint">{detail}</p> : null}
        <p className="mt-1 text-[10px] uppercase tracking-wide text-ink-faint">
          {t('label')}
        </p>
      </div>
    </div>
  );
}
