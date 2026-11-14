'use client';

/**
 * Season view — Phase 2 (docs/04 §7.3.5): calendar, driver + team
 * standings, race data table with CSV export (JTBD #10). All data comes
 * from the Normalized Model (standings formula verified on a real save).
 */

import { useTranslations, useLocale } from 'next-intl';
import { motion } from 'framer-motion';
import { CalendarDays, Download, CloudRain } from 'lucide-react';
import type { SaveModel } from '@/domain/types';
import { trackDisplay } from '@/lib/track-display';
import { useSeasonSeries } from '@/lib/engine-hooks';
import { StandingsBarChart } from './charts/StandingsBarChart';
import { PointsAreaChart } from './charts/PointsAreaChart';
import { ChartCard } from './charts/ChartCard';
import { TeamDot } from './TeamIdentity';
import { ConfidenceBadge } from './ConfidenceBadge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function exportCsv(filename: string, header: string[], rows: (string | number)[][]): void {
  const escape = (v: string | number): string => {
    const s = String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))];
  // BOM so Excel reads UTF-8 (VI team/track names) correctly.
  const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function SeasonView({ model }: { model: SaveModel }) {
  const t = useTranslations('season');
  const tChart = useTranslations('charts.season');
  const tSec = useTranslations('sec');
  const locale = useLocale() as 'vi' | 'en';
  const series = useSeasonSeries();
  const seasonId = model.meta.seasonId;
  const races = model.races
    .filter((r) => r.seasonId === seasonId)
    .sort((a, b) => a.day - b.day);

  const winnerOf = (raceId: number): string =>
    model.races
      .find((r) => r.raceId === raceId)
      ?.results.find((res) => res.finishingPos === 1)?.driverName ?? '—';

  // v0.5.0 step 2: per-race card extras — points the player team scored
  // (completed) or a day countdown (upcoming). Both straight from the model.
  const playerPointsIn = (raceId: number): number =>
    model.races
      .find((r) => r.raceId === raceId)
      ?.results.filter((res) => res.teamId === model.player.teamId)
      .reduce((sum, res) => sum + res.points, 0) ?? 0;
  // v0.6.0 step 5 — the calendar cells double as the per-race result strip:
  // each cell shows the best classified finish + points of the player team.
  const playerBestFinishIn = (raceId: number): number | null => {
    const finishes = model.races
      .find((r) => r.raceId === raceId)
      ?.results.filter((res) => res.teamId === model.player.teamId && !res.dnf)
      .map((res) => res.finishingPos) ?? [];
    return finishes.length > 0 ? Math.min(...finishes) : null;
  };
  const countdownOf = (race: { day: number; state: number }): number | null => {
    if (race.state === 2) return null;
    const diff = race.day - model.meta.day;
    return diff > 0 ? diff : 0;
  };

  const exportRaceData = () => {
    exportCsv(
      `f1m-season-${seasonId}.csv`,
      [
        t('colTrack'), t('colDay'), t('colState'), t('colSprint'),
        t('colRain'), t('colTemp'), t('colLaps'), t('colWinner'),
      ],
      races.map((r) => [
        trackDisplay(r.trackName, locale),
        r.day,
        r.state === 2 ? t('completed') : t('upcoming'),
        r.isSprint ? t('yes') : t('no'),
        r.weather?.raceRain ? t('yes') : t('no'),
        r.weather?.raceTempC ?? '',
        r.laps ?? '',
        r.state === 2 ? winnerOf(r.raceId) : '',
      ]),
    );
  };

  return (
    <div className="space-y-5" data-testid="season-view">
      <header className="flex flex-wrap items-center gap-2">
        <CalendarDays className="h-4 w-4 text-blue" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-ink">{t('title')}</h2>
        <span className="font-mono text-xs text-ink-faint">
          {t('seasonNo', { season: seasonId })}
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={exportRaceData}
          disabled={races.length === 0}
          className="ml-auto cursor-pointer gap-1.5 border-line bg-surface text-ink-soft hover:text-ink"
          data-testid="export-csv"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          {t('exportCsv')}
        </Button>
      </header>

      {/* v0.6.0 step 5 — cumulative points area (same series as Home) */}
      {series && series.data.races.length > 0 ? (
        <ChartCard
          title={tChart('cumulative')}
          badge={<ConfidenceBadge confidence={series.confidence} />}
          verdict={tChart('cumulativeVerdict', {
            points: series.data.pointsCumulative.find((r) => r.isPlayer)?.values.at(-1) ?? 0,
            rank: series.data.pointsCumulative.findIndex((r) => r.isPlayer) + 1,
            leader: series.data.pointsCumulative[0]?.teamName ?? '—',
            leaderPoints: series.data.pointsCumulative[0]?.values.at(-1) ?? 0,
          })}
          evidence={series.evidence}
          assumptions={series.assumptions}
          testId="season-cumulative-chart"
        >
          <PointsAreaChart series={series.data} model={model} />
        </ChartCard>
      ) : null}

      {/* calendar */}
      <section aria-label={t('calendar')} className="rounded-lg border border-line bg-panel p-4">
        <h3 className="mb-3 text-[15px] font-semibold text-ink">
          <span className="mr-2 font-mono text-[11px] uppercase tracking-wider text-info">{tSec('calendar')}</span>
          {t('calendar')}
        </h3>
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {races.map((r, i) => (
            <motion.li
              key={r.raceId}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              // docs/06 §6.4 stagger standard: 0.04 s, first load only.
              transition={{ duration: 0.15, delay: Math.min(i * 0.04, 0.2) }}
              className={cn(
                'flex flex-col gap-1 rounded border px-2.5 py-2',
                r.state === 2 ? 'border-line bg-surface' : 'border-teal/40 bg-teal/5',
              )}
            >
              <span className="flex items-center gap-1.5 text-xs font-medium text-ink">
                <span className="w-4 font-mono text-[10px] text-ink-faint">{i + 1}</span>
                <span className="truncate" title={trackDisplay(r.trackName, locale)}>{trackDisplay(r.trackName, locale)}</span>
              </span>
              <span className="flex flex-wrap items-center gap-1 pl-5">
                <span
                  className={cn(
                    'rounded px-1 py-0.5 font-mono text-[9px] uppercase',
                    r.state === 2 ? 'bg-raised text-ink-soft' : 'bg-teal/15 text-teal',
                  )}
                >
                  {r.state === 2 ? t('completed') : t('upcoming')}
                </span>
                {r.isSprint ? (
                  <span className="rounded bg-gold/15 px-1 py-0.5 font-mono text-[9px] text-gold">
                    {t('sprint')}
                  </span>
                ) : null}
                {r.weather?.raceRain ? (
                  <span className="inline-flex items-center gap-0.5 rounded bg-info/10 px-1 py-0.5 text-[9px] text-info">
                    <CloudRain className="h-2.5 w-2.5" aria-hidden="true" />
                    {t('rain')}
                  </span>
                ) : null}
              </span>
              {/* v0.5.0 step 2 + v0.6.0: best finish + team points scored,
                  so the calendar doubles as the per-race result strip */}
              {r.state === 2 ? (
                <span
                  className="pl-5 font-mono text-[10px] text-good"
                  data-testid={`race-pts-${r.raceId}`}
                >
                  {playerBestFinishIn(r.raceId) != null ? `P${playerBestFinishIn(r.raceId)}` : 'DNF'}
                  {' · '}
                  {tChart('yourPoints', { points: playerPointsIn(r.raceId) })}
                </span>
              ) : (
                <span
                  className="pl-5 font-mono text-[10px] text-teal"
                  data-testid={`race-eta-${r.raceId}`}
                >
                  {(() => {
                    const days = countdownOf(r);
                    return days != null && days > 0
                      ? tChart('countdown', { days })
                      : tChart('raceWeek');
                  })()}
                </span>
              )}
            </motion.li>
          ))}
        </ol>
      </section>

      {/* standings — list + points bars side by side (v0.5.0 step 2) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section aria-label={t('standingsDrivers')} className="rounded-lg border border-line bg-panel p-4">
          <h3 className="mb-3 text-[15px] font-semibold text-ink">
            <span className="mr-2 font-mono text-[11px] uppercase tracking-wider text-info">{tSec('standings')}</span>
            {t('standingsDrivers')}
          </h3>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ul className="space-y-1">
              {model.standings.drivers.map((row) => {
                const isPlayerDriver = model.drivers.some(
                  (d) => d.staffId === row.id && d.teamId === model.player.teamId,
                );
                return (
                  <li
                    key={row.id}
                    className={cn(
                      'flex items-center gap-2 rounded px-2 py-1 text-xs',
                      isPlayerDriver ? 'bg-amber/10' : '',
                    )}
                    data-testid={`sd-${row.position}`}
                  >
                    <span className="w-6 font-mono text-ink-faint">P{row.position}</span>
                    <TeamDot model={model} teamId={row.teamId} />
                    <span className={cn('truncate', isPlayerDriver ? 'font-medium text-amber' : 'text-ink')}>
                      {row.name}
                    </span>
                    <span className="ml-auto font-mono text-ink-soft">{row.points}</span>
                  </li>
                );
              })}
            </ul>
            <div className="min-w-0">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                {tChart('driversChart')}
              </p>
              <StandingsBarChart
                rows={model.standings.drivers}
                highlightIds={model.drivers.filter((d) => d.teamId === model.player.teamId).map((d) => d.staffId)}
                testId="drivers-points-chart"
              />
            </div>
          </div>
        </section>
        <section aria-label={t('standingsTeams')} className="rounded-lg border border-line bg-panel p-4">
          <h3 className="mb-3 text-[15px] font-semibold text-ink">
            <span className="mr-2 font-mono text-[11px] uppercase tracking-wider text-info">{tSec('standings')}</span>
            {t('standingsTeams')}
          </h3>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ul className="space-y-1">
              {model.standings.teams.map((row) => (
                <li
                  key={row.id}
                  className={cn(
                    'flex items-center gap-2 rounded px-2 py-1 text-xs',
                    row.id === model.player.teamId ? 'bg-amber/10' : '',
                  )}
                  data-testid={`st-${row.position}`}
                >
                  <span className="w-6 font-mono text-ink-faint">P{row.position}</span>
                  <TeamDot model={model} teamId={row.id} />
                  <span className={cn('truncate', row.id === model.player.teamId ? 'font-medium text-amber' : 'text-ink')}>
                    {row.name}
                  </span>
                  <span className="ml-auto font-mono text-ink-soft">{row.points}</span>
                </li>
              ))}
            </ul>
            <div className="min-w-0">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                {tChart('teamsChart')}
              </p>
              <StandingsBarChart
                rows={model.standings.teams}
                highlightIds={[model.player.teamId]}
                testId="teams-points-chart"
              />
            </div>
          </div>
        </section>
      </div>

      {/* race data table */}
      <section aria-label={t('raceData')} className="rounded-lg border border-line bg-panel p-4">
        <h3 className="mb-3 text-[15px] font-semibold text-ink">
          <span className="mr-2 font-mono text-[11px] uppercase tracking-wider text-info">{tSec('data')}</span>
          {t('raceData')}
        </h3>
        <div className="max-h-96 overflow-y-auto" data-testid="race-data-table">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead className="sticky top-0 bg-panel">
              <tr className="text-[10px] uppercase tracking-wide text-ink-faint">
                <th className="px-2 py-1.5">{t('colTrack')}</th>
                <th className="px-2 py-1.5">{t('colDay')}</th>
                <th className="px-2 py-1.5">{t('colState')}</th>
                <th className="px-2 py-1.5">{t('colLaps')}</th>
                <th className="px-2 py-1.5">{t('colTemp')}</th>
                <th className="px-2 py-1.5">{t('colWinner')}</th>
              </tr>
            </thead>
            <tbody>
              {races.map((r) => (
                <tr key={r.raceId} className="border-t border-line/60">
                  <td className="px-2 py-1.5 text-ink">
                    {trackDisplay(r.trackName, locale)}
                    {r.isSprint ? <span className="ml-1 font-mono text-[9px] text-gold">{t('sprint')}</span> : null}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-ink-soft">{r.day}</td>
                  <td className="px-2 py-1.5">
                    <span className={r.state === 2 ? 'text-ink-soft' : 'text-teal'}>
                      {r.state === 2 ? t('completed') : t('upcoming')}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 font-mono text-ink-soft">{r.laps ?? '—'}</td>
                  <td className="px-2 py-1.5 font-mono text-ink-soft">
                    {r.weather?.raceTempC != null ? `${r.weather.raceTempC}°C` : '—'}
                  </td>
                  <td className="px-2 py-1.5 text-ink">
                    {r.state === 2 ? winnerOf(r.raceId) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
