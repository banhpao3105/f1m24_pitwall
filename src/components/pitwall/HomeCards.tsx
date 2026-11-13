'use client';

/**
 * HomeCards — v0.5.0 Step 1: two cards that close the empty left-column
 * gap on Home at 1440×900 (docs prompt §0.9):
 *   - RecentRaceCard: "Chặng vừa rồi" — podium top 3 + player's drivers +
 *     points the team scored in that race.
 *   - QuickStandingsCard: top-5 team standings with the player team
 *     highlighted, shortcut into the Season view.
 * Presentation only — numbers come straight from the Normalized Model
 * (results + standings), no recomputation beyond sums of stored points.
 */

import { useTranslations, useLocale } from 'next-intl';
import { CalendarCheck2, ListOrdered } from 'lucide-react';
import type { SaveModel } from '@/domain/types';
import { trackDisplay } from '@/lib/track-display';
import { useWallNav } from './WallNav';
import { cn } from '@/lib/utils';

export function RecentRaceCard({ model }: { model: SaveModel }) {
  const t = useTranslations('wall.recent');
  const locale = useLocale() as 'vi' | 'en';

  const seasonRaces = model.races.filter((r) => r.seasonId === model.meta.seasonId);
  const lastRace =
    seasonRaces
      .filter((r) => r.state === 2)
      .sort((a, b) => a.day - b.day)
      .at(-1) ?? null;

  if (!lastRace) {
    return (
      <section aria-label={t('title')} className="rounded-lg border border-line bg-panel p-4">
        <header className="mb-2 flex items-center gap-2">
          <CalendarCheck2 className="h-4 w-4 text-teal" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-ink">{t('title')}</h3>
        </header>
        <p className="text-xs text-ink-faint">{t('noData')}</p>
      </section>
    );
  }

  const ordered = [...lastRace.results].sort((a, b) => a.finishingPos - b.finishingPos);
  const podium = ordered.slice(0, 3);
  const playerRows = ordered.filter((r) => r.teamId === model.player.teamId);
  const playerPoints = playerRows.reduce((sum, r) => sum + r.points, 0);

  return (
    <section
      aria-label={t('title')}
      className="rounded-lg border border-line bg-panel p-4"
      data-testid="recent-race-card"
    >
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <CalendarCheck2 className="h-4 w-4 text-teal" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-ink">
          {t('titleWithTrack', { track: trackDisplay(lastRace.trackName, locale) })}
        </h3>
        <span className="ml-auto rounded bg-raised px-2 py-0.5 font-mono text-[10px] text-good">
          {t('teamPoints', { points: playerPoints })}
        </span>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-ink-faint">
            {t('top3')}
          </p>
          <ol className="space-y-1">
            {podium.map((row) => (
              <li key={row.driverId} className="flex items-center gap-2 text-xs" data-testid={`podium-${row.finishingPos}`}>
                <span
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded font-mono text-[10px] font-bold',
                    row.finishingPos === 1
                      ? 'bg-gold/20 text-gold'
                      : row.finishingPos === 2
                        ? 'bg-raised text-ink-soft'
                        : 'bg-amber/15 text-amber',
                  )}
                >
                  P{row.finishingPos}
                </span>
                <span className="truncate text-ink">{row.driverName}</span>
                <span className="ml-auto truncate font-mono text-[10px] text-ink-faint">
                  {row.teamName}
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div>
          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-ink-faint">
            {t('you')}
          </p>
          {playerRows.length > 0 ? (
            <ul className="space-y-1">
              {playerRows.map((row) => (
                <li
                  key={row.driverId}
                  className={cn(
                    'flex items-center gap-2 rounded bg-amber/5 px-1.5 py-0.5 text-xs',
                    row.dnf && 'opacity-80',
                  )}
                  data-testid={`your-driver-${row.driverId}`}
                >
                  <span className="w-6 shrink-0 font-mono text-[10px] text-amber">P{row.finishingPos}</span>
                  <span className="truncate text-ink">{row.driverName}</span>
                  <span className="ml-auto shrink-0 font-mono text-[10px] text-ink-faint">
                    {row.dnf ? t('dnf') : t('points', { points: row.points })}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-ink-faint">{t('noPlayerRows')}</p>
          )}
        </div>
      </div>
    </section>
  );
}

export function QuickStandingsCard({ model }: { model: SaveModel }) {
  const t = useTranslations('wall.quick');
  const { setView } = useWallNav();
  const top5 = model.standings.teams.slice(0, 5);

  return (
    <section
      aria-label={t('title')}
      className="rounded-lg border border-line bg-panel p-4"
      data-testid="quick-standings-card"
    >
      <header className="mb-3 flex items-center gap-2">
        <ListOrdered className="h-4 w-4 text-amber" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-ink">{t('title')}</h3>
        <button
          type="button"
          onClick={() => setView('season')}
          className="ml-auto cursor-pointer text-[11px] text-ink-faint hover:text-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        >
          {t('viewAll')}
        </button>
      </header>
      {top5.length > 0 ? (
        <ul className="space-y-1">
          {top5.map((row) => {
            const isPlayer = row.id === model.player.teamId;
            return (
              <li
                key={row.id}
                className={cn(
                  'flex items-center gap-2 rounded px-2 py-1 text-xs',
                  isPlayer ? 'bg-amber/10' : '',
                )}
                data-testid={`quick-st-${row.position}`}
              >
                <span className="w-6 font-mono text-ink-faint">P{row.position}</span>
                <span className={cn('truncate', isPlayer ? 'font-medium text-amber' : 'text-ink')}>
                  {row.name}
                </span>
                <span className="ml-auto font-mono text-ink-soft">{row.points}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-ink-faint">{t('noData')}</p>
      )}
    </section>
  );
}
