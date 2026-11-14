'use client';

/**
 * ChartCard — v0.6.0 step 1: the shared chart shell (prompt §1).
 * Title + chart + ONE verdict line + evidence behind a toggle. Every
 * dashboard chart renders inside this card so the "dashboard-first" rule
 * (numbers/charts up front, prose behind a toggle) holds everywhere.
 * Reuses the recommendation i18n keys for the evidence toggle.
 */

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ChevronDown, Link2 } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Evidence, Assumption } from '@/domain/provenance';
import { cn } from '@/lib/utils';

export function ChartCard({
  title,
  badge,
  verdict,
  verdictTone = 'neutral',
  evidence,
  assumptions,
  children,
  testId,
  hint,
}: {
  title: string;
  /** Confidence badge or any header-side element. */
  badge?: ReactNode;
  /** The single conclusion line under the chart (1 dòng kết luận). */
  verdict?: string;
  verdictTone?: 'neutral' | 'good' | 'danger';
  evidence?: Evidence[];
  assumptions?: Assumption[];
  children: ReactNode;
  testId?: string;
  /** Small print under the verdict (chart reading hint). */
  hint?: string;
}) {
  const t = useTranslations('recommendation');
  const [showEvidence, setShowEvidence] = useState(false);
  const hasProof = (evidence?.length ?? 0) > 0 || (assumptions?.length ?? 0) > 0;

  return (
    <section
      aria-label={title}
      className="rounded-lg border border-line bg-panel p-4"
      data-testid={testId ?? 'chart-card'}
    >
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
        {badge}
      </header>
      {children}
      {verdict ? (
        <p
          className={cn(
            'mt-2 line-clamp-2 text-sm',
            verdictTone === 'good' && 'text-good',
            verdictTone === 'danger' && 'text-danger',
            verdictTone === 'neutral' && 'text-ink',
          )}
          data-testid={testId ? `${testId}-verdict` : 'chart-card-verdict'}
        >
          {verdict}
        </p>
      ) : null}
      {hint ? <p className="mt-1 text-[10px] text-ink-faint">{hint}</p> : null}
      {hasProof ? (
        <>
          <button
            type="button"
            onClick={() => setShowEvidence((v) => !v)}
            aria-expanded={showEvidence}
            className="mt-2 inline-flex cursor-pointer items-center gap-1 text-[11px] text-ink-faint transition-colors duration-150 hover:text-ink-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          >
            <Link2 className="h-3 w-3" aria-hidden="true" />
            {t('evidence')}
            <ChevronDown
              className={`h-3 w-3 transition-transform duration-200 ${showEvidence ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>
          {showEvidence ? (
            <div className="mt-2 space-y-2 rounded bg-surface p-3" data-testid={testId ? `${testId}-proof` : 'chart-card-proof'}>
              {(evidence?.length ?? 0) > 0 ? (
                <div>
                  <p className="mb-1 text-[10px] uppercase tracking-wide text-ink-faint">
                    {t('evidenceList')}
                  </p>
                  <ul className="space-y-1">
                    {evidence!.map((e, i) => (
                      <li key={i} className="text-xs text-ink-soft">
                        <span className="font-mono text-[10px] text-ink-faint">[{e.source}]</span> {e.label}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {(assumptions?.length ?? 0) > 0 ? (
                <div>
                  <p className="mb-1 text-[10px] uppercase tracking-wide text-ink-faint">
                    {t('assumptions')}
                  </p>
                  <ul className="space-y-1">
                    {assumptions!.map((a, i) => (
                      <li key={i} className="text-xs text-ink-faint">
                        — {a.text}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
