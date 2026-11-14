'use client';

/**
 * TimingTower — v0.5.0 Step 3 (prompt §2 Bước 3, Race Weekend Overview).
 * Broadcast-style P1..P22 tower built from the latest completed race in
 * the save (the selected race itself when it is already run). Columns:
 * pos, 3-letter code, name, team, gap, tyre, pits. Tyre has no per-lap
 * stint data in the model — it stays "—" (never invented). Gaps come from
 * Races_Results.Time minus the winner's time (oracle parity).
 */

import { useTranslations, useLocale } from 'next-intl';
import type { SaveModel } from '@/domain/types';
import { trackDisplay } from '@/lib/track-display';
import { teamPair } from '@/lib/team-colours';
import { computeLapsDown, formatLapsDown } from '@/lib/race-gap';
import { cn } from '@/lib/utils';

export function TimingTower({ model, raceId }: { model: SaveModel; raceId?: number | null }) {
  const t = useTranslations('race.tower');
  const tSec = useTranslations('sec');
  const locale = useLocale() as 'vi' | 'en';

  const seasonRaces = model.races.filter((r) => r.seasonId === model.meta.seasonId);
  const completed = seasonRaces
    .filter((r) => r.state === 2)
    .sort((a, b) => a.day - b.day);
  const source = completed.at(-1) ?? null;

  if (!source || source.results.length === 0) {
    return (
      <p className="rounded-lg border border-line bg-panel p-6 text-sm text-ink-faint">
        {t('noData')}
      </p>
    );
  }

  const isReference = raceId != null && source.raceId !== raceId;
  const codeOf = (driverId: number): string | null =>
    model.drivers.find((d) => d.staffId === driverId)?.code ?? null;
  const pitsOf = (driverId: number): number | null =>
    source.pitStops ? source.pitStops.filter((p) => p.driverId === driverId).length : null;

  const winner = source.results.find((r) => r.finishingPos === 1);
  const winnerLaps = winner?.laps;
  const rows = [...source.results].sort((a, b) => a.finishingPos - b.finishingPos);

  return (
    <section aria-label={t('title')} className="rounded-lg border border-line bg-panel p-4" data-testid="timing-tower">
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] uppercase tracking-wider text-teal">{tSec('tower')}</span>
        <h3 className="text-[15px] font-semibold text-ink">{t('title')}</h3>
        <span className="font-mono text-[11px] text-teal">{trackDisplay(source.trackName, locale)}</span>
        {isReference ? (
          <span className="rounded bg-raised px-2 py-0.5 font-mono text-[10px] text-amber">
            {t('referenceNote')}
          </span>
        ) : null}
      </header>

      <div className="max-h-96 overflow-y-auto pitwall-scroll rounded border border-line">
        {/* sticky header — tower scrolls independently */}
        <table className="w-full min-w-[520px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-raised">
            <tr className="text-[10px] uppercase tracking-wide text-ink-faint">
              <th className="px-2 py-1.5 font-medium">{t('colPos')}</th>
              <th className="px-2 py-1.5 font-medium">{t('colDriver')}</th>
              <th className="px-2 py-1.5 font-medium">{t('colTeam')}</th>
              <th className="px-2 py-1.5 text-right font-medium">{t('colGap')}</th>
              <th className="px-2 py-1.5 text-center font-medium">{t('colTyre')}</th>
              <th className="px-2 py-1.5 text-center font-medium">{t('colPits')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isPlayer = row.teamId === model.player.teamId;
              const { bg } = teamPair(model, row.teamId);
              const gapS =
                !row.dnf && winner?.totalTimeMs != null && row.totalTimeMs != null
                  ? (row.totalTimeMs - winner.totalTimeMs) / 1000
                  : null;
              // v0.5.4 fix: a lapped car's raw time deficit understates the
              // gap by ~1 lap-time per missing lap (Sainz P8 showed +7.5s
              // while P4 showed +63.4s) — broadcast convention instead.
              const lapsDown = !row.dnf ? computeLapsDown(row.laps, winnerLaps) : null;
              const pits = pitsOf(row.driverId);
              return (
                <tr
                  key={row.driverId}
                  className={cn('border-t border-line/60', isPlayer && 'bg-amber/10')}
                  data-testid={`tower-p${row.finishingPos}`}
                >
                  <td className="px-2 py-1.5 font-mono text-ink-faint">
                    {row.finishingPos === 1 ? (
                      <span className="rounded bg-gold/20 px-1 text-gold">P1</span>
                    ) : (
                      `P${row.finishingPos}`
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="flex items-center gap-1.5">
                      <span
                        aria-hidden="true"
                        className="h-4 w-1 shrink-0 rounded-sm"
                        style={{ backgroundColor: bg }}
                      />
                      <span className="font-mono text-[10px] text-ink-soft">
                        {codeOf(row.driverId) ?? '—'}
                      </span>
                      <span className={cn('truncate', isPlayer ? 'font-medium text-amber' : 'text-ink')}>
                        {row.driverName}
                      </span>
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-ink-soft">{row.teamName}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-ink-soft">
                    {row.dnf
                      ? t('dnf')
                      : row.finishingPos === 1
                        ? t('winner')
                        : lapsDown != null
                          ? formatLapsDown(lapsDown)
                          : gapS != null
                            ? `+${gapS.toFixed(3)}s`
                            : '—'}
                  </td>
                  <td className="px-2 py-1.5 text-center font-mono text-ink-faint">—</td>
                  <td className="px-2 py-1.5 text-center font-mono text-ink-soft">
                    {pits != null ? pits : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-[10px] text-ink-faint">{t('tyreHint')}</p>
    </section>
  );
}
