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

import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { CompoundBadge, type CompoundKey } from './CompoundBadge';
import { cn } from '@/lib/utils';

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

/** v0.10.0 step 1 — the simulator's motion law (skill motion rules): layout
 *  springs (stiffness/damping tuned like NumberTween for a < 300 ms settle),
 *  never CSS width transitions; under prefers-reduced-motion everything
 *  renders its final state immediately. */
const SIM_SPRING = { type: 'spring' as const, stiffness: 320, damping: 30 };

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

/**
 * v0.10.0 step 1 — SimTimeline: the free-form simulator's face.
 *
 * Same math and colours as StintTimeline above (real lap axis 0 →
 * totalLaps, compound colours, compact labels under 12%), extended with the
 * EDITOR's overlays and interactions:
 *
 *  · amber dashed bands for each SC/VSC event, blue bands for each rain
 *    window — both absolutely positioned over the same lap axis;
 *  · segments are BUTTONS that focus their stint row in the editor (the
 *    click-through is wired by TyreLabView via `onSegmentClick`);
 *  · hover/focus shows a TEXT tooltip (compound, lap range, assigned set,
 *    wear) — never colour-only (skill chart rule). Set/wear info arrives
 *    only when the CURRENT draft is priced: under an error draft the
 *    last-good plan prices DIFFERENT stints, so only geometry is truthful;
 *  · segments and bands animate with framer-motion `layout` springs —
 *    never CSS width transitions, instant under prefers-reduced-motion.
 *
 * Pure presentational; every number comes from the live draft (simStints /
 * simRanges / simEvents / simRain) — no engine call of its own.
 */
export interface SimTimelineSetInfo {
  setUsed?: { tyreSetId: number; fresh: boolean; life: number } | null;
  wearS?: number;
}

