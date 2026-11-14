'use client';

/**
 * StintTimeline — v0.6.0 step 3: full stint chart (prompt §3). Horizontal
 * stint blocks with compound colours over a REAL lap axis (0 → totalLaps
 * ticks) and on-bar pit-lap flags. Pure presentational; all numbers come
 * from the tyre engine's plan.
 */

import { motion } from 'framer-motion';
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

export function StintTimeline({
  stints,
  totalLaps,
  pitLaps = [],
}: {
  stints: TimelineStint[];
  totalLaps: number;
  pitLaps?: number[];
}) {
  if (stints.length === 0 || totalLaps <= 0) return null;
  const axisTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * totalLaps));

  return (
    <div data-testid="stint-timeline">
      {/* v0.5.0 mobile: scroll horizontally instead of crushing labels */}
      <div className="overflow-x-auto pitwall-scroll">
        {/* v0.6.0: the bar is position-relative so pit laps render as flags
            ON the lap axis of the plan, not only in the footer line */}
        <div className="relative h-9 min-w-[300px] w-full overflow-hidden rounded border border-line">
          {stints.map((stint, i) => (
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
              <span className="font-mono text-[10px] text-ink">
                {stint.compound}·{stint.laps}
              </span>
            </motion.div>
          ))}
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
