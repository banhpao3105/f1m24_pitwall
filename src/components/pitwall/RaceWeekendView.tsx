'use client';

/**
 * Race Weekend view — Phase 2 (docs/04 §7.3.2): tabs Overview | Sim.
 * Overview: header (track, laps, weather), pit window + hero plan, pace
 * snapshot, last result. Sim tab: quali sim (Q1/Q2/Q3 band) + race sim
 * (docs/03 §5.2 — logic ported to sim.engine, UI rebuilt).
 */

import { useTranslations, useLocale } from 'next-intl';
import { useState } from 'react';
import { Flag, CloudRain, Thermometer, CircleAlert, Gauge, Timer } from 'lucide-react';
import type { SaveModel } from '@/domain/types';
import { trackDisplay } from '@/lib/track-display';
import { useTyreLab, usePaceBoard, useRacePaceBoard, useSim } from '@/lib/engine-hooks';
import { StintTimeline } from './StintTimeline';
import { PitWindowBar } from './PitWindowBar';
import { ConfidenceBadge } from './ConfidenceBadge';
import { CompoundBadge, type CompoundKey } from './CompoundBadge';
import { RecommendationCard } from './RecommendationCard';
import { PaceBarChart } from './charts/PaceBarChart';
import { TimingTower } from './TimingTower';
import { TrackSchematic } from './TrackSchematic';
import { cn } from '@/lib/utils';

