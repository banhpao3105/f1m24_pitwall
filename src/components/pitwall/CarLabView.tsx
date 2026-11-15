'use client';

/**
 * Car Lab view — Phase 2 (docs/04 §7.3.4): car league (design points or
 * pace fallback, source-labelled), part grid with condition + risk,
 * dev queue ranked by points-per-budget (docs/03 §5.5), recommendations.
 * v0.8.0: aero strength section — per part × per stat vs the best team AT
 * THAT STAT and the grid mean, head-to-head rival switch, honest notes.
 */

import { useTranslations } from 'next-intl';
import { Fragment, useState } from 'react';
import { Car, Cog } from 'lucide-react';
import { useCarLab, useCarStrength } from '@/lib/engine-hooks';
import type { SaveModel } from '@/domain/types';
import type { RiskLevel } from '@/engines/car.engine';
import type { CarStrengthRow, PartSource } from '@/engines/car-strength.engine';
import { DEFAULT_RIVAL_TEAM_ID } from '@/engines/car-strength.engine';
import { RecommendationCard } from './RecommendationCard';
import { ConfidenceBadge } from './ConfidenceBadge';
import { DataUnavailable } from './DataUnavailable';
import { TeamDot } from './TeamIdentity';
import { CarLeagueChart, PartConditionChart, PartPerformanceChart, DevPointsChart, CarStrengthChart } from './charts/CarLabCharts';
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

/* ── v0.8.0 — aero strength section ─────────────────────────────────── */

const fmt1 = (v: number | null | undefined): string => (v == null ? '—' : v.toFixed(1));

function SourceTag({ source, label }: { source: PartSource; label: string }) {
  return (
    <span
      data-testid={`strength-src-${source}`}
      className={cn(
        'ml-1 rounded border px-1 py-px font-mono text-[9px] uppercase',
        source === 'latest' && 'border-amber/50 bg-amber/10 text-amber',
        source === 'unknown' && 'border-line-strong bg-raised text-ink-faint',
        source === 'installed' && 'border-line bg-raised text-ink-faint',
      )}
    >
      {label}
    </span>
  );
}

function StrengthRowCells({ row }: { row: CarStrengthRow }) {
  const t = useTranslations('cars');
  const weak = row.pctBest != null && row.pctBest < 60;
  const delta =
    row.rivalValue != null && row.playerValue != null
      ? Number((row.rivalValue - row.playerValue).toFixed(1))
      : null;
  return (
    <>
      <td className="py-1.5 pr-2 font-mono text-[11px] text-ink">
        {row.stat}
      </td>
      <td className="py-1.5 pr-2" data-testid="strength-player-cell">
        <span className="font-mono text-[11px] text-ink" data-testid="strength-player">
          {fmt1(row.playerValue)}
        </span>
        <SourceTag source={row.playerSource} label={t(`src${row.playerSource.charAt(0).toUpperCase()}${row.playerSource.slice(1)}`)} />
      </td>
      <td className="py-1.5 pr-2" data-testid="strength-best-cell">
        <span className="inline-flex items-center gap-1">
          <span className="truncate text-[11px] text-ink-soft" data-testid="strength-best-team">{row.bestTeamName}</span>
          <span className="font-mono text-[11px] text-ink" data-testid="strength-best-value">{fmt1(row.bestValue)}</span>
        </span>
        {/* honesty: the best column labels only the non-installed sources
         * (latest design / unknown) — 'installed' stays the silent norm */}
        {row.bestSource !== 'installed' ? (
          <SourceTag source={row.bestSource} label={t(`src${row.bestSource.charAt(0).toUpperCase()}${row.bestSource.slice(1)}`)} />
        ) : null}
      </td>
      <td className={cn('py-1.5 pr-2 text-right font-mono text-[11px]', weak ? 'font-semibold text-danger' : 'text-ink')} data-testid="strength-pct-best">
        {row.pctBest != null ? `${row.pctBest.toFixed(1)}%` : '—'}
      </td>
      <td className="py-1.5 pr-2 text-right font-mono text-[11px] text-ink-soft" data-testid="strength-pct-mean">
        {row.pctMean != null ? `${row.pctMean.toFixed(1)}%` : '—'}
      </td>
      <td className="py-1.5" data-testid="strength-rival-cell">
        <span className="font-mono text-[11px] text-ink" data-testid="strength-rival-value">{fmt1(row.rivalValue)}</span>
        {row.rivalSource !== 'installed' ? (
          <SourceTag source={row.rivalSource} label={t(`src${row.rivalSource.charAt(0).toUpperCase()}${row.rivalSource.slice(1)}`)} />
        ) : null}
        <span
          className={cn(
            'ml-1.5 font-mono text-[10px]',
            delta == null || delta === 0 ? 'text-ink-faint' : delta > 0 ? 'text-danger' : 'text-good',
          )}
          data-testid="strength-delta"
          title={t('strengthDelta')}
        >
          {delta != null ? `${delta > 0 ? '+' : ''}${delta.toFixed(1)}` : '—'}
        </span>
      </td>
    </>
  );
}

