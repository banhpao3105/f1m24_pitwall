'use client';

/**
 * Car Lab view — Phase 2 (docs/04 §7.3.4): car league (design points or
 * pace fallback, source-labelled), part grid with condition + risk,
 * dev queue ranked by points-per-budget (docs/03 §5.5), recommendations.
 */

import { useTranslations } from 'next-intl';
import { Car, Cog } from 'lucide-react';
import { useCarLab } from '@/lib/engine-hooks';
import type { SaveModel } from '@/domain/types';
import type { RiskLevel } from '@/engines/car.engine';
import { RecommendationCard } from './RecommendationCard';
import { ConfidenceBadge } from './ConfidenceBadge';
import { DataUnavailable } from './DataUnavailable';
import { TeamDot } from './TeamIdentity';
import { CarLeagueChart, PartConditionChart, PartPerformanceChart, DevPointsChart } from './charts/CarLabCharts';
import { cn } from '@/lib/utils';

const RISK_TONE: Record<RiskLevel, string> = {
  HIGH: 'border-danger/50 bg-danger/10 text-danger',
  WATCH: 'border-amber/50 bg-amber/10 text-amber',
  LOW: 'border-good/50 bg-good/10 text-good',
  UNKNOWN: 'border-line-strong bg-raised text-ink-soft',
};

function ConditionBar({ value }: { value: number | null }) {
  const pct = value != null ? Math.round(Math.min(1, Math.max(0, value)) * 100) : 0;
  const tone =
    value == null
      ? 'bg-line-strong'
      : value < 0.4
        ? 'bg-danger'
        : value < 0.7
          ? 'bg-amber'
          : 'bg-good';
  return (
    <span
      className="block h-1.5 w-full overflow-hidden rounded bg-surface"
      role="meter"
      aria-valuenow={value != null ? pct : undefined}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`condition ${pct}%`}
    >
      <span className={cn('block h-full', tone)} style={{ width: `${pct}%` }} />
    </span>
  );
}