export function RaceWeekendView({
  model,
  raceId,
}: {
  model: SaveModel;
  raceId: number | null;
}) {
  const t = useTranslations('race');
  const tSim = useTranslations('sim');
  const tSec = useTranslations('sec');
  const locale = useLocale() as 'vi' | 'en';
  const [tab, setTab] = useState<'overview' | 'sim'>('overview');
  const seasonRaces = model.races.filter((r) => r.seasonId === model.meta.seasonId);
  const race =
    seasonRaces.find((r) => r.raceId === raceId) ??
    seasonRaces.find((r) => r.state !== 2) ??
    seasonRaces.at(-1) ??
    null;

  const tyre = useTyreLab(race?.raceId ?? null);
  const pace = usePaceBoard();
  const racePace = useRacePaceBoard();
  const sim = useSim(race?.raceId ?? null);

  if (!race) {
    return (
      <p className="rounded-lg border border-line bg-panel p-6 text-sm text-ink-faint">
        {t('noRace')}
      </p>
    );
  }

  const completed = race.state === 2;
  const lastResult = completed
    ? race.results.filter((r) => r.teamId === model.player.teamId).sort((a, b) => a.finishingPos - b.finishingPos)[0] ?? null
    : null;
  const fastest = tyre?.data.best ?? null;
  const firstStintCompound = fastest?.stints[0]?.compound as CompoundKey | undefined;

  const tabs: { key: 'overview' | 'sim'; label: string; icon: React.ReactNode }[] = [
    { key: 'overview', label: t('tabOverview'), icon: <Flag className="h-3.5 w-3.5" /> },
    { key: 'sim', label: tSim('tab'), icon: <Timer className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="space-y-5" data-testid="race-weekend">
      <header className="rounded-lg border border-line bg-panel p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* schematic outline — labelled illustrative, no invented data */}
          <TrackSchematic trackName={race.trackName} className="h-16 w-16 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Flag className="h-4 w-4 text-teal" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-ink">{trackDisplay(race.trackName, locale)}</h2>
              <span className="font-mono text-[11px] text-ink-faint">
                {race.laps ?? '—'} {t('laps')} · {completed ? t('completed') : t('upcoming')}
              </span>
            </div>
            {race.weather ? (
              <span className="mt-1 flex flex-wrap items-center gap-3 font-mono text-[11px] text-ink-soft">
                <span className="flex items-center gap-1">
                  <Thermometer className="h-3 w-3" aria-hidden="true" />
                  {race.weather.raceTempC ?? '—'}°C
                </span>
                <span className={`flex items-center gap-1 ${race.weather.raceRain ? 'text-info' : ''}`}>
                  <CloudRain className="h-3 w-3" aria-hidden="true" />
                  {race.weather.raceRain ? t('rain') : t('dry')}
                </span>
              </span>
            ) : null}
          </div>
        </div>
        {lastResult ? (
          <p className="mt-2 text-xs text-ink-soft">
            {t('lastResult', {
              pos: lastResult.finishingPos,
              points: lastResult.points,
              dnf: String(lastResult.dnf),
            })}
          </p>
        ) : null}
      </header>

      {/* tabs */}
      <nav aria-label={t('tabsLabel')} className="flex gap-1.5">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            aria-pressed={tab === item.key}
            className={cn(
              'inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring',
              tab === item.key
                ? 'border-teal/50 bg-teal/10 text-teal'
                : 'border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink',
            )}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>

      {tab === 'overview' ? (
        <>
          {/* broadcast-style tower from the latest completed race (v0.5.0) */}
          <TimingTower model={model} raceId={race.raceId} />

          {fastest ? (
            <section aria-label={t('plan')} className="rounded-lg border border-line bg-panel p-4">
              <header className="mb-3 flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] uppercase tracking-wider text-teal">{tSec('plan')}</span>
                <h3 className="text-[15px] font-semibold text-ink">{t('plan')}</h3>
                <span className="font-mono text-xs text-teal">
                  {fastest.stints.map((s) => `${s.compound}(${s.laps})`).join(' → ')}
                </span>
                {tyre ? <span className="ml-auto"><ConfidenceBadge confidence={tyre.confidence} /></span> : null}
              </header>
              <StintTimeline stints={fastest.stints} totalLaps={tyre?.data.laps ?? race.laps ?? 0} pitLaps={fastest.pitLaps} />
              {fastest.pitLaps.length > 0 && firstStintCompound ? (
                <div className="mt-4">
                  <PitWindowBar
                    optimalLap={fastest.pitLaps[0]}
                    windowLo={Math.max(2, fastest.pitLaps[0] - 2)}
                    windowHi={fastest.pitLaps[0] + 2}
                    totalLaps={tyre?.data.laps ?? race.laps ?? 0}
                    lifeCap={firstStintCompound ? tyre?.data.lives[firstStintCompound] : undefined}
                  />
                </div>
              ) : null}
            </section>
          ) : null}

          {pace && pace.data.rows.length > 0 ? (
            <section aria-label={t('pace')} className="rounded-lg border border-line bg-panel p-4">
              <header className="mb-2 flex items-center gap-2">
                <span className="font-mono text-[11px] uppercase tracking-wider text-teal">{tSec('pace')}</span>
                <h3 className="text-[15px] font-semibold text-ink">{t('pace')}</h3>
                <ConfidenceBadge confidence={pace.confidence} />
              </header>
              <PaceBarChart rows={pace.data.rows} model={model} testId="race-pace-chart" />
              {pace.data.playerVsRivalS != null ? (
                <p className="mt-2 text-xs text-ink-soft">
                  {t('paceValue', {
                    gap: `${Math.abs(pace.data.playerVsRivalS).toFixed(3)}s`,
                    dir: pace.data.playerVsRivalS > 0 ? t('paceSlower') : t('paceFaster'),
                    // 0.4.1 bug fix: quote the reference rival of playerVsRivalS
                    // (closest pace), never rivals[0] (which is the fastest rival).
                    rival: pace.data.rivalRef?.teamName ?? '—',
                  })}
                  {pace.data.rows.find((r) => r.isPlayer) ? (
                    <span className="ml-2 font-mono text-[11px] text-ink-faint">
                      {t('paceRankPeak', {
                        rank: pace.data.rows.find((r) => r.isPlayer)!.rank,
                        total: pace.data.rows.length,
                      })}
                    </span>
                  ) : null}
                </p>
              ) : null}

              {/* v0.5.4 — second board in the same section: average raced lap */}
              {racePace && racePace.data.rows.length > 0 ? (
                <div className="mt-4 border-t border-line pt-3" data-testid="race-pace-board">
                  <div className="mb-2 flex items-center gap-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                      {t('paceRace')}
                    </h4>
                    <ConfidenceBadge confidence={racePace.confidence} />
                  </div>
                  <PaceBarChart rows={racePace.data.rows} model={model} testId="race-pace-avg-chart" />
                  <p className="mt-2 text-xs text-ink-soft">
                    {racePace.data.rows.find((r) => r.isPlayer)
                      ? t('paceRankRace', {
                          rank: racePace.data.rows.find((r) => r.isPlayer)!.rank,
                          total: racePace.data.rows.length,
                        })
                      : null}
                    {racePace.data.playerVsRivalS != null && racePace.data.rivalRef ? (
                      <span>
                        {' · '}
                        {t('paceValue', {
                          gap: `${Math.abs(racePace.data.playerVsRivalS).toFixed(3)}s`,
                          dir: racePace.data.playerVsRivalS > 0 ? t('paceSlower') : t('paceFaster'),
                          rival: racePace.data.rivalRef.teamName,
                        })}
                      </span>
                    ) : null}
                  </p>
                </div>
              ) : null}
            </section>
          ) : null}

          {/* v0.5.4 — the peak-pace rec carries race pace + gains as
              counter-evidence (engine-composed); render it here so the
              full story is visible next to the boards. */}
          {pace && pace.recommendations.length > 0 ? (
            <section aria-label={t('recs')} className="space-y-3" data-testid="race-pace-recs">
              {pace.recommendations.map((rec) => (
                <RecommendationCard key={rec.id} recommendation={rec} />
              ))}
            </section>
          ) : null}

          {tyre?.warnings.includes('RACE_ALREADY_COMPLETED') ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber/40 bg-amber/10 px-3 py-2">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber" aria-hidden="true" />
              <p className="text-xs text-amber">{t('alreadyDone')}</p>
            </div>
          ) : null}

          {tyre && tyre.recommendations.length > 0 ? (
            <section aria-label={t('recs')} className="space-y-3">
              {tyre.recommendations.map((rec) => (
                <RecommendationCard key={rec.id} recommendation={rec} />
              ))}
            </section>
          ) : null}
        </>
      ) : (
        /* ── Sim tab (docs/04 §7.3.2) ── */
        <div className="space-y-4" data-testid="sim-panel">
          <header className="flex flex-wrap items-center gap-2">
            <Gauge className="h-4 w-4 text-teal" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-ink">{tSim('title')}</h3>
            <span className="font-mono text-[11px] text-ink-faint">
              {sim?.data.laps ?? race.laps ?? '—'} {t('laps')}
            </span>
            {sim ? <span className="ml-auto"><ConfidenceBadge confidence={sim.confidence} /></span> : null}
          </header>

          {sim ? (
            <>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {/* quali sim */}
                <section aria-label={tSim('quali')} className="rounded-lg border border-line bg-panel p-4">
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                    {tSim('quali')}
                  </h4>
                  <ul className="max-h-96 space-y-1 overflow-y-auto pr-1" data-testid="sim-quali">
                    {sim.data.quali.map((q) => (
                      <li
                        key={q.driverId}
                        className={cn(
                          'flex items-center gap-2 rounded px-2 py-1 text-xs',
                          q.isPlayer ? 'bg-amber/10' : '',
                        )}
                      >
                        <span className="w-6 font-mono text-ink-faint">P{q.predictedGridPos}</span>
                        <span className={cn('truncate', q.isPlayer ? 'font-medium text-amber' : 'text-ink')}>
                          {q.driverName}
                        </span>
                        <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] text-ink-faint">
                          <span className="rounded bg-raised px-1 py-0.5">{q.band}</span>
                          <span title={tSim('samples', { count: q.samples })}>{tSim(`src.${q.source}`)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>

                {/* race sim */}
                <section aria-label={tSim('race')} className="rounded-lg border border-line bg-panel p-4">
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                    {tSim('race')}
                  </h4>
                  <ul className="max-h-96 space-y-1 overflow-y-auto pr-1" data-testid="sim-race">
                    {sim.data.race.map((r) => (
                      <li
                        key={r.driverId}
                        className={cn(
                          'flex items-center gap-2 rounded px-2 py-1 text-xs',
                          r.isPlayer ? 'bg-amber/10' : '',
                        )}
                      >
                        <span className="w-6 font-mono text-ink-faint">P{r.projectedFinish}</span>
                        <span className={cn('truncate', r.isPlayer ? 'font-medium text-amber' : 'text-ink')}>
                          {r.driverName}
                        </span>
                        <span className="ml-auto flex items-center gap-2 font-mono text-[10px] text-ink-faint">
                          {/* v0.5.5: race-pace delta is the primary number,
                              fastest-lap delta is the tiebreak (secondary) */}
                          {r.racePaceDeltaS != null ? (
                            <span className="text-ink-soft" title={tSim('racePaceDeltaHint')}>
                              +{r.racePaceDeltaS.toFixed(3)}s
                            </span>
                          ) : null}
                          {r.paceDeltaS != null ? (
                            <span title={tSim('paceDeltaHint')}>
                              FL +{r.paceDeltaS.toFixed(3)}s
                            </span>
                          ) : null}
                          {r.expectedStops != null ? <span>~{r.expectedStops} pit</span> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>

              {sim.recommendations.map((rec) => (
                <RecommendationCard key={rec.id} recommendation={rec} />
              ))}

              <details className="rounded-lg border border-line bg-surface p-4">
                <summary className="cursor-pointer select-none text-xs font-medium text-ink-soft">
                  {tSim('assumptions')}
                </summary>
                <ul className="mt-2 space-y-1">
                  {sim.assumptions.map((a, i) => (
                    <li key={i} className="text-xs text-ink-faint">— {a.text}</li>
                  ))}
                  {sim.evidence.map((e, i) => (
                    <li key={`e${i}`} className="text-xs text-ink-soft">
                      <span className="font-mono text-[10px] text-ink-faint">[{e.source}]</span> {e.label}
                    </li>
                  ))}
                </ul>
              </details>
            </>
          ) : (
            <p className="rounded-lg border border-line bg-panel p-6 text-sm text-ink-faint">
              {tSim('noData')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
