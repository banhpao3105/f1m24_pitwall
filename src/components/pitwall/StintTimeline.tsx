'use client';

/**
 * StintTimeline — horizontal stint blocks with compound colours, lap counts
 * and pit-window markers (docs/04 §6.5). Pure presentational.
 */

import { motion } from 'framer-motion';
import { CompoundBadge, type CompoundKey } from './CompoundBadge';

export interface TimelineStint {
  compound: CompoundKey;
  laps: number;
  fromLap: number;
  toLap: number;
}

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
  return (
    <div data-testid="stint-timeline">
      {/* v0.5.0 mobile: scroll horizontally instead of crushing labels */}
      <div className="overflow-x-auto pitwall-scroll">
        <div className="flex h-9 min-w-[300px] w-full overflow-hidden rounded border border-line">
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
            <span className="pointer-events-none absolute inset-x-0 top-0 h-0.5"
              aria-hidden="true"
              data-compound={stint.compound}
              style={{
                background:
                  stint.compound === 'S' ? '#c8102e'
                  : stint.compound === 'M' ? '#e3b71e'
                  : stint.compound === 'H' ? '#e9e5dc'
                  : stint.compound === 'I' ? '#2fa84f'
                  : '#1d5f8a',
              }}
            />
            <span className="font-mono text-[10px] text-ink">
              {stint.compound}·{stint.laps}
            </span>
          </motion.div>
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
