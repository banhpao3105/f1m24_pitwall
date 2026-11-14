'use client';

/**
 * Pit Wall Home — docs/04 §7.3.1. v0.6.0 dashboard-first (prompt §2):
 * KPI strip → (a) cumulative points area → (b) pace-gap lines → (c) gained
 * bars, all engine-fed via buildSeasonSeries + ChartCard. Everything textual
 * (next race, todo recs, pace conclusion) stays below the charts.
 */

import { useTranslations, useLocale } from 'next-intl';
import { Trophy, Timer, Waves, Car } from 'lucide-react';
import type { SaveModel } from '@/domain/types';
import { trackDisplay } from '@/lib/track-display';
import { usePaceBoard, useRacePaceBoard, useTyreLab, useCarLab, useFinance, useSeasonSeries } from '@/lib/engine-hooks';
import { PaceBarChart } from './charts/PaceBarChart';
import { PointsAreaChart } from './charts/PointsAreaChart';
import { PaceGapLineChart } from './charts/PaceGapLineChart';
import { GainedBarChart } from './charts/GainedBarChart';
import { ChartCard } from './charts/ChartCard';
import { KpiCard } from './KpiCard';
import { useWallNav } from './WallNav';
import { RecommendationCard } from './RecommendationCard';
import { StintTimeline } from './StintTimeline';
import { ConfidenceBadge } from './ConfidenceBadge';
import { AlertBanner } from './AlertBanner';
import { NumberTween } from './NumberTween';
import { RecentRaceCard, QuickStandingsCard } from './HomeCards';
import { TrackSchematic } from './TrackSchematic';
import { formatSigned } from '@/lib/utils';
import { cn } from '@/lib/utils';

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
  const racePace = useRacePaceBoard();
  const carLab = useCarLab();
  const finance = useFinance();
  const series = useSeasonSeries();
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
  // v0.5.0 step 4 — honest position delta: standings now vs standings
  // recomputed WITHOUT the last completed race (both from stored data).
  const lastCompleted =
    seasonRaces.filter((r) => r.state === 2).sort((a, b) => a.day - b.day).at(-1) ?? null;
  let positionDelta: { before: number; after: number; track: string } | null = null;
  if (playerTeamRow && lastCompleted) {
    const lastPointsByTeam = new Map<number, number>();
    for (const res of lastCompleted.results) {
      lastPointsByTeam.set(res.teamId, (lastPointsByTeam.get(res.teamId) ?? 0) + res.points);
    }
    const before = [...model.standings.teams]
      .map((row) => ({ id: row.id, points: row.points - (lastPointsByTeam.get(row.id) ?? 0) }))
      .sort((a, b) => b.points - a.points)
      .findIndex((row) => row.id === model.player.teamId) + 1;
    positionDelta = { before, after: playerTeamRow.position, track: trackDisplay(lastCompleted.trackName, locale) };
  }

  // v0.5.4 — long-run story next to the peak-pace verdict: race pace rank
  // (Time/Laps engine) + positions actually gained by the player's drivers
  // (startingPos − finishingPos), last race and season total.
  const racePaceRow = racePace?.data.rows.find((r) => r.isPlayer) ?? null;
  const gainRows = (lastCompleted?.results ?? [])
    .filter((r) => r.teamId === model.player.teamId && !r.dnf && r.startingPos != null)
    .map((r) => ({ name: r.driverName, gain: (r.startingPos ?? 0) - r.finishingPos }));
  const completedGainRaces = seasonRaces.filter((r) => r.state === 2);
  const seasonGainTotal = completedGainRaces.reduce(
    (sum, race) => sum + race.results.reduce((s, r) => {
      if (r.teamId !== model.player.teamId || r.dnf || r.startingPos == null) return s;
      return s + (r.startingPos - r.finishingPos);
    }, 0),
    0,
  );
  const fmtSigned = (n: number): string => `${n >= 0 ? '+' : ''}${n}`;

  /* v0.6.0 — chart verdicts (1 line each, engine-derived numbers only) */
  const sd = series?.data ?? null;
  const playerCumRow = sd?.pointsCumulative.find((r) => r.isPlayer) ?? null;
  const playerCumRank = sd ? sd.pointsCumulative.findIndex((r) => r.isPlayer) + 1 : 0;
  const leaderRow = sd?.pointsCumulative[0] ?? null;
  const pointsVerdict =
    sd && playerCumRow && playerCumRank > 0 && leaderRow
      ? t('charts.pointsVerdict', {
          races: sd.racesConsidered,
          points: playerCumRow.values.at(-1) ?? 0,
          rank: playerCumRank,
          leader: leaderRow.teamName,
          leaderPoints: leaderRow.values.at(-1) ?? 0,
        })
      : undefined;
  const paceVerdict =
    sd && paceRow && racePaceRow
      ? t('charts.paceVerdict', {
          races: sd.racesConsidered,
          peak: paceRow.paceDeltaS.toFixed(3),
          race: racePaceRow.paceDeltaS.toFixed(3),
        })
      : undefined;
  const gainedTotal = sd ? sd.positionsGainedPerRace.reduce((a, b) => a + b, 0) : 0;
  const gainedBest = sd && sd.positionsGainedPerRace.length > 0 ? Math.max(...sd.positionsGainedPerRace) : 0;
  const gainedBestIdx = sd ? sd.positionsGainedPerRace.indexOf(gainedBest) : -1;
  const gainedVerdict =
    sd && sd.racesConsidered > 0
      ? t('charts.gainedVerdict', {
          total: formatSigned(gainedTotal),
          best: formatSigned(gainedBest),
          track: gainedBestIdx >= 0 ? trackDisplay(sd.races[gainedBestIdx]?.trackName ?? '', locale) : '—',
        })
      : undefined;

  const kpis: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: React.ReactNode; delta?: React.ReactNode; testId?: string }[] = [
    {
      icon: <Trophy className="h-3.5 w-3.5" />,
      label: t('kpi.standings'),
      value: playerTeamRow ? `P${playerTeamRow.position}` : '—',
      sub: playerTeamRow ? (
        <NumberTween value={playerTeamRow.points} format={(n) => `${Math.round(n)} pts`} />
      ) : undefined,
      delta: positionDelta ? (
        <span
          className={cn(
            positionDelta.after < positionDelta.before ? 'text-good' : positionDelta.after > positionDelta.before ? 'text-danger' : 'text-ink-faint',
          )}
          data-testid="kpi-position-delta"
        >
          {positionDelta.before === positionDelta.after
            ? t('kpi.heldPos', { pos: positionDelta.after })
            : `${t('kpi.posBefore', { pos: positionDelta.before, track: positionDelta.track })} → P${positionDelta.after}`}
        </span>
      ) : undefined,
      testId: 'kpi-standings',
    },
    {
      icon: <Timer className="h-3.5 w-3.5" />,
      label: t('kpi.season'),
      value: `${completedCount}/${seasonRaces.length}`,
      sub: nextRace ? trackDisplay(nextRace.trackName, locale) : undefined,
      testId: 'kpi-season',
    },
    {
      icon: <Waves className="h-3.5 w-3.5" />,
      label: t('kpi.tyreRec'),
      value: tyre?.data.best
        ? tyre.data.best.stints.map((s) => `${s.compound}(${s.laps})`).join('→')
        : '—',
      sub: tyre ? `${tyre.data.best?.stops ?? 0} pit` : undefined,
      testId: 'kpi-tyre',
    },
    {
      icon: <Car className="h-3.5 w-3.5" />,
      label: t('kpi.carRank'),
      value: carLeagueRow?.rank != null ? (
        <NumberTween value={carLeagueRow.rank} format={(n) => `#${Math.round(n)}`} />
      ) : (
        '—'
      ),
      sub: t('kpi.carByPace'),
      testId: 'kpi-car',
    },
  ];

  const topRecs = [
    ...(tyre?.recommendations ?? []),
    ...(pace?.recommendations ?? []),
    ...(carLab?.recommendations ?? []),
    ...(finance?.recommendations ?? []),
  ].slice(0, 3);

  const seriesBadge = series ? <ConfidenceBadge confidence={series.confidence} /> : undefined;
  const hasSeries = sd != null && sd.races.length > 0;

  return (
    <div className="space-y-6" data-testid="wall-home">
      <AlertBanner model={model} />

      {/* KPI strip — bento full-width (docs §7.3.1); v0.5.0: 32px tabular
          numerals + honest position delta under the first tile */}
      <section aria-label={t('kpi.label')} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((kpi, i) => (
          <KpiCard
            key={kpi.label}
            icon={kpi.icon}
            label={kpi.label}
            value={kpi.value}
            sub={kpi.sub}
            delta={kpi.delta}
            testId={kpi.testId}
            index={i}
          />
        ))}
      </section>

      {/* v0.6.0 dashboard-first row — the three season charts, in order */}
      {series && hasSeries && sd ? (
        <div className="space-y-4">
          <ChartCard
            title={t('charts.points')}
            badge={seriesBadge}
            verdict={pointsVerdict}
            evidence={series.evidence}
            assumptions={series.assumptions}
            testId="home-points-chart"
          >
            <PointsAreaChart series={sd} model={model} />
          </ChartCard>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard
              title={t('charts.pace')}
              badge={seriesBadge}
              verdict={paceVerdict}
              evidence={series.evidence}
              assumptions={series.assumptions}
              testId="home-pace-chart"
            >
              <PaceGapLineChart series={sd} />
            </ChartCard>
            <ChartCard
              title={t('charts.gained')}
              badge={seriesBadge}
              verdict={gainedVerdict}
              evidence={series.evidence}
              assumptions={series.assumptions}
              testId="home-gained-chart"
            >
              <GainedBarChart series={sd} />
            </ChartCard>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Next race — 7/12 (v0.5.0 row 2) */}
        <div className="space-y-4 lg:col-span-7">
          {nextRace ? (
            <section aria-label={t('nextRace.label')} className="rounded-lg border border-line bg-panel p-4">
              <header className="mb-3 flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] uppercase tracking-wider text-teal">{t('sec.nextRace')}</span>
                {/* v0.5.0: live pulse on the upcoming-race card (reduced-motion
                    flattens it via the global rule) */}
                <span aria-hidden="true" className="live-pulse-dot h-1.5 w-1.5 rounded-full bg-teal" data-testid="next-race-pulse" />
                <h2 className="text-[15px] font-semibold text-ink">{t('nextRace.label')}</h2>
                {nextRace.state === 1 ? (
                  model.meta.day === nextRace.day ? (
                    <span
                      className="inline-flex items-center gap-1.5 rounded bg-danger/10 px-1.5 py-0.5 font-mono text-[10px] uppercase text-danger"
                      data-testid="live-badge"
                    >
                      <span className="live-pulse-dot h-1.5 w-1.5 rounded-full bg-danger" aria-hidden="true" />
                      {t('nextRace.live')}
                    </span>
                  ) : (
                    /* 0.5.3: state 1 = race weekend open, not racing yet —
                       same wording as Season ("tuần race"), no red pulse. */
                    <span
                      className="rounded bg-raised px-1.5 py-0.5 font-mono text-[10px] uppercase text-ink-soft"
                      data-testid="race-week-badge"
                    >
                      {t('nextRace.raceWeek')}
                    </span>
                  )
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
              <div className="flex items-start gap-4">
                <TrackSchematic trackName={nextRace.trackName} className="h-20 w-20 shrink-0" />
                <div className="min-w-0 flex-1">
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
                </div>
              </div>
            </section>
          ) : null}
        </div>

        {/* what to do next — 5/12 (v0.5.0 row 2) */}
        <section aria-label={t('todo.label')} className="space-y-3 lg:col-span-5">
          <header className="flex items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-wider text-amber">{t('sec.todo')}</span>
            <h2 className="text-[15px] font-semibold text-ink">{t('todo.label')}</h2>
          </header>
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
            <span className="font-mono text-[11px] uppercase tracking-wider text-teal">{t('sec.pace')}</span>
            <h2 className="text-[15px] font-semibold text-ink">{t('pace.label')}</h2>
            {pace ? <ConfidenceBadge confidence={pace.confidence} /> : null}
          </header>
          {pace && pace.data.rows.length > 0 ? (
            <>
              <PaceBarChart rows={pace.data.rows} model={model} />
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
              {racePace && racePaceRow ? (
                <p className="mt-1 text-sm text-ink" data-testid="home-race-pace-rank">
                  {t('pace.raceRank', { rank: racePaceRow.rank, total: racePace.data.rows.length })}
                  {racePace.data.playerVsRivalS != null && racePace.data.rivalRef ? (
                    <span className="ml-2 font-mono text-[11px] text-ink-faint">
                      {t('pace.raceVsRival', {
                        rival: racePace.data.rivalRef.teamName,
                        gap: `${Math.abs(racePace.data.playerVsRivalS).toFixed(3)}s`,
                        dir: racePace.data.playerVsRivalS > 0 ? t('pace.slower') : t('pace.faster'),
                      })}
                    </span>
                  ) : null}
                </p>
              ) : null}
              {lastCompleted && gainRows.length > 0 ? (
                <p className="mt-1 text-xs text-ink-soft" data-testid="home-positions-gained">
                  {t('pace.gains', {
                    track: trackDisplay(lastCompleted.trackName, locale),
                    detail: gainRows.map((g) => `${g.name} ${fmtSigned(g.gain)}`).join(', '),
                    races: completedGainRaces.length,
                    seasonTotal: fmtSigned(seasonGainTotal),
                  })}
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
