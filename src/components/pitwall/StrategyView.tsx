'use client';

/**
 * Strategy view — Phase 2 (docs/04 §7.3.5): finance snapshot (balance,
 * spend by category, cost-per-point), personnel contracts + FA patience
 * intel, loadout/condition context. Finance + personnel engines only.
 */

import { useTranslations } from 'next-intl';
import { Briefcase, Wallet, Users } from 'lucide-react';
import { useFinance, usePersonnel } from '@/lib/engine-hooks';
import { RecommendationCard } from './RecommendationCard';
import { ConfidenceBadge } from './ConfidenceBadge';
import { DataUnavailable } from './DataUnavailable';
import { cn, formatMoneyCompact } from '@/lib/utils';

function money(value: number | null | undefined): string {
  return formatMoneyCompact(value);
}

export function StrategyView() {
  const t = useTranslations('strategy');
  const finance = useFinance();
  const personnel = usePersonnel();

  if (!finance || !personnel) return null;
  const f = finance.data;
  const maxAbsSpend = Math.max(1, ...f.spendByCategory.map((s) => Math.abs(s.total)));

  return (
    <div className="space-y-5" data-testid="strategy-view">
      <header className="flex flex-wrap items-center gap-2">
        <Briefcase className="h-4 w-4 text-teal" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-ink">{t('title')}</h2>
        <span className="ml-auto">
          <ConfidenceBadge confidence={finance.confidence} />
        </span>
      </header>

      {finance.recommendations.map((rec) => (
        <RecommendationCard key={rec.id} recommendation={rec} />
      ))}

      {/* finance snapshot */}
      <section aria-label={t('finance')} className="rounded-lg border border-line bg-panel p-4">
        <header className="mb-3 flex flex-wrap items-center gap-2">
          <Wallet className="h-4 w-4 text-ink-faint" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-ink">{t('finance')}</h3>
        </header>
        {f.hasBalance || f.hasTransactions ? (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded bg-surface px-3 py-2" data-testid="fin-balance">
                <p className="text-[10px] uppercase tracking-wide text-ink-faint">{t('balance')}</p>
                <p className="font-mono text-sm text-ink">{money(f.balance)}</p>
              </div>
              <div className="rounded bg-surface px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-ink-faint">{t('budget')}</p>
                <p className="font-mono text-sm text-ink">{money(f.budget)}</p>
              </div>
              <div className="rounded bg-surface px-3 py-2" data-testid="fin-spend">
                <p className="text-[10px] uppercase tracking-wide text-ink-faint">{t('totalSpend')}</p>
                <p className="font-mono text-sm text-danger">{money(f.totalSpend)}</p>
              </div>
              <div className="rounded bg-surface px-3 py-2" data-testid="fin-cpp">
                <p className="text-[10px] uppercase tracking-wide text-ink-faint">{t('costPerPoint')}</p>
                <p className="font-mono text-sm text-ink">{f.costPerPoint != null ? money(f.costPerPoint) : '—'}</p>
              </div>
            </div>
            {f.spendByCategory.length > 0 ? (
              <ul className="mt-3 space-y-1.5" data-testid="spend-by-category">
                {f.spendByCategory.map((s) => (
                  <li key={s.category} className="text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-28 truncate text-ink-soft" title={s.category}>{s.category}</span>
                      <span
                        className={cn(
                          'h-1.5 rounded',
                          s.total < 0 ? 'bg-danger/70' : 'bg-good/70',
                        )}
                        style={{ width: `${Math.max(4, (Math.abs(s.total) / maxAbsSpend) * 60)}%` }}
                      />
                      <span className={cn('ml-auto font-mono', s.total < 0 ? 'text-danger' : 'text-good')}>
                        {money(s.total)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : (
          <DataUnavailable title={t('noFinance')} detail={t('noFinanceHint')} testId="finance-unavailable" />
        )}
      </section>

      {/* personnel */}
      <section aria-label={t('personnel')} className="rounded-lg border border-line bg-panel p-4">
        <header className="mb-3 flex flex-wrap items-center gap-2">
          <Users className="h-4 w-4 text-ink-faint" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-ink">{t('personnel')}</h3>
          {personnel.data.hasContractData ? null : (
            <span className="rounded bg-raised px-1.5 py-0.5 font-mono text-[9px] uppercase text-ink-faint">
              {t('contractFallback')}
            </span>
          )}
        </header>
        {personnel.data.hasContractData ? (
          <div className="max-h-96 space-y-1.5 overflow-y-auto pr-1" data-testid="contract-list">
            {personnel.data.contracts.map((c) => (
              <div
                key={c.staffId}
                className={cn(
                  'flex flex-wrap items-center gap-2 rounded border px-3 py-2 text-xs',
                  c.expiring ? 'border-danger/40 bg-danger/5' : 'border-line bg-surface',
                )}
                data-testid={`contract-${c.staffId}`}
              >
                <span className={cn('truncate', c.role === 'driver' ? 'font-medium text-ink' : 'text-ink-soft')}>
                  {c.name}
                </span>
                <span className="rounded bg-raised px-1.5 py-0.5 font-mono text-[9px] uppercase text-ink-faint">
                  {c.role === 'driver' ? t('roleDriver') : t('roleStaff')}
                </span>
                {c.morale != null ? (
                  <span className="font-mono text-[10px] text-ink-faint">
                    {t('morale')} {c.morale}
                  </span>
                ) : null}
                <span className="ml-auto flex items-center gap-3 font-mono">
                  {c.salary != null ? <span className="text-ink-soft">{money(c.salary)}</span> : null}
                  {c.daysLeft != null ? (
                    <span className={c.expiring ? 'text-danger' : 'text-ink-faint'}>
                      {c.daysLeft >= 0 ? t('daysLeft', { days: c.daysLeft }) : t('expired')}
                    </span>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <DataUnavailable title={t('noContracts')} detail={t('noContractsHint')} testId="contracts-unavailable" />
        )}

        {personnel.data.patience.length > 0 ? (
          <div className="mt-3" data-testid="patience-intel">
            <p className="mb-1.5 text-[10px] uppercase tracking-wide text-ink-faint">{t('patienceIntel')}</p>
            <ul className="space-y-1">
              {personnel.data.patience.slice(0, 6).map((p) => (
                <li key={p.staffId} className="flex flex-wrap items-center gap-2 rounded bg-surface px-3 py-1.5 text-[11px]">
                  <span className="text-ink-soft">{p.name ?? `Staff ${p.staffId}`}</span>
                  <span className="ml-auto font-mono text-ink-faint">
                    {t('suitability')} {p.suitability ?? '—'} · {t('opinion')} {p.opinion ?? '—'} · {t('threshold')}{' '}
                    <span className={p.threshold != null && p.threshold <= 0.3 ? 'text-good' : ''}>
                      {p.threshold ?? '—'}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[10px] text-ink-faint">{t('patienceHint')}</p>
          </div>
        ) : null}
      </section>

      {personnel.recommendations
        .filter((r) => r.id !== finance.recommendations.find((fr) => fr.id === r.id)?.id)
        .map((rec) => (
          <RecommendationCard key={rec.id} recommendation={rec} />
        ))}
    </div>
  );
}