export function CarLabView({ model }: { model: SaveModel }) {
  const t = useTranslations('cars');
  const tSec = useTranslations('sec');
  const lab = useCarLab();
  if (!lab) return null;

  const league = lab.data.league;

  return (
    <div className="space-y-5" data-testid="car-lab">
      <header className="flex flex-wrap items-center gap-2">
        <Car className="h-4 w-4 text-amber" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-ink">{t('title')}</h2>
        <span className="ml-auto">
          <ConfidenceBadge confidence={lab.confidence} />
        </span>
      </header>

      {lab.recommendations.map((rec) => (
        <RecommendationCard key={rec.id} recommendation={rec} />
      ))}

      {!lab.data.hasPartsData && !lab.data.hasDesignPoints ? (
        <DataUnavailable title={t('noPartsData')} detail={t('noPartsDataHint')} testId="cars-unavailable" />
      ) : null}

      {/* league table */}
      <section aria-label={t('league')} className="rounded-lg border border-line bg-panel p-4">
        <header className="mb-3 flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] uppercase tracking-wider text-amber">{tSec('league')}</span>
          <h3 className="text-[15px] font-semibold text-ink">{t('league')}</h3>
          <span className="rounded bg-raised px-1.5 py-0.5 font-mono text-[9px] uppercase text-ink-faint">
            {t('leagueByPace')}
          </span>
        </header>
        <ul className="space-y-1 sm:hidden">
          {league.rows.map((row) => (
            <li
              key={row.teamId}
              className={cn(
                'flex items-center gap-2 rounded px-2 py-1 text-xs',
                row.isPlayer ? 'bg-amber/10' : '',
              )}
              data-testid={`car-league-${row.rank ?? row.teamId}`}
            >
              <span className="w-6 font-mono text-ink-faint">#{row.rank ?? '—'}</span>
              <TeamDot model={model} teamId={row.teamId} />
              <span className={cn('truncate', row.isPlayer ? 'font-medium text-amber' : 'text-ink')}>
                {row.teamName}
              </span>
              <span className="ml-auto font-mono text-ink-soft">
                {row.rank ? `P${row.rank}` : '—'}
              </span>
            </li>
          ))}
        </ul>
        {/* v0.5.0 step 2: real bars on ≥sm — list above stays for tiny screens */}
        <div className="hidden sm:block">
          <CarLeagueChart rows={league.rows} model={model} />
        </div>
      </section>

      {/* part grid + durability */}
      {lab.data.parts.length > 0 ? (
        <section aria-label={t('durability')} className="rounded-lg border border-line bg-panel p-4">
          <h3 className="mb-3 text-[15px] font-semibold text-ink">
            <span className="mr-2 font-mono text-[11px] uppercase tracking-wider text-amber">{tSec('durability')}</span>
            {t('durability')}
          </h3>
          <div className="mb-4">
            <PartConditionChart rows={lab.data.parts} />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {lab.data.parts.map((p) => (
              <div key={p.partType} className="rounded border border-line bg-surface p-3" data-testid={`part-${p.partType}`}>
                <div className="flex items-center gap-1.5">
                  <Cog className="h-3 w-3 text-ink-faint" aria-hidden="true" />
                  <span className="truncate text-xs font-medium text-ink">{p.partType}</span>
                  <span
                    className={cn(
                      'ml-auto rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase',
                      RISK_TONE[p.risk],
                    )}
                  >
                    {p.risk}
                  </span>
                </div>
                <div className="mt-2">
                  <ConditionBar value={p.conditionAvg} />
                </div>
                <p className="mt-1.5 font-mono text-[10px] text-ink-faint">
                  {p.conditionAvg != null ? `${Math.round(p.conditionAvg * 100)}%` : '—'}
                  {' · '}
                  {t('partCount', { count: p.count })}
                  {p.isSupplier ? ` · ${t('supplier')}` : ''}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* v0.6.0 step 4 — part groups vs the league median (Parts_Items) */}
      {lab.data.parts.length > 0 ? (
        <section aria-label={t('perfTitle')} className="rounded-lg border border-line bg-panel p-4">
          <header className="mb-3 flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-wider text-amber">{tSec('durability')}</span>
            <h3 className="text-[15px] font-semibold text-ink">{t('perfTitle')}</h3>
          </header>
          <PartPerformanceChart rows={lab.data.parts} items={model.parts.items} />
        </section>
      ) : null}

      {/* dev queue */}
      {lab.data.devQueue.length > 0 ? (
        <section aria-label={t('devQueue')} className="rounded-lg border border-line bg-panel p-4">
          <header className="mb-3 flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-wider text-amber">{tSec('queue')}</span>
            <h3 className="text-[15px] font-semibold text-ink">{t('devQueue')}</h3>
            <span className="font-mono text-[10px] text-ink-faint">{t('devQueueHint')}</span>
          </header>
          {/* v0.6.0 step 4 — design points per part group as a bar chart */}
          <div className="mb-4">
            <DevPointsChart rows={lab.data.devQueue} />
          </div>
          <ul className="space-y-1.5">
            {lab.data.devQueue.slice(0, 6).map((q, i) => (
              <li key={q.designId} className="flex flex-wrap items-center gap-2 rounded bg-surface px-3 py-2 text-xs" data-testid={`dev-queue-${i}`}>
                <span className="w-5 font-mono text-ink-faint">{i + 1}</span>
                <span className="text-ink">{q.partType ?? q.name ?? `#${q.designId}`}</span>
                <span className="font-mono text-[10px] text-ink-faint">+{q.points} pts</span>
                <span className="ml-auto font-mono">
                  {q.pointsPerMillion != null ? (
                    <span className="text-good">{q.pointsPerMillion} {t('ppm')}</span>
                  ) : (
                    <span className="text-ink-faint">{t('noCost')}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
