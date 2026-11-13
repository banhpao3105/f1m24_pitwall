'use client';

/**
 * Pit Wall Home — docs/04 §7.3.1: KPI strip + alerts + next race + tyre
 * quick rec + pace snapshot + top recommendations. No long tables here —
 * detail lives in Tyre Lab / Race Weekend.
 */

import { useTranslations, useLocale } from 'next-intl';
import { motion } from 'framer-motion';
import { Trophy, Timer, Waves, Car } from 'lucide-react';
import type { SaveModel } from '@/domain/types';
import { trackDisplay } from '@/lib/track-display';
import { usePaceBoard, useTyreLab, useCarLab, useFinance } from '@/lib/engine-hooks';
import { PaceBarChart } from './charts/PaceBarChart';
import { useWallNav } from './WallNav';
import { RecommendationCard } from './RecommendationCard';
import { StintTimeline } from './StintTimeline';
import { ConfidenceBadge } from './ConfidenceBadge';
import { AlertBanner } from './AlertBanner';
import { NumberTween } from './NumberTween';
import { RecentRaceCard, QuickStandingsCard } from './HomeCards';

export function WallHomeView({ model }: { model: SaveModel }) {
  const t = useTranslations('wall');
  const locale = useLocale() as 'vi' | 'en';
  const seasonId = model.meta.seasonId;
  const seasonRaces = model.races.filter((r) => r.seasonId === seasonId);
  const nextRace =
    seasonRaces.find((r) => r.state !== 2) ?? seasonRaces.at(-1) ?? null;
  const completedCount = seasonRaces.filter((r) => r.state === 2).length;

  const tyre = useTyreLab(nextRace?.raceId ?? null);
  const pace = usePaceBoard();
  const carLab = useCarLab();
  const finance = useFinance();
  const { setView } = useWallNav();

  // Player's best-placed driver (contract team → fallback player team name).
  const playerDriverIds = new Set(
    model.drivers.filter((d) => d.teamId === model.player.teamId).map((d) => d.staffId),
  );
  const driverStanding =
    model.standings.drivers.find((d) => playerDriverIds.has(d.id)) ?? null;
  const playerTeamRow = model.standings.teams.find(
    (s) => s.name === model.player.teamName,
  );

  const paceRow = pace?.data.rows.find((r) => r.isPlayer) ?? null;
  // 0.4.1: use the engine's reference rival (same team playerVsRivalS is
  // measured against) instead of re-deriving it locally.
  const rivalRow = pace?.data.rivalRef ?? null;
  const carLeagueRow = carLab?.data.league.rows.find((r) => r.isPlayer) ?? null;

  const kpis: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'good' | 'bad' | 'neutral' }[] = [
    {
      icon: <Trophy className="h-3.5 w-3.5" />,
      label: t('kpi.standings'),
      value: playerTeamRow ? `P${playerTeamRow.position}` : '—',
      sub: playerTeamRow ? (
        <NumberTween value={playerTeamRow.points} format={(n) => `${Math.round(n)} pts`} />
      ) : undefined,
    },
    {
      icon: <Timer className="h-3.5 w-3.5" />,
      label: t('kpi.season'),
      value: `${completedCount}/${seasonRaces.length}`,
      sub: nextRace ? trackDisplay(nextRace.trackName, locale) : undefined,
    },
    {
      icon: <Waves className="h-3.5 w-3.5" />,
      label: t('kpi.tyreRec'),
      value: tyre?.data.best
        ? tyre.data.best.stints.map((s) => `${s.compound}(${s.laps})`).join('→')
        : '—',
      sub: tyre ? `${tyre.data.best?.stops ?? 0} pit` : undefined,
    },
    {
      icon: <Car className="h-3.5 w-3.5" />,
      label: t('kpi.carRank'),
      value: carLeagueRow?.rank != null ? (
        <NumberTween value={carLeagueRow.rank} format={(n) => `#${Math.round(n)}`} />
      ) : (
        '—'
      ),
      sub: carLab?.data.league.source === 'designs' ? t('kpi.carByDesigns') : t('kpi.carByPace'),
    },
  ];

  const topRecs = [
    ...(tyre?.recommendations ?? []),
    ...(pace?.recommendations ?? []),
    ...(carLab?.recommendations ?? []),
    ...(finance?.recommendations ?? []),
  ].slice(0, 3);

  return (
    <div className="space-y-6" data-testid="wall-home">
      <AlertBanner model={model} />

      {/* KPI strip — bento full-width (docs §7.3.1) */}
      <section aria-label={t('kpi.label')} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((kpi, i) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: i * 0.04 }}
            className="rounded-lg border border-line bg-panel p-4"
          >
            <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-ink-faint">
              <span className="text-ink-faint" aria-hidden="true">{kpi.icon}</span>
              {kpi.label}
            </p>
            <p className="mt-1 truncate font-mono text-lg font-bold text-ink" title={typeof kpi.value === 'string' ? kpi.value : undefined}>
              {kpi.value}
            </p>
            {kpi.sub ? <p className="truncate text-[11px] text-ink-soft">{kpi.sub}</p> : null}
          </motion.div>
        ))}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Next race — 7/12 (v0.5.0 row 2) */}
        <div className="space-y-4 lg:col-span-7">
          {nextRace ? (
            <section aria-label={t('nextRace.label')} className="rounded-lg border border-line bg-panel p-4">
              <header className="mb-3 flex items-center gap-2">
                <h2 className="text-sm font-semibold text-ink">{t('nextRace.label')}</h2>
                {nextRace.state === 1 ? (
                  <span
                    className="inline-flex items-center gap-1.5 rounded bg-danger/10 px-1.5 py-0.5 font-mono text-[10px] uppercase text-danger"
                    data-testid="live-badge"
                  >
                    <span className="live-pulse-dot h-1.5 w-1.5 rounded-full bg-danger" aria-hidden="true" />
                    {t('nextRace.live')}
                  </span>
                ) : null}
                <span className="font-mono text-xs text-teal">{trackDisplay(nextRace.trackName, locale)}</span>
                {nextRace.weather?.raceRain ? (
                  <span className="rounded bg-info/10 px-1.5 py-0.5 text-[10px] text-info">
                    {t('nextRace.rain')}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => setView('race', nextRace.raceId)}
                  className="ml-auto cursor-pointer text-[11px] text-ink-faint hover:text-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {t('nextRace.openRace')}
                </button>
              </header>
              {tyre?.data.best ? (
                <StintTimeline
                  stints={tyre.data.best.stints}
                  totalLaps={tyre.data.laps}
                  pitLaps={tyre.data.best.pitLaps}
                />
              ) : (
                <p className="text-xs text-ink-faint">{t('nextRace.noPlan')}</p>
              )}
              {tyre ? (
                <div className="mt-2 flex items-center gap-2">
                  <ConfidenceBadge confidence={tyre.confidence} />
                  <button
                    type="button"
                    onClick={() => setView('tyres', nextRace.raceId)}
                    className="cursor-pointer text-[11px] text-ink-faint hover:text-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {t('nextRace.openTyres')}
                  </button>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>

        {/* what to do next — 5/12 (v0.5.0 row 2) */}
        <section aria-label={t('todo.label')} className="space-y-3 lg:col-span-5">
          <h2 className="text-sm font-semibold text-ink">{t('todo.label')}</h2>
          {topRecs.length > 0 ? (
            topRecs.map((rec, i) => (
              <RecommendationCard key={rec.id} recommendation={rec} testId={`home-rec-${i}`} />
            ))
          ) : (
            <p className="rounded-lg border border-line bg-panel p-4 text-xs text-ink-faint">
              {t('todo.empty')}
            </p>
          )}
          {driverStanding ? (
            <p className="text-[10px] text-ink-faint">
              {t('todo.driverLead', { name: driverStanding.name, pos: driverStanding.position, points: driverStanding.points })}
            </p>
          ) : null}
        </section>

        {/* row 3 — v0.5.0: close the empty left-column gap with real cards */}
        <div className="lg:col-span-7">
          <RecentRaceCard model={model} />
        </div>
        <div className="lg:col-span-5">
          <QuickStandingsCard model={model} />
        </div>

        {/* pace board — chart + 1-line conclusion (v0.5.0 step 2) */}
        <section
          aria-label={t('pace.label')}
          className="rounded-lg border border-line bg-panel p-4 lg:col-span-12"
        >
          <header className="mb-3 flex items-center gap-2">
            <h2 className="text-sm font-semibold text-ink">{t('pace.label')}</h2>
            {pace ? <ConfidenceBadge confidence={pace.confidence} /> : null}
          </header>
          {pace && pace.data.rows.length > 0 ? (
            <>
              <PaceBarChart rows={pace.data.rows} />
              {paceRow && rivalRow && pace.data.playerVsRivalS != null ? (
                <p className="mt-2 text-sm text-ink">
                  {t('pace.vsRival', {
                    rival: rivalRow.teamName,
                    gap: `${Math.abs(pace.data.playerVsRivalS).toFixed(3)}s`,
                    dir: pace.data.playerVsRivalS > 0 ? t('pace.slower') : t('pace.faster'),
                  })}
                  <span className="ml-2 font-mono text-[11px] text-ink-faint">
                    {t('pace.rank', { rank: paceRow.rank, total: pace.data.rows.length })}
                  </span>
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-xs text-ink-faint">{t('pace.noData')}</p>
          )}
        </section>
      </div>
    </div>
  );
}
