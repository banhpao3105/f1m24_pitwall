'use client';

/**
 * Research view — Phase 2 (docs/04 §7.3.5): regulation proposal vote
 * cards (raw tally + documented vote=1=YES assumption), expertise banking
 * ranking for next season. Regulation + finance engines only.
 */

import { useTranslations } from 'next-intl';
import { FlaskConical, ScrollText, PiggyBank } from 'lucide-react';
import { useRegulations } from '@/lib/engine-hooks';
import { RecommendationCard } from './RecommendationCard';
import { ConfidenceBadge } from './ConfidenceBadge';
import { DataUnavailable } from './DataUnavailable';
import { cn } from '@/lib/utils';

export function ResearchView() {
  const t = useTranslations('research');
  const regs = useRegulations();
  if (!regs) return null;
  const r = regs.data;

  return (
    <div className="space-y-5" data-testid="research-view">
      <header className="flex flex-wrap items-center gap-2">
        <FlaskConical className="h-4 w-4 text-blue" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-ink">{t('title')}</h2>
        <span className="ml-auto">
          <ConfidenceBadge confidence={regs.confidence} />
        </span>
      </header>

      {regs.recommendations.map((rec) => (
        <RecommendationCard key={rec.id} recommendation={rec} />
      ))}

      {/* proposals */}
      <section aria-label={t('proposals')} className="rounded-lg border border-line bg-panel p-4">
        <header className="mb-3 flex flex-wrap items-center gap-2">
          <ScrollText className="h-4 w-4 text-ink-faint" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-ink">{t('proposals')}</h3>
          {r.hasVoteData ? (
            <span className="font-mono text-[10px] text-ink-faint">{t('voteAssumption')}</span>
          ) : null}
        </header>
        {r.proposals.length === 0 ? (
          <DataUnavailable title={t('noProposals')} detail={t('noProposalsHint')} testId="research-unavailable" />
        ) : (
          <ul className="space-y-2" data-testid="proposal-list">
            {r.proposals.map((p) => (
              <li
                key={p.proposalId}
                className="rounded border border-line bg-surface p-3"
                data-testid={`proposal-${p.proposalId}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[10px] text-ink-faint">#{p.proposalId}</span>
                  <span className="text-xs font-medium text-ink">
                    {p.title ?? t('proposalUnnamed')}
                  </span>
                  {p.playerVote != null ? (
                    <span className="rounded bg-teal/10 px-1.5 py-0.5 font-mono text-[9px] text-teal">
                      {t('yourVote', { vote: p.playerVote })}
                    </span>
                  ) : null}
                  <span className="ml-auto font-mono text-[10px]">
                    <span className="text-good">{t('yes')} {p.yes}</span>
                    <span className="mx-1.5 text-ink-faint">/</span>
                    <span className="text-danger">{t('no')} {p.no}</span>
                    {p.unknownVotes > 0 ? (
                      <span className="ml-1.5 text-ink-faint">?{p.unknownVotes}</span>
                    ) : null}
                  </span>
                </div>
                {p.changes.length > 0 ? (
                  <p className="mt-1.5 text-[11px] text-ink-soft">
                    {t('changes')}: {p.changes.join(', ')}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* expertise banking */}
      <section aria-label={t('expertise')} className="rounded-lg border border-line bg-panel p-4">
        <header className="mb-3 flex flex-wrap items-center gap-2">
          <PiggyBank className="h-4 w-4 text-ink-faint" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-ink">{t('expertise')}</h3>
          <span className="font-mono text-[10px] text-ink-faint">
            {t('expertiseHint')}
          </span>
        </header>
        {r.expertise.rows.length === 0 ? (
          <DataUnavailable title={t('noExpertise')} detail={t('noExpertiseHint')} testId="expertise-unavailable" />
        ) : (
          <ul className="space-y-1" data-testid="expertise-rows">
            {r.expertise.rows.map((row) => (
              <li
                key={row.teamId}
                className={cn(
                  'flex items-center gap-2 rounded px-2 py-1 text-xs',
                  row.isPlayer ? 'bg-amber/10' : '',
                )}
              >
                <span className="w-6 font-mono text-ink-faint">#{row.rank}</span>
                <span className={cn('truncate', row.isPlayer ? 'font-medium text-amber' : 'text-ink')}>
                  {row.teamName}
                </span>
                <span className="ml-auto font-mono text-ink-soft">
                  {t('nextSeason')} {row.nextSeason}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