function CarStrengthSection({ model }: { model: SaveModel }) {
  const t = useTranslations('cars');
  const tSec = useTranslations('sec');
  const [rivalTeamId, setRivalTeamId] = useState<number>(DEFAULT_RIVAL_TEAM_ID);
  const strength = useCarStrength(rivalTeamId);
  if (!strength) return null;

  const rows = strength.data.rows;
  const parts = [...new Set(rows.map((r) => r.part))];

  /* standings gap (view-level: the engine stays points-free) */
  const teamRow = (id: number) => model.standings.teams.find((s) => s.id === id);
  const rivalStanding = teamRow(rivalTeamId);
  const playerStanding = teamRow(strength.data.playerTeamId);
  const gapText =
    rivalStanding && playerStanding
      ? t('strengthGap', {
          rival: strength.data.rivalOptions.find((o) => o.teamId === rivalTeamId)?.teamName ?? '—',
          rivalPts: rivalStanding.points,
          player: model.player.teamName,
          playerPts: playerStanding.points,
          gap: Math.abs(rivalStanding.points - playerStanding.points),
        })
      : t('strengthNoStandings');

  return (
    <section aria-label={t('strengthTitle')} className="rounded-lg border border-line bg-panel p-4" data-testid="car-strength">
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] uppercase tracking-wider text-amber">{tSec('strength')}</span>
        <h3 className="text-[15px] font-semibold text-ink">{t('strengthTitle')}</h3>
        <span className="rounded bg-raised px-1.5 py-0.5 font-mono text-[9px] uppercase text-ink-faint">
          {t('strengthSource')}
        </span>
        <span className="ml-auto">
          <ConfidenceBadge confidence={strength.confidence} />
        </span>
      </header>

      <p className="mb-3 rounded bg-surface p-2.5 text-[11px] leading-relaxed text-ink-soft" data-testid="car-strength-note">
        {t('strengthNote')}
      </p>

      {rows.length === 0 ? (
        <p className="text-xs text-ink-faint" data-testid="car-strength-empty">{t('strengthNoData')}</p>
      ) : (
        <>
          {/* head-to-head rival switch + standings gap */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <label htmlFor="strength-rival" className="text-[11px] text-ink-soft">
              {t('strengthRivalSelect')}
            </label>
            <select
              id="strength-rival"
              data-testid="strength-rival-select"
              value={rivalTeamId}
              onChange={(e) => setRivalTeamId(Number(e.target.value))}
              className="min-h-[44px] cursor-pointer rounded-md border border-line bg-raised px-2 py-2 text-xs text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
            >
              {strength.data.rivalOptions.map((o) => (
                <option key={o.teamId} value={o.teamId}>
                  {o.teamName}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-ink-faint" data-testid="strength-gap">{gapText}</span>
          </div>

          <div className="mb-4">
            <CarStrengthChart rows={rows} />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="py-1.5 pr-2 font-mono text-[9px] uppercase tracking-wider text-ink-faint">{t('strengthStatCol')}</th>
                  <th scope="col" className="py-1.5 pr-2 font-mono text-[9px] uppercase tracking-wider text-ink-faint">{t('strengthPlayer')}</th>
                  <th scope="col" className="py-1.5 pr-2 font-mono text-[9px] uppercase tracking-wider text-ink-faint">{t('strengthBest')}</th>
                  <th scope="col" className="py-1.5 pr-2 text-right font-mono text-[9px] uppercase tracking-wider text-ink-faint">{t('strengthPctBest')}</th>
                  <th scope="col" className="py-1.5 pr-2 text-right font-mono text-[9px] uppercase tracking-wider text-ink-faint">{t('strengthPctMean')}</th>
                  <th scope="col" className="py-1.5 font-mono text-[9px] uppercase tracking-wider text-ink-faint">{t('strengthRival')}</th>
                </tr>
              </thead>
              <tbody>
                {parts.map((part) => (
                  <Fragment key={part}>
                    <tr>
                      <td colSpan={6} className="pt-3 pb-1">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
                          <Cog className="h-3 w-3 text-ink-faint" aria-hidden="true" />
                          {part}
                        </span>
                      </td>
                    </tr>
                    {rows
                      .filter((r) => r.part === part)
                      .map((r) => (
                        <tr
                          key={r.stat}
                          data-testid={`strength-row-${r.part}-${r.stat}`}
                          data-weak={r.pctBest != null && r.pctBest < 60 ? 'true' : undefined}
                          className={cn(
                            'border-t border-line/60',
                            r.pctBest != null && r.pctBest < 60 && 'bg-danger/5',
                          )}
                        >
                          <StrengthRowCells row={r} />
                        </tr>
                      ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[10px] text-ink-faint">{t('strengthWeakLegend')}</p>
        </>
      )}
    </section>
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

      {/* v0.8.0 — aero strength: per part × per stat vs best/mean + head-to-head */}
      <CarStrengthSection model={model} />

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
