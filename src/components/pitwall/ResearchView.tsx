'use client';

/**
 * Research view — Phase 2 (docs/04 §7.3.5) + v0.6.0 vote fix (prompt §6).
 * Proposals render as horizontal vote-share bars per option group
 * (Regulations_TeamVotes.GroupID — the verified Miami encoding; no more
 * "0 YES / 0 NO"). Expertise shows BOTH columns — total expertise vs banked
 * (NextSeasonExpertise) — because the real league splits the two
 * (player: lowest total 20,435 but the only banked 674.59; the other 10
 * teams: ~25–27k total, bank 0). Regulation recs hide 👍/👎 so they are not
 * mistaken for in-game votes.
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

      {/* v0.6.0: proposal recs carry no 👍/👎 (not an in-game vote) */}
      {regs.recommendations.map((rec) => (
        <RecommendationCard key={rec.id} recommendation={rec} hideFeedback />
      ))}

      {/* proposals — vote-share bars per option group */}
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
            {r.proposals.map((p) => {
              const useGroups = p.tally.length > 0;
              const total = useGroups ? p.totalVotes : p.yes + p.no;
              return (
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
                    {p.targetSeason != null ? (
                      <span className="rounded bg-raised px-1.5 py-0.5 font-mono text-[9px] text-ink-soft">
                        mùa {p.targetSeason}
                      </span>
                    ) : null}
                    {p.playerGroupId != null ? (
                      <span className="rounded bg-teal/10 px-1.5 py-0.5 font-mono text-[9px] text-teal">
                        {t('yourChoice', {
                          option:
                            p.tally.find((opt) => opt.isPlayerChoice)?.label ??
                            `nhóm ${p.playerGroupId}`,
                        })}
                      </span>
                    ) : null}
                    <span className="ml-auto font-mono text-[10px] text-ink-faint">
                      {useGroups
                        ? t('totalVotes', { count: p.totalVotes })
                        : p.yes + p.no + p.unknownVotes > 0
                          ? `${t('yes')} ${p.yes} / ${t('no')} ${p.no}`
                          : t('noVotes')}
                    </span>
                  </div>

                  {/* vote-share bar: one segment per option, player choice teal */}
                  {useGroups ? (
                    <div className="mt-2 space-y-1.5">
                      {p.tally.map((opt) => {
                        const pct = p.totalVotes > 0 ? (opt.votes / p.totalVotes) * 100 : 0;
                        return (
                          <div key={opt.groupId} className="flex items-center gap-2 text-[11px]">
                            <span
                              className={cn(
                                'w-40 shrink-0 truncate',
                                opt.isPlayerChoice ? 'font-medium text-teal' : 'text-ink-soft',
                              )}
                              title={opt.label}
                            >
                              {opt.label}
                              {opt.isPlayerChoice ? ' ✓' : ''}
                            </span>
                            <span className="h-2 min-w-[2px] rounded bg-teal/70" style={{ width: `${Math.max(pct, 1)}%` }} />
                            <span className="ml-1 font-mono text-ink">
                              {t('votesFor', { count: opt.votes })}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : p.yes + p.no + p.unknownVotes > 0 ? (
                    <p className="mt-1.5 font-mono text-[11px]">
                      <span className="text-good">{t('yes')} {p.yes}</span>
                      <span className="mx-1.5 text-ink-faint">/</span>
                      <span className="text-danger">{t('no')} {p.no}</span>
                      {p.unknownVotes > 0 ? (
                        <span className="ml-1.5 text-ink-faint">?{p.unknownVotes}</span>
                      ) : null}
                    </p>
                  ) : (
                    <p className="mt-1.5 text-[11px] text-ink-faint">{t('noVotes')}</p>
                  )}

                  {p.changes.length > 0 && !useGroups ? (
                    <p className="mt-1.5 text-[11px] text-ink-soft">
                      {t('changes')}: {p.changes.join(', ')}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* expertise — BOTH columns: total vs banked (v0.6.0) */}
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
          <>
            <div className="mb-1 flex flex-wrap gap-x-4 text-[10px] text-ink-faint">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-line-strong" aria-hidden="true" />
                {t('totalCol')}
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-teal" aria-hidden="true" />
                {t('bankedCol')}
              </span>
            </div>
            <ul className="space-y-1.5" data-testid="expertise-rows">
              {r.expertise.rows.map((row) => {
                const maxTotal = Math.max(...r.expertise.rows.map((x) => x.current ?? 0), 1);
                const maxBanked = Math.max(...r.expertise.rows.map((x) => x.nextSeason), 0.0001);
                return (
                  <li
                    key={row.teamId}
                    className={cn(
                      'rounded px-2 py-1.5 text-xs',
                      row.isPlayer ? 'bg-amber/10' : '',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-6 font-mono text-ink-faint">#{row.rank}</span>
                      <span className={cn('truncate', row.isPlayer ? 'font-medium text-amber' : 'text-ink')}>
                        {row.teamName}
                      </span>
                      <span className="ml-auto flex items-center gap-3 font-mono text-[11px]">
                        <span className="text-ink-soft" title={t('totalCol')}>
                          {row.current != null ? row.current.toLocaleString('vi-VN') : '—'}
                        </span>
                        <span className="text-teal" title={t('bankedCol')}>
                          {row.nextSeason.toFixed(1)} {t('pointsUnit')}
                        </span>
                      </span>
                    </div>
                    {/* two parallel bars — total (grey) over banked (teal) */}
                    <div className="mt-1 space-y-0.5">
                      <span className="block h-1.5 rounded bg-line-strong" style={{ width: `${row.current != null ? Math.max(2, (row.current / maxTotal) * 100) : 2}%` }} />
                      <span
                        className="block h-1.5 rounded bg-teal"
                        style={{ width: `${row.nextSeason > 0 ? Math.max(2, (row.nextSeason / maxBanked) * 100) : 0}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
