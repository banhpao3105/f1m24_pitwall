'use client';

/**
 * PitWindowBar — optimal / early / late windows around the recommended pit
 * lap (docs/04 §6.5). Pure presentational, keyboard-readable.
 *
 * v0.5.0 Step 4: legend added (optimal / life-cap / out-of-cap), lap ticks
 * 0–25–50, the optimal-lap label moved above the bar, and the previously
 * hardcoded Vietnamese strings moved to next-intl (i18n rule 7).
 */

import { useTranslations } from 'next-intl';

export function PitWindowBar({
  optimalLap,
  windowLo,
  windowHi,
  totalLaps,
  lifeCap,
}: {
  optimalLap: number;
  windowLo: number;
  windowHi: number;
  totalLaps: number;
  /** Tyre life ceiling of the outgoing compound. */
  lifeCap?: number;
}) {
  const t = useTranslations('pitbar');
  const pct = (lap: number) => Math.max(0, Math.min(100, (lap / totalLaps) * 100));
  const cap = lifeCap ?? totalLaps;
  const ticks = [1, 25, 50].filter((n) => n <= totalLaps);

  return (
    <div data-testid="pit-window-bar" className="space-y-1.5">
      {/* label above the bar (v0.5.0) */}
      <p className="font-mono text-[11px] text-teal">
        {t('optimalLabel', { lap: optimalLap, lo: windowLo, hi: windowHi })}
      </p>
      <div className="relative h-3 w-full overflow-hidden rounded-full border border-line bg-raised">
        {/* early window */}
        <div
          className="absolute inset-y-0 bg-amber/25"
          style={{ left: `${pct(Math.max(1, windowLo - 2))}%`, width: `${pct(windowLo) - pct(Math.max(1, windowLo - 2))}%` }}
          title={t('early')}
        />
        {/* optimal window */}
        <div
          className="absolute inset-y-0 bg-teal/40"
          style={{ left: `${pct(windowLo)}%`, width: `${pct(windowHi + 1) - pct(windowLo)}%` }}
          title={t('optimal')}
        />
        {/* late window (up to life cap) */}
        <div
          className="absolute inset-y-0 bg-danger/25"
          style={{ left: `${pct(windowHi + 1)}%`, width: `${pct(Math.min(cap + 1, totalLaps)) - pct(windowHi + 1)}%` }}
          title={t('late')}
        />
        {/* beyond life cap — out of tyre life (v0.5.0 legend zone) */}
        {cap < totalLaps ? (
          <div
            className="absolute inset-y-0 bg-danger/40"
            style={{ left: `${pct(cap + 1)}%`, width: `${pct(totalLaps) - pct(cap + 1)}%` }}
            title={t('beyondCap')}
          />
        ) : null}
        {/* optimal lap marker */}
        <div
          className="absolute inset-y-0 w-0.5 bg-teal"
          style={{ left: `${pct(optimalLap)}%` }}
          aria-hidden="true"
        />
      </div>
      {/* ticks 0–25–50 (v0.5.0) */}
      <div className="relative h-3 font-mono text-[10px] text-ink-faint" aria-hidden="true">
        {ticks.map((n) => (
          <span
            key={n}
            className="absolute -translate-x-1/2"
            style={{ left: `${pct(n)}%` }}
          >
            {n}
          </span>
        ))}
        <span className="absolute right-0">{totalLaps}</span>
      </div>
      {/* legend (v0.5.0) */}
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-ink-faint" aria-label={t('legend')}>
        <li className="flex items-center gap-1">
          <span aria-hidden="true" className="h-2 w-3 rounded-sm bg-teal/40" />
          {t('optimal')}
        </li>
        <li className="flex items-center gap-1">
          <span aria-hidden="true" className="h-2 w-3 rounded-sm bg-amber/25" />
          {t('earlyLate')}
        </li>
        <li className="flex items-center gap-1">
          <span aria-hidden="true" className="h-2 w-3 rounded-sm bg-danger/25" />
          {t('late')}
        </li>
        {cap < totalLaps ? (
          <li className="flex items-center gap-1">
            <span aria-hidden="true" className="h-2 w-3 rounded-sm bg-danger/40" />
            {t('beyondCap')}
          </li>
        ) : null}
      </ul>
      {lifeCap != null ? (
        <p className="font-mono text-[10px] text-ink-faint">
          {t('lifeCap', { cap: lifeCap })}
        </p>
      ) : null}
    </div>
  );
}
