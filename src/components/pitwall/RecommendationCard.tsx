'use client';

/**
 * RecommendationCard — the standard recommendation surface (docs/04 §6.5):
 * action + why + ConfidenceBadge + evidence list (collapsible) + risk.
 * Every engine recommendation renders through this card; a module without
 * recommendations is not done (docs golden rule 3).
 */

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, Lightbulb, TriangleAlert, Link2 } from 'lucide-react';
import { ConfidenceBadge } from './ConfidenceBadge';
import type { Recommendation } from '@/domain/provenance';

export function RecommendationCard({
  recommendation,
  testId,
}: {
  recommendation: Recommendation;
  testId?: string;
}) {
  const t = useTranslations('recommendation');
  const [showEvidence, setShowEvidence] = useState(false);

  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-lg border border-line bg-panel p-4"
      data-testid={testId ?? 'recommendation-card'}
    >
      <header className="mb-2 flex flex-wrap items-center gap-2">
        <Lightbulb className="h-4 w-4 shrink-0 text-amber" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-ink">{recommendation.title}</h3>
        <span className="ml-auto">
          <ConfidenceBadge confidence={recommendation.confidence} />
        </span>
      </header>

      <p className="rounded border border-teal/30 bg-teal/5 px-3 py-2 text-sm font-medium text-teal">
        {recommendation.action}
      </p>

      <p className="mt-2 text-xs leading-relaxed text-ink-soft">{recommendation.why}</p>

      {recommendation.expectedGain ? (
        <p className="mt-2 inline-block rounded bg-raised px-2 py-1 font-mono text-[11px] text-good">
          {recommendation.expectedGain}
        </p>
      ) : null}

      {recommendation.riskIfIgnored ? (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-danger">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{recommendation.riskIfIgnored}</span>
        </p>
      ) : null}

      <div className="mt-2">
        <button
          type="button"
          onClick={() => setShowEvidence((v) => !v)}
          aria-expanded={showEvidence}
          className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-ink-faint transition-colors duration-150 hover:text-ink-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        >
          <Link2 className="h-3 w-3" aria-hidden="true" />
          {t('evidence')}
          <ChevronDown
            className={`h-3 w-3 transition-transform duration-200 ${showEvidence ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
        {showEvidence ? (
          <div className="mt-2 space-y-2 rounded bg-surface p-3" data-testid="evidence-list">
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-wide text-ink-faint">
                {t('evidenceList')}
              </p>
              <ul className="space-y-1">
                {recommendation.evidence.map((e, i) => (
                  <li key={i} className="text-xs text-ink-soft">
                    <span className="font-mono text-[10px] text-ink-faint">[{e.source}]</span>{' '}
                    {e.label}
                    {e.detail ? <span className="text-ink-faint"> — {e.detail}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
            {recommendation.assumptions.length > 0 ? (
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-wide text-ink-faint">
                  {t('assumptions')}
                </p>
                <ul className="space-y-1">
                  {recommendation.assumptions.map((a, i) => (
                    <li key={i} className="text-xs text-ink-faint">
                      — {a.text}
                      {a.fallbackValue ? (
                        <span className="font-mono text-amber"> ({a.fallbackValue})</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </motion.article>
  );
}
