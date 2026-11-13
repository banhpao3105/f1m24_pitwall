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
import {
  ChevronDown,
  Lightbulb,
  TriangleAlert,
  Link2,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react';
import { ConfidenceBadge } from './ConfidenceBadge';
import { useFeedbackStore } from '@/store/feedback.store';
import { cn } from '@/lib/utils';
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
  const vote = useFeedbackStore((s) => s.votes[recommendation.id]);
  const toggleVote = useFeedbackStore((s) => s.toggleVote);

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

      {/* v0.5.0 step 4: why capped at two lines — full text stays on hover
          and in the evidence drawer. */}
      <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-ink-soft" title={recommendation.why}>
        {recommendation.why}
      </p>

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

      <footer className="mt-3 flex flex-wrap items-center gap-1.5">
        {/* v0.5.0 step 4: compact icon-only feedback row (labels kept for
            screen readers + tooltips). Local-only loop (docs/03 §5.11). */}
        <button
          type="button"
          onClick={() => toggleVote(recommendation.id, 'up')}
          aria-pressed={vote === 'up'}
          aria-label={t('feedbackUp')}
          title={t('feedbackUp')}
          data-testid={`fb-up-${recommendation.id}`}
          className={cn(
            'inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring',
            vote === 'up'
              ? 'border-good/50 bg-good/10 text-good'
              : 'border-line bg-surface text-ink-faint hover:border-good/40 hover:text-good',
          )}
        >
          <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => toggleVote(recommendation.id, 'down')}
          aria-pressed={vote === 'down'}
          aria-label={t('feedbackDown')}
          title={t('feedbackDown')}
          data-testid={`fb-down-${recommendation.id}`}
          className={cn(
            'inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring',
            vote === 'down'
              ? 'border-danger/50 bg-danger/10 text-danger'
              : 'border-line bg-surface text-ink-faint hover:border-danger/40 hover:text-danger',
          )}
        >
          <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        {vote ? (
          <span className="text-[10px] text-ink-faint">{t('feedbackSaved')}</span>
        ) : null}

        <button
          type="button"
          onClick={() => setShowEvidence((v) => !v)}
          aria-expanded={showEvidence}
          className="ml-auto inline-flex cursor-pointer items-center gap-1 text-[11px] text-ink-faint transition-colors duration-150 hover:text-ink-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        >
          <Link2 className="h-3 w-3" aria-hidden="true" />
          {t('evidence')}
          <ChevronDown
            className={`h-3 w-3 transition-transform duration-200 ${showEvidence ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
      </footer>

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
    </motion.article>
  );
}
