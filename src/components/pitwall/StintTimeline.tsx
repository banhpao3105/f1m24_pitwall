'use client';

/**
 * StintTimeline — v0.6.0 step 3: full stint chart (prompt §3). Horizontal
 * stint blocks with compound colours over a REAL lap axis (0 → totalLaps
 * ticks) and on-bar pit-lap flags. Pure presentational; all numbers come
 * from the tyre engine's plan.
 *
 * v0.6.3: the bar container is `relative flex` again — v0.6.0 dropped
 * `flex` when the pit flags went absolute, which stacked the motion.div
 * stints into one row per stint (the last one clipped by overflow-hidden).
 * Each segment now also labels its own PIT LAP — stint i pits at its
 * toLap, matching the PIT column of the stint table and the engine's
 * pitLaps — and the final stint reads "về đích" instead. Segments narrower
 * than 12% of the bar fall back to the compact "S·15 / V37" form so the
 * pit lap survives truncation on mobile (min-w-[300px] scroll).
 */

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { CompoundBadge, type CompoundKey } from './CompoundBadge';

export interface TimelineStint {
  compound: CompoundKey;
  laps: number;
  fromLap: number;
  toLap: number;
}

const COMPOUND_COLOUR: Record<string, string> = {
  S: '#c8102e',
  M: '#e3b71e',
  H: '#e9e5dc',
  I: '#2fa84f',
  W: '#1d5f8a',
};

/** Below this share of the bar a segment switches to the compact labels. */
const COMPACT_WIDTH_SHARE = 0.12;

export function StintTimeline({
  stints,
  totalLaps,
  pitLaps = [],
}: {
  stints: TimelineStint[];
  totalLaps: number;
  pitLaps?: number[];
}) {
  const t = useTranslations('tyres.timeline');
  if (stints.length === 0 || totalLaps <= 0) return null;
  const axisTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * totalLaps));

  return (
    <div data-testid="stint-timeline">
      {/* v0.5.0 mobile: scroll horizontally instead of crushing labels */}
      <div className="overflow-x-auto pitwall-scroll">
        {/* v0.6.0: position-relative keeps the pit flags ON the lap axis;
            v0.6.3: `flex` is back so the stints sit side by side on ONE row
            (the v0.6.0 regression stacked them into 3 rows). */}
        <div className="relative flex h-9 min-w-[300px] w-full overflow-hidden rounded border border-line">
          {stints.map((stint, i) => {
            const isLast = i === stints.length - 1;
            const narrow = stint.laps / totalLaps < COMPACT_WIDTH_SHARE;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, scaleX: 0.9 }}
                animate={{ opacity: 1, scaleX: 1 }}
                transition={{ duration: 0.25, delay: i * 0.05 }}
                style={{ width: `${(stint.laps / totalLaps) * 100}%` }}
                className="relative flex min-w-0 flex-col items-center justify-center border-r border-line bg-raised last:border-r-0"
                title={`Stint ${i + 1}: ${stint.compound} — vòng ${stint.fromLap}–${stint.toLap} (${stint.laps} vòng)`}
              >
                <span
                  className="pointer-events-none absolute inset-x-0 top-0 h-0.5"
                  aria-hidden="true"
                  data-compound={stint.compound}
                  style={{ background: COMPOUND_COLOUR[stint.compound] ?? '#1d5f8a' }}
                />
                {/* line 1 — compound + stint length; compact form on narrow
                    segments keeps both lines inside the 36px bar */}
                <span
                  className={`font-mono text-[10px] leading-[13px] text-ink ${narrow ? 'max-w-full truncate px-0.5' : ''}`}
                  data-testid={`stint-label-${i}`}
                >
                  {narrow ? `${stint.compound}·${stint.laps}` : `${stint.compound} ${stint.laps}${t('lapsUnit')}`}
                </span>
                {/* line 2 — this stint's pit lap (its toLap), amber like the
                    flags; the final stint has no pit, it finishes the race */}
                <span
                  className={`font-mono text-[9px] leading-[12px] text-amber ${narrow ? 'max-w-full truncate px-0.5' : ''}`}
                  data-testid={`stint-pit-${i}`}
                >
                  {isLast
                    ? t('finish')
                    : narrow
                      ? `V${stint.toLap}`
                      : t('pit', { lap: stint.toLap })}
                </span>
              </motion.div>
            );
          })}
          {/* pit-lap flags on the stint bar (v0.6.0) */}
          {pitLaps.map((lap) => (
            <span
              key={lap}
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0 top-0 w-px bg-amber"
              style={{ left: `${Math.min(100, (lap / totalLaps) * 100)}%` }}
              title={`Pit: vòng ${lap}`}
            />
          ))}
        </div>
        {/* lap axis — the stint chart's shared x scale */}
        <div className="mt-1 flex justify-between font-mono text-[10px] text-ink-faint" aria-hidden="true">
          {axisTicks.map((lap, i) => (
            <span key={i}>{i === 0 ? 'L0' : `L${lap}`}</span>
          ))}
        </div>
      </div>
      {pitLaps.length > 0 ? (
        <div className="mt-1 flex justify-between font-mono text-[10px] text-ink-faint">
          <span>
            Pit: {pitLaps.join(', ')}
          </span>
          <span>
            {stints[0]?.fromLap}–{stints[stints.length - 1]?.toLap} / {totalLaps} vòng
          </span>
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {Array.from(new Set(stints.map((s) => s.compound))).map((c) => (
          <CompoundBadge key={c} compound={c} size="sm" showLabel />
        ))}
      </div>
    </div>
  );
}