export function SimTimeline({
  stints,
  totalLaps,
  events = [],
  rain = [],
  setInfo,
  activeSegment = null,
  onSegmentClick,
}: {
  stints: TimelineStint[];
  totalLaps: number;
  events?: Array<{ startLap: number; laps: number }>;
  rain?: Array<{ startLap: number; laps: number }>;
  setInfo?: Array<SimTimelineSetInfo | undefined>;
  activeSegment?: number | null;
  onSegmentClick?: (i: number) => void;
}) {
  const tTyres = useTranslations('tyres');
  const tWhat = useTranslations('whatif');
  const reduceMotion = useReducedMotion();
  const [tipSeg, setTipSeg] = useState<number | null>(null);
  if (stints.length === 0 || totalLaps <= 0) return null;

  const pct = (laps: number) => (laps / totalLaps) * 100;
  const axisTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * totalLaps));
  const spring = reduceMotion ? { duration: 0 } : SIM_SPRING;

  /* tooltip target — guarded: a stale index (list shrank while hovered)
     yields undefined, which renders nothing */
  const tip = tipSeg != null ? stints[tipSeg] : undefined;
  const tipInfo = tipSeg != null ? setInfo?.[tipSeg] : undefined;
  const tipLeft =
    tip != null
      ? Math.min(
          92,
          Math.max(
            8,
            pct(stints.slice(0, tipSeg!).reduce((s, st) => s + st.laps, 0) + tip.laps / 2),
          ),
        )
      : 0;

  return (
    <div className="relative">
      <div className="overflow-x-auto pitwall-scroll">
        {/* the bar — one flex row over the real lap axis; overlays sit on
            top, pointer-events-none so segment clicks pass through */}
        <div
          className="relative flex h-11 min-w-[300px] w-full overflow-hidden rounded border border-line bg-surface"
          data-testid="sim-timeline"
        >
          {stints.map((stint, i) => {
            const narrow = stint.laps / totalLaps < COMPACT_WIDTH_SHARE;
            return (
              <motion.button
                key={i}
                type="button"
                layout
                transition={spring}
                onClick={() => onSegmentClick?.(i)}
                onMouseEnter={() => setTipSeg(i)}
                onMouseLeave={() => setTipSeg((s) => (s === i ? null : s))}
                onFocus={() => setTipSeg(i)}
                onBlur={() => setTipSeg((s) => (s === i ? null : s))}
                aria-label={tWhat('simTimelineGoTo', { n: i + 1 })}
                style={{ width: `${pct(stint.laps)}%` }}
                className={cn(
                  'relative flex min-w-0 cursor-pointer flex-col items-center justify-center border-r border-line bg-raised last:border-r-0',
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-teal',
                  activeSegment === i && 'ring-1 ring-inset ring-teal',
                )}
                data-testid={`sim-timeline-seg-${i}`}
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 h-0.5"
                  style={{ background: COMPOUND_COLOUR[stint.compound] ?? '#1d5f8a' }}
                />
                <span
                  className={`font-mono text-[10px] leading-[13px] text-ink ${narrow ? 'max-w-full truncate px-0.5' : ''}`}
                >
                  {`${stint.compound}·${stint.laps}`}
                </span>
                {!narrow ? (
                  <span className="font-mono text-[9px] leading-[12px] text-ink-faint">
                    {`V${stint.fromLap}–${stint.toLap}`}
                  </span>
                ) : null}
              </motion.button>
            );
          })}
          {/* pit flags at every stint boundary (the draft's own pits) */}
          {stints.slice(0, -1).map((stint, i) => (
            <span
              key={`flag-${i}`}
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0 top-0 w-px bg-amber"
              style={{ left: `${pct(stint.toLap)}%` }}
              data-testid={`sim-timeline-pit-${stint.toLap}`}
            />
          ))}
          {/* SC/VSC event bands — amber, dashed, over the exact window */}
          {events.map((ev, i) =>
            !Number.isFinite(ev.startLap) || !Number.isFinite(ev.laps) || ev.laps <= 0 || ev.startLap < 1 ? null : (
              <motion.span
                key={`ev-${i}`}
                layout
                transition={spring}
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 border border-dashed border-amber bg-amber/20"
                style={{ left: `${pct(ev.startLap - 1)}%`, width: `${pct(ev.laps)}%` }}
                data-testid={`sim-timeline-event-${i}`}
              />
            ),
          )}
          {/* rain window bands — info blue, over the exact window */}
          {rain.map((rw, i) =>
            !Number.isFinite(rw.startLap) || !Number.isFinite(rw.laps) || rw.laps <= 0 || rw.startLap < 1 ? null : (
              <motion.span
                key={`rain-${i}`}
                layout
                transition={spring}
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 border-x border-info bg-info/20"
                style={{ left: `${pct(rw.startLap - 1)}%`, width: `${pct(rw.laps)}%` }}
                data-testid={`sim-timeline-rain-${i}`}
              />
            ),
          )}
        </div>
        {/* lap axis — the same shared x scale as StintTimeline */}
        <div className="mt-1 flex justify-between font-mono text-[10px] text-ink-faint" aria-hidden="true">
          {axisTicks.map((lap, i) => (
            <span key={i}>{i === 0 ? 'L0' : `L${lap}`}</span>
          ))}
        </div>
      </div>
      {/* the text tooltip (skill chart rule: never colour-only). Absolute —
          no layout shift, floats under the bar. */}
      {tip != null ? (
        <p
          className="pointer-events-none absolute top-full z-10 mt-1 max-w-[92%] -translate-x-1/2 truncate rounded border border-line-strong bg-raised px-2 py-1 font-mono text-[10px] text-ink"
          style={{ left: `${tipLeft}%` }}
          data-testid="sim-timeline-tooltip"
        >
          {[
            `${tip.compound} · V${tip.fromLap}–${tip.toLap}`,
            ...(tipInfo?.setUsed
              ? [
                  tipInfo.setUsed.fresh
                    ? tTyres('inventory.setFresh', { id: tipInfo.setUsed.tyreSetId, life: tipInfo.setUsed.life })
                    : tTyres('inventory.setUsed', { id: tipInfo.setUsed.tyreSetId, life: tipInfo.setUsed.life }),
                ]
              : []),
            ...(tipInfo?.wearS != null
              ? [tTyres('split.wearCost', { sign: tipInfo.wearS > 0 ? '+' : '−', time: Math.abs(tipInfo.wearS).toFixed(1) })]
              : []),
          ].join(' · ')}
        </p>
      ) : null}
    </div>
  );
}
