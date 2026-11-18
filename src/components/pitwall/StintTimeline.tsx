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

import { useState, useRef } from 'react';
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

/* v0.10.0 step 2 — exported for the simulator's compound segmented control
   (same hexes as CompoundBadge / chart-theme — the ONE colour law). */
export const COMPOUND_COLOUR: Record<string, string> = {
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
  onBoundaryChange,
  onEventChange,
  onRainChange,
}: {
  stints: TimelineStint[];
  totalLaps: number;
  events?: Array<{ mode?: 'sc' | 'vsc'; startLap: number; laps: number }>;
  rain?: Array<{ startLap: number; laps: number }>;
  setInfo?: Array<SimTimelineSetInfo | undefined>;
  activeSegment?: number | null;
  onSegmentClick?: (i: number) => void;
  /* v0.11.0 step 3 — the drag contract (Pointer Events native, no drag
     library): the timeline CLAMPS geometry (stint ≥ 4 laps, band inside
     [1, totalLaps], integer-lap snap) and reports COMMITTED lap values on
     every pointermove; the owner re-prices the draft live. */
  onBoundaryChange?: (boundaryIndex: number, lap: number) => void;
  onEventChange?: (i: number, next: { startLap: number; laps: number }) => void;
  onRainChange?: (i: number, next: { startLap: number; laps: number }) => void;
}) {
  const tTyres = useTranslations('tyres');
  const tWhat = useTranslations('whatif');
  const reduceMotion = useReducedMotion();
  const [tipSeg, setTipSeg] = useState<number | null>(null);
  /* v0.11.0 step 3 — drag machinery: one active drag at a time, the drag's
     ORIGINAL value travels with it so the tooltip can say "V19 → V25". */
  const barRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<
    | null
    | {
        kind: 'boundary' | 'band-move' | 'band-start' | 'band-end';
        layer: 'event' | 'rain';
        index: number;
        pointerId: number;
        origin: number;
        grabOffset: number;
      }
  >(null);
  const [dragTip, setDragTip] = useState<{ text: string; left: number } | null>(null);
  if (stints.length === 0 || totalLaps <= 0) return null;

  const pct = (laps: number) => (laps / totalLaps) * 100;
  const axisTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * totalLaps));
  const spring = reduceMotion ? { duration: 0 } : SIM_SPRING;
  /* v0.10.0 step 3 — bands carry a small text tag (SC / VSC / MƯA) once
     they are wide enough to hold one (≥ 8% of the bar): the meaning is
     never colour-only (skill chart rule). */
  const BAND_TAG_SHARE = 0.08;

  /* pointer x → integer lap, clamped onto the bar */
  const lapFromClientX = (clientX: number): number => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return 0;
    const ratio = (clientX - rect.left) / rect.width;
    return Math.min(totalLaps, Math.max(0, Math.round(ratio * totalLaps)));
  };

  /* ── geometry clamps (the prompt's law: stint ≥ 4 laps, band inside the
     race; set-life violations stay HONEST engine errors, not UI clamps) ── */
  const boundaries = stints.slice(0, -1).map((st) => st.toLap);
  const boundaryClamp = (i: number): { min: number; max: number } => ({
    min: i === 0 ? 4 : boundaries[i - 1]! + 4,
    max: i === boundaries.length - 1 ? totalLaps - 4 : boundaries[i + 1]! - 4,
  });
  const bandClamp = (laps: number): { minStart: number; maxStart: number } => ({
    minStart: 1,
    maxStart: Math.max(1, totalLaps - laps + 1),
  });

  const beginDrag = (
    e: React.PointerEvent,
    kind: 'boundary' | 'band-move' | 'band-start' | 'band-end',
    layer: 'event' | 'rain' | 'boundary',
    index: number,
    origin: number,
  ): void => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const pointerLap = lapFromClientX(e.clientX);
    dragRef.current = {
      kind,
      layer: layer === 'boundary' ? 'event' : layer,
      index,
      pointerId: e.pointerId,
      origin,
      grabOffset: kind === 'band-move' ? pointerLap - origin : 0,
    };
  };

  const onDragMove = (e: React.PointerEvent): void => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const lap = lapFromClientX(e.clientX);
    if (d.kind === 'boundary') {
      const { min, max } = boundaryClamp(d.index);
      const next = Math.min(max, Math.max(min, lap));
      setDragTip({ text: `V${d.origin} → V${next}`, left: pct(next) });
      if (next !== boundaries[d.index]) onBoundaryChange?.(d.index, next);
      return;
    }
    const list = d.layer === 'event' ? events : rain;
    const band = list[d.index];
    if (!band) return;
    const end = band.startLap + band.laps - 1;
    if (d.kind === 'band-move') {
      const { minStart, maxStart } = bandClamp(band.laps);
      const next = Math.min(maxStart, Math.max(minStart, lap - d.grabOffset));
      setDragTip({ text: `V${d.origin} → V${next}`, left: pct(next + band.laps / 2) });
      if (next !== band.startLap) {
        const fn = d.layer === 'event' ? onEventChange : onRainChange;
        fn?.(d.index, { startLap: next, laps: band.laps });
      }
      return;
    }
    if (d.kind === 'band-start') {
      const next = Math.min(end, Math.max(1, lap));
      const nextLaps = end - next + 1;
      setDragTip({
        text: `V${d.origin}–V${end} → V${next}–V${end}`,
        left: pct(next + nextLaps / 2),
      });
      if (next !== band.startLap) {
        const fn = d.layer === 'event' ? onEventChange : onRainChange;
        fn?.(d.index, { startLap: next, laps: nextLaps });
      }
      return;
    }
    /* band-end */
    const nextEnd = Math.min(totalLaps, Math.max(band.startLap, lap));
    const nextLaps = nextEnd - band.startLap + 1;
    setDragTip({
      text: `V${band.startLap}–V${d.origin} → V${band.startLap}–V${nextEnd}`,
      left: pct(band.startLap + nextLaps / 2),
    });
    if (nextEnd !== end) {
      const fn = d.layer === 'event' ? onEventChange : onRainChange;
      fn?.(d.index, { startLap: band.startLap, laps: nextLaps });
    }
  };

  const endDrag = (e: React.PointerEvent): void => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    dragRef.current = null;
    setDragTip(null);
  };

  /* keyboard parity — arrows ±1, Shift ±5, Home/End to the clamp */
  const onHandleKeyDown = (
    e: React.KeyboardEvent,
    apply: (next: number) => void,
    min: number,
    max: number,
    current: number,
  ): void => {
    const step = e.shiftKey ? 5 : 1;
    let next: number | null = null;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(min, current - step);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = Math.min(max, current + step);
    else if (e.key === 'Home') next = min;
    else if (e.key === 'End') next = max;
    if (next == null) return;
    e.preventDefault();
    e.stopPropagation();
    apply(next);
  };

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
        {/* the bar — one flex row over the real lap axis. v0.11.0 step 3:
            the overlays are INTERACTIVE (boundary handles drag the stint
            edge, band bodies move, band edges resize — Pointer Events with
            integer-lap snap and geometry clamps) when wired. */}
        <div
          ref={barRef}
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
                  'relative flex min-w-0 cursor-pointer flex-col items-center justify-center border-r border-line bg-raised transition-colors last:border-r-0 hover:bg-line/40',
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
          {/* pit flags at every stint boundary. v0.11.0 step 3 — wired
              timelines turn each flag into a DRAG HANDLE + keyboard slider
              (arrows ±1, Shift ±5, Home/End to the clamp); unwired ones
              (lead/trail contexts) stay decorative. */}
          {stints.slice(0, -1).map((stint, i) => {
            const clamp2 = boundaryClamp(i);
            const handle = onBoundaryChange != null;
            return handle ? (
              <span
                key={`flag-${i}`}
                role="slider"
                tabIndex={0}
                aria-label={tWhat('simTimelineBoundary', { n: i + 1 })}
                aria-valuemin={clamp2.min}
                aria-valuemax={clamp2.max}
                aria-valuenow={stint.toLap}
                aria-valuetext={`V${stint.toLap}`}
                aria-orientation="horizontal"
                style={{ left: `${pct(stint.toLap)}%` }}
                onPointerDown={(e) => beginDrag(e, 'boundary', 'boundary', i, stint.toLap)}
                onPointerMove={onDragMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onKeyDown={(e) =>
                  onHandleKeyDown(e, (next) => onBoundaryChange?.(i, next), clamp2.min, clamp2.max, stint.toLap)
                }
                className="absolute bottom-0 top-0 z-[5] w-3 -translate-x-1/2 cursor-col-resize touch-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-teal"
                data-testid={`sim-timeline-boundary-${i}`}
              >
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 top-0 left-1/2 w-px -translate-x-1/2 bg-amber"
                  /* v0.11.0 step 3 — the v0.10.0 flag testid survives: the
                     amber line IS the pit flag, now carried by its handle */
                  data-testid={`sim-timeline-pit-${stint.toLap}`}
                />
              </span>
            ) : (
              <span
                key={`flag-${i}`}
                aria-hidden="true"
                className="pointer-events-none absolute bottom-0 top-0 w-px bg-amber"
                style={{ left: `${pct(stint.toLap)}%` }}
                data-testid={`sim-timeline-pit-${stint.toLap}`}
              />
            );
          })}
          {/* SC/VSC event bands — amber, dashed, over the exact window.
              v0.11.0 step 3 — wired timelines make the body a MOVE handle
              and the edges RESIZE handles (role slider + keyboard parity). */}
          {events.map((ev, i) =>
            !Number.isFinite(ev.startLap) || !Number.isFinite(ev.laps) || ev.laps <= 0 || ev.startLap < 1 ? null : (
              <motion.span
                key={`ev-${i}`}
                layout
                transition={spring}
                className="bg-amber/20"
                style={{ left: `${pct(ev.startLap - 1)}%`, width: `${pct(ev.laps)}%` }}
                data-testid={`sim-timeline-event-${i}`}
              >
                {onEventChange != null ? (
                  <>
                    <span
                      role="slider"
                      tabIndex={0}
                      aria-label={tWhat('simTimelineBandMove', { n: i + 1 })}
                      aria-valuemin={bandClamp(ev.laps).minStart}
                      aria-valuemax={bandClamp(ev.laps).maxStart}
                      aria-valuenow={ev.startLap}
                      aria-valuetext={`V${ev.startLap}–V${ev.startLap + ev.laps - 1}`}
                      aria-orientation="horizontal"
                      onPointerDown={(e) => beginDrag(e, 'band-move', 'event', i, ev.startLap)}
                      onPointerMove={onDragMove}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                      onKeyDown={(e) =>
                        onHandleKeyDown(
                          e,
                          (next) => onEventChange?.(i, { startLap: next, laps: ev.laps }),
                          bandClamp(ev.laps).minStart,
                          bandClamp(ev.laps).maxStart,
                          ev.startLap,
                        )
                      }
                      className="absolute inset-y-0 inset-x-0 cursor-move touch-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-amber"
                      data-testid={`sim-timeline-event-${i}-move`}
                    >
                      {ev.laps / totalLaps >= BAND_TAG_SHARE ? (
                        <span
                          className="pointer-events-none absolute inset-y-0 left-1 flex items-center font-mono text-[9px] font-bold uppercase tracking-wide text-amber"
                          data-testid={`sim-timeline-event-tag-${i}`}
                        >
                          {ev.mode === 'vsc' ? 'VSC' : 'SC'}
                        </span>
                      ) : null}
                    </span>
                    <span
                      role="slider"
                      tabIndex={0}
                      aria-label={tWhat('simTimelineBandStart', { n: i + 1 })}
                      aria-valuemin={1}
                      aria-valuemax={ev.startLap + ev.laps - 1}
                      aria-valuenow={ev.startLap}
                      aria-valuetext={`V${ev.startLap}`}
                      aria-orientation="horizontal"
                      onPointerDown={(e) => beginDrag(e, 'band-start', 'event', i, ev.startLap)}
                      onPointerMove={onDragMove}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                      onKeyDown={(e) =>
                        onHandleKeyDown(
                          e,
                          (next) =>
                            onEventChange?.(i, { startLap: next, laps: ev.startLap + ev.laps - next }),
                          1,
                          ev.startLap + ev.laps - 1,
                          ev.startLap,
                        )
                      }
                      className="absolute inset-y-0 left-0 z-[6] w-2.5 cursor-ew-resize touch-none border-l-2 border-dashed border-amber focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-amber"
                      data-testid={`sim-timeline-event-${i}-resize-start`}
                    />
                    <span
                      role="slider"
                      tabIndex={0}
                      aria-label={tWhat('simTimelineBandEnd', { n: i + 1 })}
                      aria-valuemin={ev.startLap}
                      aria-valuemax={totalLaps}
                      aria-valuenow={ev.startLap + ev.laps - 1}
                      aria-valuetext={`V${ev.startLap + ev.laps - 1}`}
                      aria-orientation="horizontal"
                      onPointerDown={(e) =>
                        beginDrag(e, 'band-end', 'event', i, ev.startLap + ev.laps - 1)
                      }
                      onPointerMove={onDragMove}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                      onKeyDown={(e) =>
                        onHandleKeyDown(
                          e,
                          (next) =>
                            onEventChange?.(i, { startLap: ev.startLap, laps: next - ev.startLap + 1 }),
                          ev.startLap,
                          totalLaps,
                          ev.startLap + ev.laps - 1,
                        )
                      }
                      className="absolute inset-y-0 right-0 z-[6] w-2.5 cursor-ew-resize touch-none border-r-2 border-dashed border-amber focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-amber"
                      data-testid={`sim-timeline-event-${i}-resize-end`}
                    />
                  </>
                ) : (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 border border-dashed border-amber"
                  >
                    {ev.laps / totalLaps >= BAND_TAG_SHARE ? (
                      <span
                        className="absolute inset-y-0 left-1 flex items-center font-mono text-[9px] font-bold uppercase tracking-wide text-amber"
                        data-testid={`sim-timeline-event-tag-${i}`}
                      >
                        {ev.mode === 'vsc' ? 'VSC' : 'SC'}
                      </span>
                    ) : null}
                  </span>
                )}
              </motion.span>
            ),
          )}
          {/* rain window bands — info blue, over the exact window */}
          {rain.map((rw, i) =>
            !Number.isFinite(rw.startLap) || !Number.isFinite(rw.laps) || rw.laps <= 0 || rw.startLap < 1 ? null : (
              <motion.span
                key={`rain-${i}`}
                layout
                transition={spring}
                className="bg-info/20"
                style={{ left: `${pct(rw.startLap - 1)}%`, width: `${pct(rw.laps)}%` }}
                data-testid={`sim-timeline-rain-${i}`}
              >
                {onRainChange != null ? (
                  <>
                    <span
                      role="slider"
                      tabIndex={0}
                      aria-label={tWhat('simTimelineBandMove', { n: i + 1 })}
                      aria-valuemin={bandClamp(rw.laps).minStart}
                      aria-valuemax={bandClamp(rw.laps).maxStart}
                      aria-valuenow={rw.startLap}
                      aria-valuetext={`V${rw.startLap}–V${rw.startLap + rw.laps - 1}`}
                      aria-orientation="horizontal"
                      onPointerDown={(e) => beginDrag(e, 'band-move', 'rain', i, rw.startLap)}
                      onPointerMove={onDragMove}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                      onKeyDown={(e) =>
                        onHandleKeyDown(
                          e,
                          (next) => onRainChange?.(i, { startLap: next, laps: rw.laps }),
                          bandClamp(rw.laps).minStart,
                          bandClamp(rw.laps).maxStart,
                          rw.startLap,
                        )
                      }
                      className="absolute inset-y-0 inset-x-0 cursor-move touch-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-info"
                      data-testid={`sim-timeline-rain-${i}-move`}
                    >
                      {rw.laps / totalLaps >= BAND_TAG_SHARE ? (
                        <span
                          className="pointer-events-none absolute inset-y-0 left-1 flex items-center font-mono text-[9px] font-bold uppercase tracking-wide text-info"
                          data-testid={`sim-timeline-rain-tag-${i}`}
                        >
                          {tWhat('simTimelineRainTag')}
                        </span>
                      ) : null}
                    </span>
                    <span
                      role="slider"
                      tabIndex={0}
                      aria-label={tWhat('simTimelineBandStart', { n: i + 1 })}
                      aria-valuemin={1}
                      aria-valuemax={rw.startLap + rw.laps - 1}
                      aria-valuenow={rw.startLap}
                      aria-valuetext={`V${rw.startLap}`}
                      aria-orientation="horizontal"
                      onPointerDown={(e) => beginDrag(e, 'band-start', 'rain', i, rw.startLap)}
                      onPointerMove={onDragMove}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                      onKeyDown={(e) =>
                        onHandleKeyDown(
                          e,
                          (next) =>
                            onRainChange?.(i, { startLap: next, laps: rw.startLap + rw.laps - next }),
                          1,
                          rw.startLap + rw.laps - 1,
                          rw.startLap,
                        )
                      }
                      className="absolute inset-y-0 left-0 z-[6] w-2.5 cursor-ew-resize touch-none border-l-2 border-info focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-info"
                      data-testid={`sim-timeline-rain-${i}-resize-start`}
                    />
                    <span
                      role="slider"
                      tabIndex={0}
                      aria-label={tWhat('simTimelineBandEnd', { n: i + 1 })}
                      aria-valuemin={rw.startLap}
                      aria-valuemax={totalLaps}
                      aria-valuenow={rw.startLap + rw.laps - 1}
                      aria-valuetext={`V${rw.startLap + rw.laps - 1}`}
                      aria-orientation="horizontal"
                      onPointerDown={(e) =>
                        beginDrag(e, 'band-end', 'rain', i, rw.startLap + rw.laps - 1)
                      }
                      onPointerMove={onDragMove}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                      onKeyDown={(e) =>
                        onHandleKeyDown(
                          e,
                          (next) =>
                            onRainChange?.(i, { startLap: rw.startLap, laps: next - rw.startLap + 1 }),
                          rw.startLap,
                          totalLaps,
                          rw.startLap + rw.laps - 1,
                        )
                      }
                      className="absolute inset-y-0 right-0 z-[6] w-2.5 cursor-ew-resize touch-none border-r-2 border-info focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-info"
                      data-testid={`sim-timeline-rain-${i}-resize-end`}
                    />
                  </>
                ) : (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 border-x border-info"
                  >
                    {rw.laps / totalLaps >= BAND_TAG_SHARE ? (
                      <span
                        className="absolute inset-y-0 left-1 flex items-center font-mono text-[9px] font-bold uppercase tracking-wide text-info"
                        data-testid={`sim-timeline-rain-tag-${i}`}
                      >
                        {tWhat('simTimelineRainTag')}
                      </span>
                    ) : null}
                  </span>
                )}
              </motion.span>
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
      {/* the drag tooltip (V19 → V25) — lives ABOVE the hover tooltip,
          rendered only while a drag is active. Absolute — no layout shift. */}
      {dragTip != null ? (
        <p
          className="pointer-events-none absolute top-full z-20 mt-1 -translate-x-1/2 rounded border border-teal bg-raised px-2 py-1 font-mono text-[10px] font-semibold text-teal"
          style={{ left: `${Math.min(92, Math.max(8, dragTip.left))}%` }}
          data-testid="sim-timeline-drag-tip"
        >
          {dragTip.text}
        </p>
      ) : null}
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
