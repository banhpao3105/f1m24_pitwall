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
import { useTyreLab, usePaceBoard, useRacePaceBoard, useResultsBoard, useSim, useSeasonSeries } from '@/lib/engine-hooks';
import { StintTimeline } from './StintTimeline';
import { PitWindowBar } from './PitWindowBar';
import { ConfidenceBadge } from './ConfidenceBadge';
import { CompoundBadge, type CompoundKey } from './CompoundBadge';
import { RecommendationCard } from './RecommendationCard';
import { ResultsBoardCard } from './ResultsBoard';
import { ChartCard } from './charts/ChartCard';
import { RacePaceLinesChart } from './charts/RacePaceLinesChart';
import { PaceHeatmap } from './charts/PaceHeatmap';
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
  // v0.6.0 step 3 — pace metric tab (both boards' numbers stay engine-locked)
  const [paceMetric, setPaceMetric] = useState<'peak' | 'race'>('race');
  const seasonRaces = model.races.filter((r) => r.seasonId === model.meta.seasonId);
  const race =
    seasonRaces.find((r) => r.raceId === raceId) ??
    seasonRaces.find((r) => r.state !== 2) ??
    seasonRaces.at(-1) ??
    null;

  const tyre = useTyreLab(race?.raceId ?? null);
  const pace = usePaceBoard();
  const racePace = useRacePaceBoard();
  const results = useResultsBoard();
  const sim = useSim(race?.raceId ?? null);
  const series = useSeasonSeries();

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

  // v0.6.0 — one-line verdict for the pace card, following the active metric
  const activePaceBoard = paceMetric === 'peak' ? pace : racePace;
  const activePaceRow = activePaceBoard?.data.rows.find((r) => r.isPlayer) ?? null;
  const paceVerdict =
    activePaceBoard && activePaceRow
      ? `${t(paceMetric === 'peak' ? 'paceRankPeak' : 'paceRankRace', {
          rank: activePaceRow.rank,
          total: activePaceBoard.data.rows.length,
        })}${
          activePaceBoard.data.playerVsRivalS != null && activePaceBoard.data.rivalRef
            ? ` · ${t('paceValue', {
                gap: `${Math.abs(activePaceBoard.data.playerVsRivalS).toFixed(3)}s`,
                dir: activePaceBoard.data.playerVsRivalS > 0 ? t('paceSlower') : t('paceFaster'),
                rival: activePaceBoard.data.rivalRef.teamName,
              })}`
            : ''
        }`
      : undefined;

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

          {/* v0.6.0 step 3 — pace as per-race lines (player vs the two
              nearest rivals) with a peak/race metric tab; the boards' medians
              stay locked in the verdict line. */}
          {pace && pace.data.rows.length > 0 && series && series.data.races.length > 0 ? (
            <>
              <ChartCard
                title={t('pace')}
                badge={<ConfidenceBadge confidence={pace.confidence} />}
                verdict={paceVerdict}
                evidence={series.evidence}
                assumptions={series.assumptions}
                testId="race-pace-lines"
              >
                <div className="mb-3 flex gap-1.5" role="group" aria-label={t('pace')}>
                  {(['peak', 'race'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPaceMetric(m)}
                      aria-pressed={paceMetric === m}
                      className={cn(
                        'cursor-pointer rounded-md border px-3 py-1.5 text-xs font-medium transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring',
                        paceMetric === m
                          ? 'border-teal/50 bg-teal/10 text-teal'
                          : 'border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink',
                      )}
                    >
                      {m === 'peak' ? t('paceTabPeak') : t('paceTabRace')}
                    </button>
                  ))}
                </div>
                <RacePaceLinesChart series={series.data} metric={paceMetric} />
              </ChartCard>

              {/* the only canvas surface in the app — 11 teams × 6 races */}
              <ChartCard
                title={t('heatmap')}
                badge={<ConfidenceBadge confidence={racePace?.confidence ?? pace.confidence} />}
                hint={t('heatmapHint')}
                testId="race-pace-heatmap-card"
              >
                <PaceHeatmap series={series.data} model={model} />
              </ChartCard>
            </>
          ) : null}

          {/* v0.5.6 — real-race results board right after the pace boards:
              the scoreboard story next to the car story. No new route/tab. */}
          {results && results.data.rows.length > 0 ? (
            <ResultsBoardCard board={results} model={model} />
          ) : null}

          {/* v0.5.4/v0.5.6 — pace recs carry race pace + gains + the
              results-board head-to-head as counter-evidence (engine-composed).
              Both boards' recommendations render here so neither story is
              hidden. */}
          {(pace && pace.recommendations.length > 0) ||
          (racePace && racePace.recommendations.length > 0) ? (
            <section aria-label={t('recs')} className="space-y-3" data-testid="race-pace-recs">
              {pace?.recommendations.map((rec) => (
                <RecommendationCard key={rec.id} recommendation={rec} />
              ))}
              {racePace?.recommendations.map((rec) => (
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
