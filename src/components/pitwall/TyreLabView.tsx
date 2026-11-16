'use client';

/**
 * Tyre Lab — Phase 2 (docs/04 §7.3.3): hero recommendation card,
 * alternatives with time deltas, WHAT-IF (pit shift slider + rain toggle
 * — docs/03 §5.3), compound lives, observed data, provenance.
 */

import { useTranslations, useLocale } from 'next-intl';
import { useMemo, useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Waves, SlidersHorizontal, CloudRain, Flag, Activity, Bot, ClipboardCheck, Check, CircleAlert, ChevronDown, Minus, Plus, X } from 'lucide-react';
import type { SaveModel } from '@/domain/types';
import { trackDisplay } from '@/lib/track-display';
import { getTrackCorrection, putTrackCorrection, TRACK_CORRECTIONS_VERSION } from '@/lib/track-corrections';
import { useTyreLab } from '@/lib/engine-hooks';
import {
  whatIfPitShift,
  whatIfSCVSC,
  buildWetPlan,
  priceManualPlan,
  type TyreLabPrior,
  type PaceMeasuredEntry,
  type SimCompound,
  type ManualPlanResult,
} from '@/engines/tyre.engine';
import { RecommendationCard } from './RecommendationCard';
import { ConfidenceBadge } from './ConfidenceBadge';
import { StintTimeline, SimTimeline, COMPOUND_COLOUR, type TimelineStint } from './StintTimeline';
import { NumberTween } from './NumberTween';
import { PitWindowBar } from './PitWindowBar';
import { DegCurveChart } from './charts/DegCurveChart';
import { CompoundCompareChart } from './charts/CompoundCompareChart';
import { CompoundBadge, type CompoundKey } from './CompoundBadge';
import type { StrategyResult } from '@/engines/tyre.engine';
import type { InventoryCompoundAgg } from '@/engines/grid.engine';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

/**
 * v0.7.2 — the one aggregation renderer for the tyre-inventory section.
 * Used by the team-total line (teamAggregate) AND each car card
 * (car.aggregate) — identical rows, so the two scopes can never drift into
 * two formats. Degenerate ranges (min === max after display rounding)
 * collapse to a single value, per the owner-verified DoD strings:
 * "đã dùng ×1 (mòn 74%, đời 41)" and "đã dùng ×2 (mòn 55–57%, đời 20)".
 */
/**
 * v0.9.5 — the ONE display rule for a measured pace delta (all three faces
 * below read through it): a CLAMPED value is the model's opinion, never
 * the measurement — when `rawDelta` exists the UI shows THE RAW value
 * marked "discarded"; an unclamped entry shows `delta` (which IS the raw
 * measurement) exactly as before. Engine untouched — `rawDelta` has been
 * on the record since v0.6.1.
 */
const displayMeasured = (m: PaceMeasuredEntry | null) =>
  m == null ? null : { delta: m.rawDelta ?? m.delta, discarded: m.rawDelta != null };

/** One stint of the user-assembled plan (builder input). */
type SimCompoundKey = SimCompound;

/** Stable identities for the "unseeded" slices — a fresh [] literal each
 *  render would churn simResult's memo (and everything derived from it). */
const SIM_NO_EVENTS: SimEventRow[] = [];
const SIM_NO_RAIN: SimRainRow[] = [];

/* v0.10.0 step 2 — editor rows carry a client-side `id` so AnimatePresence
   can exit the RIGHT row (index keys shift on delete and the wrong row
   animates out). Engine inputs are mapped back to plain shapes at the
   price call — the engine never sees the ids. */
interface SimStintRow {
  id: string;
  compound: SimCompoundKey;
  laps: number;
}
interface SimEventRow {
  id: string;
  mode: 'sc' | 'vsc';
  startLap: number;
  laps: number;
}
interface SimRainRow {
  id: string;
  startLap: number;
  laps: number;
}

/** v0.9.7 — the simulator's editable draft: the seed key it was edited
 *  under + the three editor slices. Derivation, not an effect. */
interface SimDraft {
  seedKey: string;
  stints: SimStintRow[];
  events: SimEventRow[];
  rain: SimRainRow[];
}

function InventoryAggList({ rows }: { rows: InventoryCompoundAgg[] }) {
  const t = useTranslations('tyres');
  const span = (r: [number, number] | null, suffix = ''): string => {
    if (!r) return '—';
    const lo = Math.round(r[0]);
    const hi = Math.round(r[1]);
    return lo === hi ? `${lo}${suffix}` : `${lo}–${hi}${suffix}`;
  };
  return (
    <ul className="space-y-1">
      {rows
        .filter((a) => ['S', 'M', 'H'].includes(a.compound))
        .map((a) => (
          <li key={a.compound} className="flex items-center gap-2 text-[11px] text-ink-soft">
            <CompoundBadge compound={a.compound as CompoundKey} size="sm" />
            <span className="font-mono">
              {t('inventory.fresh', { n: a.fresh, life: a.freshLife ?? '—' })}
            </span>
            <span className="font-mono text-ink-faint">
              {t('inventory.used', {
                n: a.used,
                wear: a.usedWear ? span([a.usedWear[0] * 100, a.usedWear[1] * 100], '%') : '—',
                life: a.usedLife ? span(a.usedLife) : '—',
              })}
            </span>
          </li>
        ))}
    </ul>
  );
}

export function TyreLabView({
  model,
  raceId,
}: {
  model: SaveModel;
  raceId: number | null;
}) {
  const t = useTranslations('tyres');
  const tWhat = useTranslations('whatif');
  const tSec = useTranslations('sec');
  const locale = useLocale() as 'vi' | 'en';

  // what-if local state (docs/03 §5.3: pit sớm/muộn ±, toggle mưa)
  const [pitShift, setPitShift] = useState(0);
  const [rainOn, setRainOn] = useState(false);
  /* v0.9.9 — the pit-shift what-if section COLLAPSES when idle: the
     simulator is the main tool now, and the section's controls (slider,
     rain toggle) all start neutral. The initial value IS the idle check —
     state initializers run once at mount, when pitShift/rainOn are still
     their defaults — so an idle section starts closed, an active one
     starts open. The header stays visible either way and carries a status
     summary (whatifSummary). The old sections are NOT deleted — pit-shift
     (optimal-plan shifting), the SC/VSC card (top-6 ranking under one
     window) and the rain toggle (quick wet plan) each still do one thing
     the simulator does not. */
  const [whatIfOpen, setWhatIfOpen] = useState(pitShift !== 0 || rainOn);
  /* v0.9.2 — SC/VSC what-if state. startLap null = the plan's own first pit. */
  const [scOn, setScOn] = useState(false);
  const [scMode, setScMode] = useState<'sc' | 'vsc'>('sc');
  const [scStart, setScStart] = useState<number | null>(null);
  const [scLaps, setScLaps] = useState(3);

  const seasonRaces = model.races.filter((r) => r.seasonId === model.meta.seasonId);
  const race = seasonRaces.find((r) => r.raceId === raceId) ?? seasonRaces.find((r) => r.state !== 2) ?? seasonRaces.at(-1) ?? null;

  /* v0.5.1 P2 — local per-track correction prior (IndexedDB, local-only).
     Loaded before the engine runs so the confidence cap applies on first
     paint; scoped by trackId so a track switch hides the stale prior at
     render time (no synchronous setState inside the effect). */
  const [priorRecord, setPriorRecord] = useState<{ trackId: number; prior: TyreLabPrior } | null>(null);
  const trackId = race?.trackId ?? null;
  useEffect(() => {
    let cancelled = false;
    if (trackId == null) return;
    void getTrackCorrection(trackId).then((rec) => {
      if (cancelled || !rec || rec.trackId !== trackId) return;
      setPriorRecord({
        trackId,
        prior: {
          predictedStops: rec.predictedStops,
          fieldAvgStops: rec.fieldAvgStops,
          predictedPitLap: rec.predictedPitLap,
        },
      });
    });
    return () => {
      cancelled = true;
    };
  }, [trackId]);
  const prior = priorRecord && priorRecord.trackId === trackId ? priorRecord.prior : null;

  /* v0.6.2 (B2): run the lab on the RESOLVED race, not the raw URL param —
     ?view=tyres without &race= resolved `race` above but passed null here,
     rendering an empty lab on direct links/bookmarks. */
  const tyre = useTyreLab(race?.raceId ?? null, prior ? { prior } : undefined);

  /* v0.5.1 P2 — record the correction after a completed race: what the
     engine advised vs what the field actually did. Once per race+plan. */
  const capturedRef = useRef('');
  useEffect(() => {
    if (!tyre?.data.best || !race || race.state !== 2) return;
    const key = `${race.raceId}:${tyre.data.best.stops}`;
    if (capturedRef.current === key) return;
    capturedRef.current = key;
    const playerDriverIds = new Set(
      model.drivers
        .filter((d) => d.teamId === model.meta.playerTeamId)
        .map((d) => d.staffId),
    );
    void putTrackCorrection({
      trackId: race.trackId,
      raceId: race.raceId,
      seasonId: race.seasonId,
      savedAt: new Date().toISOString(),
      predictedStops: tyre.data.best.stops,
      predictedPitLap: tyre.data.best.pitLaps[0] ?? null,
      fieldAvgStops: tyre.data.observedStops?.avgStopsPerDriver ?? null,
      playerPitLaps: (race.pitStops ?? [])
        .filter((s) => playerDriverIds.has(s.driverId))
        .map((s) => s.lap),
      version: TRACK_CORRECTIONS_VERSION,
    });
  }, [tyre, race, model]);

  const whatIf = useMemo(() => {
    if (!tyre?.data.best) return null;
    return whatIfPitShift(
      tyre.data.best,
      tyre.data.laps,
      tyre.data.lives,
      tyre.data.deltas,
      tyre.data.pitCostS,
      pitShift,
    );
  }, [tyre, pitShift]);

  const wetPlan = useMemo(() => {
    if (!rainOn || !tyre) return null;
    /* v0.9.1 — the wet plan obeys the same set-assignment law: the I/W
       stints must be runnable on each car's OWN stock. */
    return buildWetPlan(model, tyre.data.laps, tyre.data.inventory);
  }, [model, rainOn, tyre]);

  /* v0.9.2 — SC/VSC what-if: the engine re-prices the lab's surviving
     plans with the track's real Races_Tracks columns; no plan is invented. */
  const scWhatIf = useMemo(() => {
    if (!scOn || !tyre?.data || !race) return null;
    const startLap = scStart ?? tyre.data.best?.pitLaps[0] ?? 1;
    return whatIfSCVSC(model, race.raceId, { mode: scMode, startLap, laps: scLaps });
  }, [model, race, scOn, scMode, scStart, scLaps, tyre]);

  /* Season interruption history from Races_Results (context line only —
     the counts the save does carry; no per-lap history exists). */
  const scHistory = useMemo(() => {
    const done = model.races.filter((r) => r.state === 2 && r.results.length > 0);
    return {
      sc: done.filter((r) => (r.results[0]?.safetyCarDeployments ?? 0) > 0).length,
      vsc: done.filter((r) => (r.results[0]?.vscDeployments ?? 0) > 0).length,
      total: done.length,
    };
  }, [model]);

  /* v0.9.7 — the free-form simulator: a self-contained SANDBOX. Local state
     only (never persisted); its results never touch lead/trail/best/game —
     it only ever compares against best via vsBest. Defaults (no effect, no
     cascading render — the draft carries the seed key it was edited under,
     so a changed race/plan re-seeds by falling back to the fresh copy):
     car = Xe 1, stints = a copy of the lead plan, events/rain empty. */
  const [simCar, setSimCar] = useState(0);
  const [simDraft, setSimDraft] = useState<SimDraft>({
    seedKey: '', stints: [], events: [], rain: [],
  });
  const simSeedPlan = tyre?.data.carPlans?.lead.plan ?? tyre?.data.best ?? null;
  const simSeedKey = simSeedPlan
    ? `${race?.raceId ?? ''}@${simSeedPlan.stints.map((s) => `${s.compound}${s.laps}`).join('/')}`
    : '';
  /* the seed copy is memoized: same VALUES as before, but a stable identity
     so simResult's memo (and the last-good effect below) only re-run when
     the seed actually changes — not on every unrelated re-render.
     v0.10.0 step 2 — seed rows get ids derived from their position in the
     plan ('seed-{i}'): stable while unseeded, carried into the draft on
     the first edit, so AnimatePresence keys survive the seed adoption. */
  const simSeedStints: SimStintRow[] = useMemo(
    () =>
      simSeedPlan
        ? simSeedPlan.stints.map((s, i) => ({
            id: `seed-${i}`,
            compound: s.compound as SimCompound,
            laps: s.laps,
          }))
        : [],
    [simSeedPlan],
  );
  const simSeeded = simSeedKey !== '' && simDraft.seedKey === simSeedKey;
  const simStints = simSeeded ? simDraft.stints : simSeedStints;
  const simEvents = simSeeded ? simDraft.events : SIM_NO_EVENTS;
  const simRain = simSeeded ? simDraft.rain : SIM_NO_RAIN;
  /* v0.10.0 step 2 — row id sequence for rows the USER creates (added
     stints/events/rain). Seed rows use 'seed-{i}'; user rows count up. */
  const simIdSeq = useRef(0);
  const nextSimId = (): string => `row-${++simIdSeq.current}`;
  /** Every edit writes through with the CURRENT seed key — an edit under an
      old seed adopts the new seed so the draft keeps applying. */
  const updateSim = (patch: Partial<Omit<SimDraft, 'seedKey'>>): void =>
    setSimDraft({
      seedKey: simSeedKey,
      stints: simStints,
      events: simEvents,
      rain: simRain,
      ...patch,
    });
  const simCars = tyre?.data.inventory?.cars ?? [];
  const simResult = useMemo(() => {
    if (!race || simStints.length === 0) return null;
    /* strip the client-side row ids — the engine receives plain inputs */
    return priceManualPlan(
      model,
      race.raceId,
      simCar,
      simStints.map(({ compound, laps }) => ({ compound, laps })),
      {
        events: simEvents.map(({ mode, startLap, laps }) => ({ mode, startLap, laps })),
        rain: simRain.map(({ startLap, laps }) => ({ startLap, laps })),
      },
    );
  }, [model, race, simCar, simStints, simEvents, simRain]);
  /* v0.9.9 — the last VALID sandbox price. An error draft renders the red
     banner on top AND this result dimmed — the old behavior (errors
     replacing the whole result) hid the numbers the user was iterating
     on. Set DURING RENDER via the documented "adjust state when a value
     changes" pattern (no effect → no cascading commit): whenever simResult
     changes identity, remember it if it priced OK. If the seed itself were
     invalid there is nothing to keep, and only the errors show. */
  const [lastGoodSim, setLastGoodSim] = useState<
    Extract<ManualPlanResult, { ok: true }> | null
  >(null);
  const [pricedSim, setPricedSim] = useState<ManualPlanResult | null>(null);
  if (simResult !== pricedSim) {
    setPricedSim(simResult);
    if (simResult != null && simResult.ok) setLastGoodSim(simResult);
  }
  /* v0.9.9 — derived, stateless: the live draft's cumulative lap ranges
     (S19/S19/M18 → V1–19 · V20–38 · V39–56), its lap sum (the live total
     line) and its first pit lap — the sensible default start for a new
     SC/VSC event or rain window (fallback: mid-race ⌈laps/2⌉ when the
     draft has no pit at all). No new state — recomputed from simStints. */
  const simLapsTotal = tyre?.data.laps ?? null;
  const simSumLaps = simStints.reduce((s, st) => s + st.laps, 0);
  /* cumulative boundaries, purely derived (≤4 stints, so the O(n²) reduce
     is free): stint i runs from sum(laps[0..i-1])+1 to sum(laps[0..i]) */
  const simRanges = simStints.map((_, i) => ({
    from: simStints.slice(0, i).reduce((s, st) => s + st.laps, 0) + 1,
    to: simStints.slice(0, i + 1).reduce((s, st) => s + st.laps, 0),
  }));
  /* the draft's FIRST pit lap = the first stint boundary (pits sit between
     stints; a 1-stint draft has no pit → mid-race fallback ⌈laps/2⌉) */
  const simFirstPit =
    simStints.length > 1
      ? Math.max(1, simStints[0]!.laps)
      : simLapsTotal != null
        ? Math.max(1, Math.ceil(simLapsTotal / 2))
        : 1;
  /* v0.10.0 step 1 — the timeline's inputs, derived like simRanges:
     geometry from the live draft; set/wear info ONLY when the current draft
     is priced (a last-good plan under an error draft prices DIFFERENT
     stints, so its set numbers would lie about the draft's segments — the
     tooltip falls back to geometry-only). */
  const simTimelineStints: TimelineStint[] = simStints.map((st, i) => ({
    compound: st.compound as CompoundKey,
    laps: st.laps,
    fromLap: simRanges[i]!.from,
    toLap: simRanges[i]!.to,
  }));
  const simPricedPlan = simResult != null && simResult.ok ? simResult.plan : null;
  const simSetInfo = simStints.map((_, i) => ({
    setUsed: simPricedPlan?.stints[i]?.setUsed ?? undefined,
    wearS: simPricedPlan?.stints[i]?.wearS,
  }));
  /* v0.10.0 step 1 — segment click-through: clicking a timeline segment
     scrolls to and focuses that stint row in the editor, with a teal ring
     that switches off after 1.5s. Smooth scroll honours reduced motion. */
  const [activeSimSeg, setActiveSimSeg] = useState<number | null>(null);
  const simStintRowRefs = useRef<Array<HTMLLIElement | null>>([]);
  const activeSegTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const simReduceMotion = useReducedMotion();
  useEffect(() => {
    return () => {
      if (activeSegTimer.current != null) clearTimeout(activeSegTimer.current);
    };
  }, []);
  const focusSimStint = (i: number): void => {
    const row = simStintRowRefs.current[i];
    if (!row) return;
    row.scrollIntoView?.({ block: 'nearest', behavior: simReduceMotion ? 'auto' : 'smooth' });
    const input = row.querySelector('input[type="number"]');
    (input as HTMLElement | null)?.focus({ preventScroll: true });
    setActiveSimSeg(i);
    if (activeSegTimer.current != null) clearTimeout(activeSegTimer.current);
    activeSegTimer.current = setTimeout(() => setActiveSimSeg(null), 1500);
  };
  /* the wet preset: buildWetPlan's stints become the builder's starting
     point — only when the save can build one at all */
  const wetPreset = useMemo(() => {
    if (!tyre?.data) return null;
    return buildWetPlan(model, tyre.data.laps, tyre.data.inventory);
  }, [model, tyre]);

  /* v0.9.9 — one renderer for a valid sandbox price, shared verbatim by
     the fresh face and the dimmed last-good face of the result area. */
  const renderSimPlan = (res: Extract<ManualPlanResult, { ok: true }>) => (
    <div className="space-y-2">
      <p className="font-mono text-sm text-ink" data-testid="sim-plan-line">
        {res.plan.stints.map((st) => `${st.compound}(${st.laps})`).join(' → ')}
        {' — '}
        {res.plan.stops} pit
        {res.plan.pitLaps.length > 0
          ? ` (${res.plan.pitLaps.map((p) => `V${p}`).join(', ')})`
          : ''}
      </p>
      {/* v0.10.0 step 1 — the hero row: the total is THE number of this
          sandbox (big mono, teal glow — the only glow in the section) and
          it tweens via NumberTween (instant under reduced motion). The
          vs-best chip is coloured by its sign: faster than best → good,
          tie → teal, slower → danger. The wear chip keeps its v0.9.9 face. */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span
          className="font-mono text-3xl font-semibold leading-none text-ink"
          style={{ textShadow: '0 0 14px rgba(46, 230, 200, 0.35)' }}
          data-testid="sim-total"
        >
          <NumberTween value={res.plan.timeS} format={(n) => `${n.toFixed(1)}s`} />
        </span>
        {res.plan.wearS != null ? (
          <span className="font-mono text-[10px] text-ink-faint" data-testid="sim-wear">
            {t('split.wearCost', {
              sign: res.plan.wearS > 0 ? '+' : '−',
              time: Math.abs(res.plan.wearS).toFixed(1),
            })}
          </span>
        ) : null}
        {res.plan.vsBestS != null ? (
          /* v0.9.9 — |vsBestS| < 0.05 (the SAME ±0.05 neutral band
             the pit-shift chip already uses) is a TIE: the old ternary
             rendered "−0.0s" for exactly zero. Outside the band the
             signed format stands, unchanged. */
          Math.abs(res.plan.vsBestS) < 0.05 ? (
            <span
              className="font-mono text-xs text-teal"
              data-testid="sim-vs-best"
            >
              {tWhat('simVsBestTie')}
            </span>
          ) : (
            <span
              className={cn(
                'font-mono text-xs',
                res.plan.vsBestS < 0 ? 'text-good' : 'text-danger',
              )}
              data-testid="sim-vs-best"
            >
              {tWhat('simVsBest', {
                delta: `${
                  res.plan.vsBestS > 0 ? '+' : '−'
                }${Math.abs(res.plan.vsBestS).toFixed(1)}`,
              })}
            </span>
          )
        ) : null}
      </div>
      <table className="w-full text-left text-xs" data-testid="sim-stint-table">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-ink-faint">
            <th className="py-1 pr-2 font-medium">{t('table.stint')}</th>
            <th className="py-1 pr-2 font-medium">{t('table.compound')}</th>
            <th className="py-1 pr-2 font-medium">{t('table.laps')}</th>
            <th className="py-1 pr-2 font-medium">{t('table.range')}</th>
            <th className="py-1 pr-2 font-medium">{t('inventory.setCol')}</th>
            <th className="py-1 font-medium">{t('split.wearCost', { sign: '', time: '' }).split(':')[0]}</th>
          </tr>
        </thead>
        <tbody>
          {res.plan.stints.map((st, i) => (
            <tr key={i} className="border-t border-line">
              <td className="py-1.5 pr-2 font-mono text-ink-faint">#{i + 1}</td>
              <td className="py-1.5 pr-2">
                <CompoundBadge compound={st.compound as CompoundKey} size="sm" showLabel />
              </td>
              <td className="py-1.5 pr-2 font-mono text-ink">{st.laps}</td>
              <td className="py-1.5 pr-2 font-mono text-ink-soft">
                {st.fromLap}–{st.toLap}
              </td>
              <td className="py-1.5 pr-2 font-mono text-[10px] text-ink-soft">
                {st.setUsed && st.setUsed.fresh
                  ? t('inventory.setFresh', { id: st.setUsed.tyreSetId, life: st.setUsed.life })
                  : st.setUsed
                    ? t('inventory.setUsed', { id: st.setUsed.tyreSetId, life: st.setUsed.life })
                    : '—'}
              </td>
              <td className="py-1.5 font-mono text-[10px] text-ink-faint">
                {st.wearS != null
                  ? `${st.wearS > 0 ? '+' : '−'}${Math.abs(st.wearS).toFixed(1)}s`
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {res.assumptions.length > 0 ? (
        <ul className="space-y-1 border-t border-line pt-2" data-testid="sim-assumptions">
          {res.assumptions.map((a, i) => (
            <li key={i} className="text-[11px] text-ink-faint">
              — {a}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );

  if (!race) {
    return (
      <p className="rounded-lg border border-line bg-panel p-6 text-sm text-ink-faint">
        {t('noRace')}
      </p>
    );
  }

  /* v0.7.0 strategy data gate — before allocation + practice + quali the
     lab renders the missing-data checklist INSTEAD of any plan (spec bước
     2: web không được đưa ra dự đoán nào cho đến khi có save sau quali). */
  const notReady = tyre != null && !tyre.data.readiness.ready;

  /* v0.9.4 — the ONE proposal shown to the user: the LEAD card's plan when
     the grid splits the team, the ranked best otherwise. `tyre.data.best`
     (the car-1-basis ranked winner) stays in the ranking table and the
     GAME/WEB row only — after the wear correction the two can differ
     (Vegas: hero S14/S14/M22 72.2s vs best S13/S13/M24 72.7s). */
  const heroPlan = tyre?.data.carPlans ? tyre.data.carPlans.lead.plan : tyre?.data.best ?? null;

  return (
    <div className="space-y-5" data-testid="tyre-lab">
      <header className="flex flex-wrap items-center gap-2">
        <Waves className="h-4 w-4 text-teal" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-ink">{t('title')}</h2>
        <span className="font-mono text-xs text-teal">{trackDisplay(race.trackName, locale)}</span>
        <span className="font-mono text-[11px] text-ink-faint">
          {tyre?.data.laps ?? race.laps ?? '—'} {t('laps')} · {tyre?.data.pitCostS.toFixed(1) ?? '—'}s {t('pitCost')}
        </span>
        {tyre ? <span className="ml-auto"><ConfidenceBadge confidence={tyre.confidence} /></span> : null}
      </header>

      {notReady ? (
        <section
          aria-label={t('checklist.title')}
          className="rounded-lg border border-line bg-panel p-4"
          data-testid="tyre-checklist"
        >
          <header className="mb-3 flex flex-wrap items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-amber" aria-hidden="true" />
            <h3 className="text-[15px] font-semibold text-ink">{t('checklist.title')}</h3>
          </header>
          <p className="text-xs text-ink-soft">{t('checklist.intro')}</p>
          {race.state === 2 ? (
            <p
              className="mt-3 rounded border border-amber/40 bg-amber/10 px-3 py-2 text-xs text-amber"
              data-testid="tyre-race-done-note"
            >
              {t('checklist.raceDone')}
            </p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {(['allocation', 'practice', 'quali'] as const).map((key) => {
                const missing = tyre!.data.readiness.missing.includes(key);
                return (
                  <li
                    key={key}
                    className={cn(
                      'flex items-start gap-2 rounded px-2.5 py-1.5 text-xs',
                      missing ? 'bg-amber/5 text-amber' : 'bg-surface text-ink-faint',
                    )}
                    data-testid={`check-${key}`}
                  >
                    {missing ? (
                      <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    ) : (
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-good" aria-hidden="true" />
                    )}
                    <span>{missing ? t(`checklist.${key}`) : t('checklist.ok')}</span>
                  </li>
                );
              })}
            </ul>
          )}
          {/* mid-practice save: measured deltas stay visible, clearly labelled
              a draft — quali has not happened, so NO plan of any kind */}
          {race.state !== 2 &&
          !tyre!.data.readiness.missing.includes('practice') &&
          tyre!.data.readiness.missing.includes('quali') ? (
            <div
              className="mt-3 rounded border border-info/30 bg-info/5 px-3 py-2"
              data-testid="tyre-practice-draft"
            >
              <p className="text-xs text-info">{t('checklist.draft')}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(['M', 'H'] as const).map((c) => {
                  const m = tyre!.data.paceMeasured[c];
                  if (!m) return null;
                  /* v0.9.5 — a clamped measurement shows its RAW value,
                     marked discarded — the clamped number never renders as
                     if it were the reading (no mid-practice save exists to
                     verify this live; component-tested) */
                  const d = displayMeasured(m)!;
                  return (
                    <span
                      key={c}
                      className="flex items-center gap-1.5 rounded bg-panel px-2.5 py-1 font-mono text-xs text-ink"
                    >
                      {`${c} +${d.delta.toFixed(2)}s${
                        d.discarded ? (locale === 'vi' ? ' (bị loại)' : ' (discarded)') : ''
                      }`}
                      <span className="rounded bg-raised px-1.5 py-0.5 font-mono text-[9px] uppercase text-ink-faint">
                        {m.source === 'cross-session' ? t('source.cross-session') : t('source.practice')}
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
          ) : null}
        </section>
      ) : !tyre || !tyre.data.best ? (
        <p className="rounded-lg border border-line bg-panel p-6 text-sm text-ink-faint">
          {t('noPlan')}
        </p>
      ) : (
        <>
          {/* hero plan — the LEAD car's plan when the grid splits the team.
              v0.7.1: when per-car cap pricing re-split the lead's plan on
              its own garage, the hero shows THAT plan (same object as best
              whenever the cars cap identically — every save verified so far). */}
          {(() => {
            /* the else-branch guarantees a plan exists (best != null and the
               lead card carries one when the split exists) */
            const hero = heroPlan!;
            const heroStops = hero.stops;
            const heroPitLaps = hero.pitLaps;
          return (
          <section aria-label={t('hero')} className="rounded-lg border border-teal/30 bg-panel p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-teal">
                {t('heroPlan', {
                  plan: hero.stints.map((s) => `${s.compound}(${s.laps})`).join(' → '),
                  stops: heroStops,
                  /* v0.6.3: the pit laps ride along in the hero — "2 pit
                     (V21, V43)" — straight from the engine's pitLaps, so the
                     headline matches the timeline's per-stint pit labels. */
                  pits:
                    heroPitLaps.length > 0
                      ? ` (${heroPitLaps.map((l) => `V${l}`).join(', ')})`
                      : '',
                })}
              </h3>
              {/* v0.7.0 — who runs this plan and from where on the grid.
                  v0.9.4 — {car} names the GARAGE the sets come from (Xe 1/2
                  while the seats are unverified, the driver's name once
                  verified) — the card is a per-car briefing. */}
              {tyre.data.carPlans ? (
                <span
                  className="rounded bg-teal/10 px-2 py-0.5 font-mono text-[10px] text-teal"
                  data-testid="lead-plan-driver"
                >
                  {t('split.lead', {
                    car: tyre.data.carPlans.lead.carLabel ?? '',
                    name: tyre.data.carPlans.lead.driverName,
                    pos: tyre.data.carPlans.lead.gridPos,
                  })}
                </span>
              ) : null}
              {tyre.data.expectedStops != null ? (
                <span className="rounded bg-raised px-2 py-0.5 font-mono text-[10px] text-ink-soft">
                  {t('expectedStops', { stops: tyre.data.expectedStops, source: t(`source.${tyre.data.expectedSource ?? 'model'}`) })}
                </span>
              ) : null}
              {/* 0.4.1: reconcile the two numbers when they differ — the field
                  average is reference data, the plan is the time optimum. */}
              {tyre.data.expectedStops != null &&
              tyre.data.expectedStops !== heroStops ? (
                <p className="mt-2 text-[11px] leading-relaxed text-ink-faint" data-testid="tyre-stops-reconcile">
                  {t('stopsReconcile', {
                    expected: tyre.data.expectedStops,
                    source: t(`source.${tyre.data.expectedSource ?? 'model'}`),
                    plan: heroStops,
                  })}
                </p>
              ) : null}
            </div>
            <StintTimeline
              stints={hero.stints}
              totalLaps={tyre.data.laps}
              pitLaps={hero.pitLaps}
/>
            {/* v0.6.0 step 4 — the pit plan as a stint-by-stint table */}
            <table className="mt-3 w-full text-left text-xs" data-testid="tyre-stint-table">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-ink-faint">
                  <th className="py-1 pr-2 font-medium">{t('table.stint')}</th>
                  <th className="py-1 pr-2 font-medium">{t('table.compound')}</th>
                  <th className="py-1 pr-2 font-medium">{t('table.laps')}</th>
                  <th className="py-1 pr-2 font-medium">{t('table.range')}</th>
                  <th className="py-1 pr-2 font-medium">{t('table.pit')}</th>
                  {tyre.data.inventory ? (
                    <th className="py-1 font-medium">{t('inventory.setCol')}</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {hero.stints.map((s, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="py-1.5 pr-2 font-mono text-ink-faint">#{i + 1}</td>
                    <td className="py-1.5 pr-2">
                      <CompoundBadge compound={s.compound as CompoundKey} size="sm" showLabel />
                    </td>
                    <td className="py-1.5 pr-2 font-mono text-ink">{s.laps}</td>
                    <td className="py-1.5 pr-2 font-mono text-ink-soft">
                      {s.fromLap}–{s.toLap}
                    </td>
                    <td className="py-1.5 font-mono text-amber">
                      {heroPitLaps[i] != null ? `V${heroPitLaps[i]}` : '—'}
                    </td>
                    {/* v0.7.0 — which garage set the stint runs on.
                        v0.9.1 — the set id comes from the REAL assignment
                        (longest stint ↔ longest-life set), so the UI names
                        the physical set (#8) instead of guessing.
                        v0.9.4 — the fresh/used label reads `fresh` (the
                        per-set truth); the never-set `spare` flag is gone. */}
                    {tyre.data.inventory ? (
                      <td className="py-1.5 font-mono text-[10px] text-ink-soft">
                        {s.setUsed && s.setUsed.fresh
                          ? t('inventory.setFresh', { id: s.setUsed.tyreSetId, life: s.setUsed.life })
                          : s.setUsed
                            ? t('inventory.setUsed', { id: s.setUsed.tyreSetId, life: s.setUsed.life })
                            : '—'}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
            {/* v0.9.4 — the lead plan's wear cost, when its own garage makes
                one (fresh sets at cap lives → no line at all) */}
            {hero.wearS != null && hero.wearS !== 0 ? (
              <p className="mt-2 font-mono text-[10px] text-ink-faint" data-testid="hero-wear-cost">
                {t('split.wearCost', {
                  sign: hero.wearS > 0 ? '+' : '−',
                  time: Math.abs(hero.wearS).toFixed(1),
                })}
              </p>
            ) : null}
            {heroPitLaps.length > 0 ? (
              <div className="mt-4">
                <PitWindowBar
                  optimalLap={heroPitLaps[0]}
                  windowLo={Math.max(2, heroPitLaps[0] - 2)}
                  windowHi={heroPitLaps[0] + 2}
                  totalLaps={tyre.data.laps}
                  lifeCap={tyre.data.lives[hero.stints[0].compound as CompoundKey]}
                />
              </div>
            ) : null}
          </section>
          );
          })()}

          {/* v0.7.1 bước 3c — the grid positions on the split cards are the
              quali order + penalties already in this save; say so when no
              pending penalty exists (the P20/P21 post-race grid must never
              leak backwards from a save that lacks it) */}
          {tyre.data.readiness.derivedGrid &&
          tyre.data.readiness.derivedGrid.appliedPenalties === 0 ? (
            <p
              className="rounded border border-line bg-surface px-3 py-2 text-[11px] text-ink-faint"
              data-testid="split-grid-note"
            >
              {t('split.gridNote')}
            </p>
          ) : null}

          {/* v0.7.0 — the per-car garage inventory + the feasibility cap it
              imposes on every plan (spec bước 3). v0.7.2: each car card
              renders THAT car's aggregate (car.aggregate) — the v0.7.1 view
              leaked teamAggregate into both cards (S ×6/×10 where the save
              carries ×3/×5). The team union stays visible exactly once,
              above the cards, labelled as the cap basis. */}
          {tyre.data.inventory ? (
            <section
              aria-label={t('inventory.title')}
              className="rounded-lg border border-line bg-panel p-4"
              data-testid="tyre-inventory"
            >
              <header className="mb-3 flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] uppercase tracking-wider text-teal">{tSec('plan')}</span>
                <h3 className="text-[15px] font-semibold text-ink">{t('inventory.title')}</h3>
                <span className="rounded bg-raised px-1.5 py-0.5 font-mono text-[10px] text-ink-soft">
                  {t('inventory.cap', {
                    cap: (['S', 'M', 'H'] as const)
                      .map((c) => `${c} ${tyre.data.inventory!.maxStint[c]}`)
                      .join(' / '),
                  })}
                </span>
              </header>
              {/* the team union — the numbers the cap is built from. ONCE,
                  outside the per-car cards (never inside them). */}
              <div className="mb-3 rounded bg-surface p-3" data-testid="tyre-inventory-team">
                <p className="mb-1.5 text-[11px] font-medium text-ink">
                  {t('inventory.teamTotal', { n: tyre.data.inventory.cars.length })}
                </p>
                <InventoryAggList rows={tyre.data.inventory!.teamAggregate} />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {tyre.data.inventory.cars.map((car) => (
                  <div key={car.carId} className="rounded bg-surface p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-ink" data-testid={`inventory-car-${car.carId}`}>
                        {car.label}
                      </span>
                      {!car.seatVerified ? (
                        <span className="rounded bg-amber/10 px-1.5 py-0.5 font-mono text-[9px] text-amber">
                          {t('inventory.unverified')}
                        </span>
                      ) : null}
                      <span className="ml-auto font-mono text-[10px] text-ink-faint">CarID {car.carId}</span>
                    </div>
                    <InventoryAggList rows={car.aggregate} />
                  </div>
                ))}
              </div>
              {!tyre.data.inventory.perCar ? (
                <p className="mt-2 text-[11px] text-amber">{t('inventory.teamLevel')}</p>
              ) : null}
              {tyre.data.inventory.cars.some((c) => !c.seatVerified) ? (
                <p className="mt-2 text-[11px] text-ink-faint">{t('inventory.checkInGame')}</p>
              ) : null}
            </section>
          ) : null}

          {/* v0.7.0 step 4 — the TRAIL car's offset plan (double-stack rule) */}
          {tyre.data.carPlans?.trail ? (
            <section
              aria-label={t('split.trailTitle', {
                car: tyre.data.carPlans.trail.carLabel ?? '',
                name: tyre.data.carPlans.trail.driverName,
                pos: tyre.data.carPlans.trail.gridPos,
                plan: tyre.data.carPlans.trail.plan.stints
                  .map((s) => `${s.compound}(${s.laps})`)
                  .join(' → '),
              })}
              className="rounded-lg border border-line bg-panel p-4"
              data-testid="trail-plan"
            >
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-ink">
                  {t('split.trailTitle', {
                    car: tyre.data.carPlans.trail.carLabel ?? '',
                    name: tyre.data.carPlans.trail.driverName,
                    pos: tyre.data.carPlans.trail.gridPos,
                    plan: tyre.data.carPlans.trail.plan.stints
                      .map((s) => `${s.compound}(${s.laps})`)
                      .join(' → '),
                  })}
                </h3>
                <span className="font-mono text-[11px] text-amber">
                  {tyre.data.carPlans.trail.plan.pitLaps.length > 0
                    ? t('gamePlan.pitLaps', {
                        laps: tyre.data.carPlans.trail.plan.pitLaps.map((l) => `V${l}`).join(', '),
                      })
                    : null}
                </span>
                <span className="ml-auto">
                  <ConfidenceBadge confidence={tyre.data.carPlans.trail.confidence} />
                </span>
              </div>
              {/* one-line offset reason (engine-computed) */}
              <p className="mb-3 text-xs text-ink-soft" data-testid="trail-plan-reason">
                {tyre.data.carPlans.trail.reason === 'diff-compound'
                  ? t('split.reasonDiffCompound', {
                      compound: tyre.data.carPlans.trail.plan.stints[0]?.compound ?? '',
                    })
                  : tyre.data.carPlans.trail.reason === 'pit-gap'
                    ? t('split.reasonPitGap')
                    : t('split.reasonShifted', {
                        laps: tyre.data.carPlans.trail.shiftedBy ?? 0,
                      })}
                {tyre.data.carPlans.tie ? ` ${t('split.tieNote')}` : ''}
              </p>
              <StintTimeline
                stints={tyre.data.carPlans.trail.plan.stints}
                totalLaps={tyre.data.laps}
                pitLaps={tyre.data.carPlans.trail.plan.pitLaps}
              />
              <table className="mt-3 w-full text-left text-xs" data-testid="trail-stint-table">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-ink-faint">
                    <th className="py-1 pr-2 font-medium">{t('table.stint')}</th>
                    <th className="py-1 pr-2 font-medium">{t('table.compound')}</th>
                    <th className="py-1 pr-2 font-medium">{t('table.laps')}</th>
                    <th className="py-1 pr-2 font-medium">{t('table.range')}</th>
                    <th className="py-1 pr-2 font-medium">{t('table.pit')}</th>
                    {tyre.data.inventory ? (
                      <th className="py-1 font-medium">{t('inventory.setCol')}</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {tyre.data.carPlans.trail.plan.stints.map((s, i) => (
                    <tr key={i} className="border-t border-line">
                      <td className="py-1.5 pr-2 font-mono text-ink-faint">#{i + 1}</td>
                      <td className="py-1.5 pr-2">
                        <CompoundBadge compound={s.compound as CompoundKey} size="sm" showLabel />
                      </td>
                      <td className="py-1.5 pr-2 font-mono text-ink">{s.laps}</td>
                      <td className="py-1.5 pr-2 font-mono text-ink-soft">
                        {s.fromLap}–{s.toLap}
                      </td>
                      <td className="py-1.5 pr-2 font-mono text-amber">
                        {tyre.data.carPlans!.trail!.plan.pitLaps[i] != null
                          ? `V${tyre.data.carPlans!.trail!.plan.pitLaps[i]}`
                          : '—'}
                      </td>
                      {/* v0.9.1 — the trail stint's own set (from the trail
                          car's garage when the seats are verified).
                          v0.9.4 — the label reads `fresh`; `spare` is gone. */}
                      {tyre.data.inventory ? (
                        <td className="py-1.5 font-mono text-[10px] text-ink-soft">
                          {s.setUsed && s.setUsed.fresh
                            ? t('inventory.setFresh', { id: s.setUsed.tyreSetId, life: s.setUsed.life })
                            : s.setUsed
                              ? t('inventory.setUsed', { id: s.setUsed.tyreSetId, life: s.setUsed.life })
                              : '—'}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 font-mono text-[10px] text-ink-faint">
                {t('split.total', { time: tyre.data.carPlans.trail.plan.timeS.toFixed(1) })}
              </p>
              {/* v0.9.4 — the trail plan's wear cost on ITS OWN garage */}
              {tyre.data.carPlans.trail.plan.wearS != null &&
              tyre.data.carPlans.trail.plan.wearS !== 0 ? (
                <p className="mt-1 font-mono text-[10px] text-ink-faint" data-testid="trail-wear-cost">
                  {t('split.wearCost', {
                    sign: tyre.data.carPlans.trail.plan.wearS > 0 ? '+' : '−',
                    time: Math.abs(tyre.data.carPlans.trail.plan.wearS).toFixed(1),
                  })}
                </p>
              ) : null}
            </section>
          ) : null}
          {tyre.data.carPlans?.trail == null && tyre.data.carPlans ? (
            <p className="rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink-faint" data-testid="trail-unavailable">
              {t('split.noTrail')}
            </p>
          ) : null}

          {/* evidence clock (v0.5.1 P2) — the source of every number behind
              the plan; add-only strip, no layout redesign */}
          <section
            aria-label={t('clock.title')}
            className="rounded-lg border border-line bg-surface p-4"
            data-testid="evidence-clock"
          >
            <header className="mb-3 flex flex-wrap items-center gap-2">
              <Activity className="h-4 w-4 text-teal" aria-hidden="true" />
              <span className="font-mono text-[11px] uppercase tracking-wider text-teal">{tSec('evidence')}</span>
              <h3 className="text-[15px] font-semibold text-ink">{t('clock.title')}</h3>
            </header>
            <div className="flex flex-wrap gap-2">
              {(['S', 'M', 'H'] as CompoundKey[]).map((c) => {
                const src = tyre.data.paceSource[c];
                const measured = c === 'S' ? null : tyre.data.paceMeasured[c as 'M' | 'H'];
                /* v0.9.5 — the chip shows the RAW measurement when the entry
                   was clamped (rawDelta on record), never the clamped value */
                const d = displayMeasured(measured);
                return (
                  <div key={c} className="flex items-center gap-1.5 rounded bg-panel px-2.5 py-1.5">
                    <CompoundBadge compound={c} size="sm" />
                    <span className="font-mono text-xs text-ink">
                      {c === 'S' ? '—' : `+${tyre.data.deltas[c].toFixed(2)}s`}
                    </span>
                    <span className="rounded bg-raised px-1.5 py-0.5 font-mono text-[9px] uppercase text-ink-faint">
                      {t(`source.${src}`)}
                    </span>
                    {measured && src === 'model' ? (
                      <span className="font-mono text-[10px] text-amber">
                        {d!.discarded
                          ? t('clock.measuredButDiscarded', { delta: d!.delta.toFixed(2) })
                          : t('clock.measuredBut', { delta: d!.delta.toFixed(2) })}
                      </span>
                    ) : null}
                    {/* v0.6.1: a forced delta is never silent — the chip shows
                        the raw measurement beside the clamped/allocation rank */}
                    {measured && (src === 'clamped' || src === 'allocation') ? (
                      <span className="font-mono text-[10px] text-amber">
                        {t('clock.measuredButForced', {
                          delta: measured.delta.toFixed(2),
                          source: src === 'allocation' ? t('source.allocation') : t('source.model'),
                        })}
                      </span>
                    ) : null}
                  </div>
                );
              })}
              <div className="flex items-center gap-1.5 rounded bg-panel px-2.5 py-1.5">
                <span className="text-[10px] text-ink-faint">{t('clock.lives')}</span>
                <span className="rounded bg-raised px-1.5 py-0.5 font-mono text-[9px] uppercase text-ink-faint">
                  {t(`source.${tyre.data.lifeSource.S}`)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 rounded bg-panel px-2.5 py-1.5">
                <span className="text-[10px] text-ink-faint">{t('clock.stops')}</span>
                <span className="font-mono text-xs text-ink">
                  {tyre.data.observedStops
                    ? `~${tyre.data.observedStops.avgStopsPerDriver.toFixed(2)}`
                    : '—'}
                </span>
                <span className="rounded bg-raised px-1.5 py-0.5 font-mono text-[9px] uppercase text-ink-faint">
                  {tyre.data.expectedSource
                    ? t(`source.${tyre.data.expectedSource}`)
                    : t('clock.noData')}
                </span>
              </div>
            </div>
            {(() => {
              /* 0.5.3 wording fix: the same-tier rule ranks model constants
               * for BOTH M and H when only one is measured — the old text
               * claimed the measured compound was "not measured", fighting
               * the evidence clock. paceMeasured keeps the real values.
               * v0.9.5 — split the model-ranked sides by WHY they rank on
               * the model: a CLAMPED side has its rawDelta on record and is
               * "measured but discarded", never "not measured"; the reason
               * per side stays in the engine assumption (the "nhiễu" label
               * here is the shared one, no new reason is invented). */
              const modelRanked = (['M', 'H'] as const).filter(
                (c) => tyre.data.paceSource[c] === 'model',
              );
              if (modelRanked.length === 0) return null;
              const joiner = locale === 'vi' ? ' và ' : ' and ';
              const clampedSides = modelRanked
                .filter((c) => tyre.data.paceMeasured[c]?.rawDelta != null)
                .map((c) => `${c} (+${tyre.data.paceMeasured[c]!.rawDelta!.toFixed(2)}s)`);
              const usableMeasured = modelRanked
                .filter(
                  (c) =>
                    tyre.data.paceMeasured[c] != null &&
                    tyre.data.paceMeasured[c]!.rawDelta == null,
                )
                .map((c) => `${c} +${tyre.data.paceMeasured[c]!.delta.toFixed(2)}s`);
              if (clampedSides.length > 0) {
                return (
                  <p
                    className="mt-2 rounded border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger"
                    data-testid="evidence-warning"
                    data-warn="clamped"
                  >
                    {t('clock.clampedWarn', {
                      compounds: modelRanked.join(joiner),
                      clamped: clampedSides.join(joiner),
                      measured:
                        usableMeasured.length > 0 ? usableMeasured.join(', ') : '—',
                    })}
                  </p>
                );
              }
              const unmeasured = modelRanked.filter(
                (c) => tyre.data.paceMeasured[c] == null,
              );
              return (
                <p
                  className="mt-2 rounded border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger"
                  data-testid="evidence-warning"
                  data-warn="unmeasured"
                >
                  {t('clock.unmeasuredWarn', {
                    compounds: modelRanked.join(joiner),
                    unmeasured:
                      unmeasured.length > 0 ? unmeasured.join(', ') : '—',
                    measured:
                      usableMeasured.length > 0 ? usableMeasured.join(', ') : '—',
                  })}
                </p>
              );
            })()}
            {prior ? (
              <p className="mt-2 text-[11px] text-ink-soft" data-testid="track-prior">
                {t('clock.prior', {
                  track: trackDisplay(race.trackName, locale),
                  stops: prior.predictedStops ?? '—',
                  lap: prior.predictedPitLap ?? '—',
                  field: prior.fieldAvgStops != null ? prior.fieldAvgStops.toFixed(1) : '—',
                })}
              </p>
            ) : null}
          </section>

          {/* the game's own strategist plan (v0.5.1 P2) — team level */}
          {tyre.data.gamePlan ? (
            <section
              aria-label={t('gamePlan.title')}
              className="rounded-lg border border-line bg-panel p-4"
              data-testid="game-plan"
            >
              <header className="mb-3 flex flex-wrap items-center gap-2">
                <Bot className="h-4 w-4 text-teal" aria-hidden="true" />
                <span className="font-mono text-[11px] uppercase tracking-wider text-teal">{tSec('game')}</span>
                <h3 className="text-[15px] font-semibold text-ink">{t('gamePlan.title')}</h3>
              </header>
              <div className="space-y-1.5 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-10 font-mono text-[10px] text-ink-faint">{t('gamePlan.game')}</span>
                  <span className="flex flex-wrap gap-1">
                    {tyre.data.gamePlan.stintLaps.map((laps, j) => (
                      <span key={j} className="inline-flex items-center gap-0.5">
                        <CompoundBadge compound={tyre.data.gamePlan!.compounds[j] as CompoundKey} size="sm" />
                        <span className="font-mono text-[10px] text-ink-soft">{laps}</span>
                      </span>
                    ))}
                  </span>
                  {tyre.data.gamePlan.pitLaps.length > 0 ? (
                    <span className="font-mono text-[10px] text-ink-soft">
                      {t('gamePlan.pitLaps', { laps: tyre.data.gamePlan.pitLaps.join(', ') })}
                    </span>
                  ) : null}
                  <span className="font-mono text-[10px] text-ink-faint">
                    {t('gamePlan.windows', {
                      windows: tyre.data.gamePlan.pitWindows
                        .map((w) => `${w.start}–${w.end}`)
                        .join(' · '),
                    })}
                  </span>
                  {/* v0.6.1: the game plan's web-modelled total — makes any
                      disagreement with the web visible in seconds */}
                  <span className="rounded bg-raised px-1.5 py-0.5 font-mono text-[10px] text-ink-soft">
                    {t('gamePlan.totalTime', { time: tyre.data.gamePlan.totalTimeS.toFixed(1) })}
                  </span>
                </div>
                {tyre.data.best ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-10 font-mono text-[10px] text-ink-faint">{t('gamePlan.web')}</span>
                    <span className="flex flex-wrap gap-1">
                      {tyre.data.best.stints.map((s, j) => (
                        <span key={j} className="inline-flex items-center gap-0.5">
                          <CompoundBadge compound={s.compound as CompoundKey} size="sm" />
                          <span className="font-mono text-[10px] text-ink-soft">{s.laps}</span>
                        </span>
                      ))}
                    </span>
                    {tyre.data.best.pitLaps.length > 0 ? (
                      <span className="font-mono text-[10px] text-ink-soft">
                        {t('gamePlan.pitLaps', { laps: tyre.data.best.pitLaps.join(', ') })}
                      </span>
                    ) : null}
                    <span className="rounded bg-raised px-1.5 py-0.5 font-mono text-[10px] text-ink-soft">
                      {t('gamePlan.totalTime', { time: tyre.data.best.timeS.toFixed(1) })}
                    </span>
                    {(() => {
                      const diff = Math.round((tyre.data.best.timeS - tyre.data.gamePlan!.totalTimeS) * 10) / 10;
                      if (Math.abs(diff) < 0.05) return null;
                      return (
                        <span className="font-mono text-[10px] text-amber">
                          {diff < 0
                            ? t('gamePlan.webFaster', { delta: Math.abs(diff).toFixed(1) })
                            : t('gamePlan.webSlower', { delta: diff.toFixed(1) })}
                        </span>
                      );
                    })()}
                  </div>
                ) : null}
              </div>
              {!tyre.data.gamePlan.loadoutsAgree ? (
                <p className="mt-2 text-[11px] text-amber">{t('gamePlan.loadoutsDiffer')}</p>
              ) : null}
              <p className="mt-1 text-[11px] text-ink-faint">{t('gamePlan.teamLevel')}</p>
            </section>
          ) : null}

          {/* degradation curves — engine constants visualised (v0.5.0 step 2) */}
          <section aria-label={t('degTitle')} className="rounded-lg border border-line bg-panel p-4">
            <header className="mb-3 flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-wider text-teal">{tSec('deg')}</span>
              <h3 className="text-[15px] font-semibold text-ink">{t('degTitle')}</h3>
              <span className="rounded bg-raised px-1.5 py-0.5 font-mono text-[9px] uppercase text-ink-faint">
                {t(`source.${tyre.data.lifeSource.S}`)}
              </span>
            </header>
            <DegCurveChart
              data={{
                laps: tyre.data.laps,
                deltas: tyre.data.deltas,
                lives: tyre.data.lives,
                /* v0.9.4 — the curve marks the PROPOSAL's first pit (the
                   lead card), not the ranked list's basis plan */
                pitLap: heroPlan!.pitLaps[0],
                firstCompound: heroPlan!.stints[0]?.compound as CompoundKey | undefined,
              }}
            />
          </section>

          {/* v0.6.0 step 4 — the three compounds side by side (3 metrics,
              3 independent scales; numbers straight from the tyre engine) */}
          <section aria-label={t('compareTitle')} className="rounded-lg border border-line bg-panel p-4">
            <header className="mb-3 flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-wider text-teal">{tSec('deg')}</span>
              <h3 className="text-[15px] font-semibold text-ink">{t('compareTitle')}</h3>
            </header>
            <CompoundCompareChart lives={tyre.data.lives} deltas={tyre.data.deltas} />
          </section>

          {/* what-if (Phase 2) — v0.9.9: collapsible, collapsed by default
              while idle (see the state comment above). */}
          <section aria-label={tWhat('title')} className="rounded-lg border border-line bg-panel p-4" data-testid="tyre-whatif">
            <header className="mb-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setWhatIfOpen((v) => !v)}
                aria-expanded={whatIfOpen}
                aria-controls="whatif-body"
                className="flex min-h-[32px] flex-1 flex-wrap items-center gap-2 text-left"
                data-testid="whatif-toggle"
              >
                <ChevronDown
                  className={cn(
                    'h-4 w-4 text-ink-faint transition-transform',
                    whatIfOpen && 'rotate-180',
                  )}
                  aria-hidden="true"
                />
                <SlidersHorizontal className="h-4 w-4 text-teal" aria-hidden="true" />
                <span className="font-mono text-[11px] uppercase tracking-wider text-teal">{tSec('whatif')}</span>
                <span role="heading" aria-level={3} className="text-[15px] font-semibold text-ink">{tWhat('title')}</span>
              </button>
              {/* status summary — visible in BOTH states, so a collapsed
                  section still says what is switched on */}
              <span
                className="font-mono text-[10px] text-ink-faint"
                data-testid="whatif-summary"
              >
                {tWhat('whatifSummary', { shift: pitShift, on: rainOn ? 'on' : 'off' })}
              </span>
            </header>
            {whatIfOpen ? (
            <div id="whatif-body">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="pit-shift" className="text-xs text-ink-soft">
                  {tWhat('pitShift', { shift: pitShift })}
                </label>
                <Slider
                  id="pit-shift"
                  className="mt-2"
                  min={-3}
                  max={3}
                  step={1}
                  value={[pitShift]}
                  onValueChange={(v) => setPitShift(v[0] ?? 0)}
                  data-testid="pit-shift-slider"
                />
                <p className="mt-1 font-mono text-[10px] text-ink-faint">
                  {pitShift === 0 ? tWhat('baseline') : pitShift > 0 ? tWhat('later', { laps: pitShift }) : tWhat('earlier', { laps: -pitShift })}
                </p>
              </div>
              <div className="flex items-start gap-2">
                <Switch
                  id="rain-toggle"
                  checked={rainOn}
                  onCheckedChange={(v) => setRainOn(v)}
                  data-testid="rain-toggle"
                />
                <label htmlFor="rain-toggle" className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-soft">
                  <CloudRain className="h-3.5 w-3.5 text-info" aria-hidden="true" />
                  {tWhat('rain')}
                </label>
              </div>
            </div>

            {whatIf && whatIf.shifted ? (
              <div className="mt-4 space-y-2" data-testid="whatif-result">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-ink-faint">{tWhat('plan')}</span>
                  <span className="flex flex-wrap gap-1">
                    {whatIf.shifted.stints.map((st, j) => (
                      <span key={j} className="inline-flex items-center gap-0.5">
                        <CompoundBadge compound={st.compound as CompoundKey} size="sm" />
                        <span className="font-mono text-[10px] text-ink-soft">{st.laps}</span>
                      </span>
                    ))}
                  </span>
                  <span
                    className={cn(
                      'ml-auto rounded px-2 py-0.5 font-mono text-[11px]',
                      whatIf.deltaS != null && whatIf.deltaS > 0.05
                        ? 'bg-danger/10 text-danger'
                        : whatIf.deltaS != null && whatIf.deltaS < -0.05
                          ? 'bg-good/10 text-good'
                          : 'bg-raised text-ink-soft',
                    )}
                  >
                    {whatIf.deltaS != null
                      ? `${whatIf.deltaS > 0 ? '+' : ''}${whatIf.deltaS.toFixed(1)}s`
                      : tWhat('infeasible')}
                  </span>
                </div>
                {whatIf.clamped ? (
                  <p className="text-[11px] text-amber">{tWhat('clamped')}</p>
                ) : null}
              </div>
            ) : null}

            {rainOn ? (
              wetPlan ? (
                <div className="mt-3 rounded border border-info/30 bg-info/5 p-3" data-testid="wet-plan">
                  <p className="flex flex-wrap items-center gap-2 text-xs text-info">
                    <CloudRain className="h-3.5 w-3.5" aria-hidden="true" />
                    {tWhat('wetPlan')}
                    <span className="flex flex-wrap gap-1">
                      {wetPlan.stints.map((st, j) => (
                        <span key={j} className="inline-flex items-center gap-0.5">
                          <CompoundBadge compound={st.compound as CompoundKey} size="sm" />
                          <span className="font-mono text-[10px] text-ink-soft">{st.laps}</span>
                        </span>
                      ))}
                    </span>
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-ink-faint">
                    I {wetPlan.lives.I ?? '—'} / W {wetPlan.lives.W ?? '—'} {t('laps')} · {t(`source.${wetPlan.source === 'allocation' ? 'allocation' : 'model'}`)}
                  </p>
                  {wetPlan.note ? <p className="mt-1 text-[11px] text-amber">{wetPlan.note}</p> : null}
                </div>
              ) : (
                <p className="mt-3 rounded border border-line bg-surface px-3 py-2 text-xs text-ink-faint">
                  {tWhat('noWetData')}
                </p>
              )
            ) : null}
            </div>
            ) : null}
          </section>

          {/* v0.9.2 — the SC/VSC what-if (real Races_Tracks columns, honest pricing) */}
          <section
            aria-label={tWhat('scTitle')}
            className="rounded-lg border border-line bg-panel p-4"
            data-testid="tyre-whatif-sc"
          >
            <header className="mb-3 flex flex-wrap items-center gap-2">
              <Flag className="h-4 w-4 text-amber" aria-hidden="true" />
              <span className="font-mono text-[11px] uppercase tracking-wider text-amber">{tSec('whatif')}</span>
              <h3 className="text-[15px] font-semibold text-ink">{tWhat('scTitle')}</h3>
              <Switch
                id="sc-toggle"
                className="ml-auto"
                checked={scOn}
                onCheckedChange={(v) => setScOn(v)}
                data-testid="sc-toggle"
              />
            </header>

            {!scOn ? null : scWhatIf ? (
              <div className="space-y-3">
                <p
                  className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-faint"
                  data-testid="sc-context"
                >
                  <span>{tWhat('scChance', { chance: (scWhatIf.trackCols.chance * 100).toFixed(1) })}</span>
                  <span>
                    {tWhat('scGameCols', {
                      pit: scWhatIf.trackCols.pitLaneS,
                      green: scWhatIf.trackCols.greenFlagS,
                      sc: scWhatIf.trackCols.scS,
                    })}
                  </span>
                  <span>
                    {tWhat('scHistory', { sc: scHistory.sc, vsc: scHistory.vsc, total: scHistory.total })}
                  </span>
                </p>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-ink-soft">{tWhat('scMode')}</p>
                    <div className="mt-2 flex gap-1" role="group" aria-label={tWhat('scMode')}>
                      <button
                        type="button"
                        aria-pressed={scMode === 'sc'}
                        onClick={() => setScMode('sc')}
                        className={cn(
                          'min-h-[32px] rounded border px-2.5 py-1 text-xs',
                          scMode === 'sc'
                            ? 'border-amber bg-amber/10 text-amber'
                            : 'border-line text-ink-soft hover:bg-raised',
                        )}
                        data-testid="sc-mode-sc"
                      >
                        {tWhat('scModeSC')}
                      </button>
                      <button
                        type="button"
                        aria-pressed={scMode === 'vsc'}
                        onClick={() => setScMode('vsc')}
                        className={cn(
                          'min-h-[32px] rounded border px-2.5 py-1 text-xs',
                          scMode === 'vsc'
                            ? 'border-amber bg-amber/10 text-amber'
                            : 'border-line text-ink-soft hover:bg-raised',
                        )}
                        data-testid="sc-mode-vsc"
                      >
                        {tWhat('scModeVSC')}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="sc-start" className="text-xs text-ink-soft">
                      {tWhat('scStart', { lap: scWhatIf.scenario.startLap })}
                    </label>
                    <Slider
                      id="sc-start"
                      className="mt-2"
                      min={1}
                      max={Math.max(1, scWhatIf.laps - 3)}
                      step={1}
                      value={[scWhatIf.scenario.startLap]}
                      onValueChange={(v) => setScStart(v[0] ?? 1)}
                      data-testid="sc-start-slider"
                    />
                  </div>
                  <div>
                    <label htmlFor="sc-laps" className="text-xs text-ink-soft">
                      {tWhat('scWindow', { laps: scWhatIf.scenario.laps })}
                    </label>
                    <Slider
                      id="sc-laps"
                      className="mt-2"
                      min={1}
                      max={20}
                      step={1}
                      value={[scWhatIf.scenario.laps]}
                      onValueChange={(v) => setScLaps(v[0] ?? 3)}
                      data-testid="sc-laps-slider"
                    />
                  </div>
                </div>

                <ul className="space-y-2" data-testid="sc-rows">
                  {scWhatIf.rows.map((row, i) => (
                    <li
                      key={i}
                      className="flex flex-wrap items-center gap-2 text-xs"
                      data-testid={`sc-row-${i}`}
                    >
                      <span className="w-10 font-mono text-ink-faint">{row.stops} pit</span>
                      <span className="flex flex-wrap gap-1">
                        {row.stints.map((st, j) => (
                          <span key={j} className="inline-flex items-center gap-0.5">
                            <CompoundBadge compound={st.compound as CompoundKey} size="sm" />
                            <span className="font-mono text-[10px] text-ink-soft">{st.laps}</span>
                          </span>
                        ))}
                      </span>
                      <span className="font-mono text-ink-faint">
                        {row.greenTimeS.toFixed(1)}s →{' '}
                        <span className={i === 0 ? 'text-good' : 'text-ink'}>
                          {row.scenarioTimeS.toFixed(1)}s
                        </span>
                      </span>
                      {row.stopsInWindow > 0 ? (
                        <span className="rounded bg-amber/10 px-2 py-0.5 font-mono text-[10px] text-amber">
                          {tWhat('scSaved', { saved: row.savedS.toFixed(1), stops: row.stopsInWindow })}
                        </span>
                      ) : (
                        <span className="rounded bg-raised px-2 py-0.5 font-mono text-[10px] text-ink-faint">
                          {tWhat('scNone')}
                        </span>
                      )}
                      {i === 0 ? <span className="text-good">{t('fastest')}</span> : null}
                    </li>
                  ))}
                </ul>

                <ul className="space-y-1 border-t border-line pt-2">
                  {scWhatIf.assumptions.map((a, i) => (
                    <li key={i} className="text-[11px] text-ink-faint">
                      •{' '}
                      {a.key === 'scRatio'
                        ? tWhat('scAssumpRatio', {
                            green: String(a.params.green),
                            sc: String(a.params.sc),
                            pit: String(a.params.pit),
                            cost: String(a.params.cost),
                          })
                        : a.key === 'vscMidpoint'
                          ? tWhat('scAssumpVSC', { cost: String(a.params.cost) })
                          : a.key === 'repricedOnly'
                            ? tWhat('scAssumpReprice')
                            : tWhat('scAssumpWindow')}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p
                className="rounded border border-line bg-surface px-3 py-2 text-xs text-ink-faint"
                data-testid="sc-no-data"
              >
                {tWhat('scNoCols')}
              </p>
            )}
          </section>

          {/* v0.9.7 — the free-form simulator: a SANDBOX after the three
              what-if sections. Its results never touch lead/trail/best/game
              or the alternatives table — it only compares against best via
              vsBest. Engine errors/assumptions render verbatim (the engine
              returns complete Vietnamese strings; the UI never re-translates
              them). */}
          <section
            aria-label={tWhat('simTitle')}
            className="rounded-lg border border-line bg-panel p-4 transition-colors focus-within:border-teal/60"
            style={{
              /* v0.10.0 step 3 — the cyber accent, restrained: a faint 1px
                 grid texture on the panel only (pure CSS gradients, no
                 image/SVG), under the content, over the panel colour. */
              backgroundImage:
                'linear-gradient(rgba(34, 48, 65, 0.45) 1px, transparent 1px), linear-gradient(90deg, rgba(34, 48, 65, 0.45) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
            data-testid="tyre-simulator"
          >
            <header className="mb-1.5 flex flex-wrap items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-teal" aria-hidden="true" />
              <span className="font-mono text-[11px] uppercase tracking-wider text-teal">{tSec('whatif')}</span>
              <h3 className="text-[15px] font-semibold text-ink">{tWhat('simTitle')}</h3>
              <div className="ml-auto flex gap-2">
                <button
                  type="button"
                  disabled={!wetPreset}
                  onClick={() => {
                    if (!wetPreset) return;
                    updateSim({
                      stints: wetPreset.stints.map((s) => ({
                        id: nextSimId(),
                        compound: s.compound,
                        laps: s.laps,
                      })),
                    });
                  }}
                  className={cn(
                    'min-h-[32px] rounded border px-2.5 py-1 text-xs',
                    wetPreset
                      ? 'border-info bg-info/10 text-info hover:bg-info/20'
                      : 'cursor-not-allowed border-line text-ink-faint',
                  )}
                  data-testid="sim-wet-preset"
                >
                  {tWhat('simWetPreset')}
                </button>
                {/* v0.9.9 — one way back to the lead plan: re-seed the draft
                    (seedKey '' makes the seed mechanism fall back to the
                    fresh copy), events/rain empty. */}
                <button
                  type="button"
                  onClick={() => setSimDraft({ seedKey: '', stints: [], events: [], rain: [] })}
                  className="min-h-[32px] rounded border border-line px-2.5 py-1 text-xs text-ink-soft hover:bg-raised"
                  data-testid="sim-reset"
                >
                  {tWhat('simReset')}
                </button>
              </div>
            </header>
            {/* v0.9.9 — the one-line contract of this sandbox */}
            <p className="mb-3 text-[11px] text-ink-faint" data-testid="sim-subtitle">
              {tWhat('simSubtitle')}
            </p>
            {!wetPreset ? (
              <p className="mb-3 rounded border border-line bg-surface px-3 py-2 text-[11px] text-ink-faint" data-testid="sim-no-wet-data">
                {tWhat('simNoWetData')}
              </p>
            ) : null}

            {/* car picker — labels come from the inventory (verified seats
                name the driver, else "Xe 1/Xe 2").
                v0.10.0 step 2 — a real segmented control: joined cells, the
                active one teal 15% + teal text + a soft inset glow. */}
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs text-ink-soft">{tWhat('simCar')}</p>
              <div
                className="inline-flex overflow-hidden rounded-md border border-line"
                role="group"
                aria-label={tWhat('simCar')}
              >
                {[0, 1].map((idx) => (
                  <button
                    key={idx}
                    type="button"
                    aria-pressed={simCar === idx}
                    onClick={() => setSimCar(idx)}
                    className={cn(
                      'min-h-[44px] px-3 text-xs transition-colors',
                      idx === 0 && 'border-r border-line',
                      simCar === idx
                        ? 'bg-teal/15 font-semibold text-teal hover:bg-teal/20'
                        : 'text-ink-soft hover:bg-raised',
                    )}
                    style={
                      simCar === idx
                        ? { boxShadow: 'inset 0 0 10px rgba(46, 230, 200, 0.12)' }
                        : undefined
                    }
                    data-testid={`sim-car-${idx}`}
                  >
                    {simCars[idx]?.label ?? `Xe ${idx + 1}`}
                  </button>
                ))}
              </div>
            </div>

            {/* v0.10.0 step 1 — the draft's face: the edited plan redrawn
                over the real lap axis (segments = stints, amber dashed
                bands = SC/VSC, blue bands = rain). It re-renders on every
                keystroke, and its segments are buttons that focus their
                editor row. */}
            <div className="mt-3">
              <SimTimeline
                stints={simTimelineStints}
                totalLaps={simLapsTotal ?? 0}
                events={simEvents}
                rain={simRain}
                setInfo={simSetInfo}
                activeSegment={activeSimSeg}
                onSegmentClick={focusSimStint}
              />
            </div>

            {/* v0.10.0 step 2 — the focusable error summary (skill ux rule:
                a summary at the top of the form + per-field links). Focus
                never jumps while typing — it moves ONLY when the link is
                clicked. The engine's strings render verbatim (the v0.9.9
                law); the goto link is pure UI state (sum vs race distance).
                The v0.9.9 banner in the result area stays. */}
            {simResult != null && !simResult.ok ? (
              <div
                role="alert"
                className="mt-3 rounded border border-danger/30 bg-danger/5 px-3 py-2"
                data-testid="sim-error-summary"
              >
                <p className="text-[11px] font-medium text-danger">{tWhat('simErrorSummary')}</p>
                <ul className="mt-1 space-y-1">
                  {simResult.errors.map((e, i) => (
                    <li
                      key={i}
                      className="text-xs text-danger"
                      data-testid={`sim-summary-item-${i}`}
                    >
                      {e}
                      {i === 0 &&
                      simLapsTotal != null &&
                      simSumLaps !== simLapsTotal &&
                      simStints.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => focusSimStint(0)}
                          className="ml-2 min-h-[44px] rounded underline decoration-danger/60 underline-offset-2 transition-colors hover:text-ink"
                          data-testid="sim-summary-goto"
                        >
                          {tWhat('simSummaryGoTo', { n: 1 })}
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* stint editor (max 4 stints — the optimizer's own cap; a
                single stint = a legal no-stop plan).
                v0.10.0 step 2 — compound is a coloured segmented control,
                the laps field gained a −/+ stepper, all targets ≥ 44×44px
                (skill a11y), rows enter/exit through AnimatePresence
                (enter spring ~250ms, exit 150ms — exit ALWAYS faster; only
                opacity + transform), keys are stable row ids. */}
            <ul className="mt-3 space-y-2" data-testid="sim-stints">
              <AnimatePresence initial={false}>
                {simStints.map((st, i) => {
                  const sumOff = simLapsTotal != null && simSumLaps !== simLapsTotal;
                  return (
                    <motion.li
                      key={st.id}
                      layout={!simReduceMotion}
                      ref={(el) => {
                        simStintRowRefs.current[i] = el;
                      }}
                      initial={simReduceMotion ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{
                        opacity: 0,
                        y: -8,
                        transition: simReduceMotion
                          ? { duration: 0 }
                          : { duration: 0.15, ease: 'easeIn' },
                      }}
                      transition={
                        simReduceMotion
                          ? { duration: 0 }
                          : { type: 'spring', stiffness: 420, damping: 34 }
                      }
                      className={cn(
                        'flex flex-wrap items-center gap-2 rounded-md pl-1.5 text-xs transition-shadow',
                        activeSimSeg === i ? 'ring-1 ring-inset ring-teal' : '',
                      )}
                      style={{
                        /* v0.10.0 step 3 — the row carries its compound on
                           its sleeve: a 3px left border in the SELECTED
                           compound colour (not colour-only — the segmented
                           control and the range label still name it). */
                        borderLeft: `3px solid ${COMPOUND_COLOUR[st.compound] ?? '#1d5f8a'}`,
                      }}
                      data-testid={`sim-stint-row-${i}`}
                    >
                      <span className="w-8 font-mono text-ink-faint">#{i + 1}</span>
                      <div
                        role="group"
                        aria-label={tWhat('simCompoundGroup', { n: i + 1 })}
                        className="flex overflow-hidden rounded-md border border-line"
                        data-testid={`sim-stint-${i}-compound`}
                      >
                        {(['S', 'M', 'H', 'I', 'W'] as const).map((c) => {
                          const colour = COMPOUND_COLOUR[c] ?? '#1d5f8a';
                          const active = st.compound === c;
                          return (
                            <button
                              key={c}
                              type="button"
                              aria-pressed={active}
                              aria-label={c}
                              onClick={() =>
                                updateSim({
                                  stints: simStints.map((r, k) =>
                                    k === i ? { ...r, compound: c } : r,
                                  ),
                                })
                              }
                              className={cn(
                                'min-h-[44px] min-w-[40px] border-r border-line px-1.5 font-mono text-xs font-bold transition-colors last:border-r-0',
                                active
                                  ? 'text-ink hover:opacity-90'
                                  : 'text-ink-faint hover:bg-raised hover:text-ink-soft',
                              )}
                              style={
                                active
                                  ? {
                                      background: `${colour}33`,
                                      boxShadow: `inset 0 0 0 1px ${colour}`,
                                    }
                                  : undefined
                              }
                            >
                              {c}
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label={tWhat('simStintLapsDec', { n: i + 1 })}
                          onClick={() =>
                            updateSim({
                              stints: simStints.map((r, k) =>
                                k === i
                                  ? { ...r, laps: Math.max(4, (r.laps > 0 ? r.laps : 4) - 1) }
                                  : r,
                              ),
                            })
                          }
                          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-line text-ink-soft transition-colors hover:bg-raised hover:text-ink"
                          data-testid={`sim-stint-${i}-dec`}
                        >
                          <Minus className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <input
                          type="number"
                          min={4}
                          max={tyre?.data.laps ?? 999}
                          value={st.laps}
                          onChange={(e) =>
                            updateSim({
                              stints: simStints.map((r, k) =>
                                k === i ? { ...r, laps: Number(e.target.value) } : r,
                              ),
                            })
                          }
                          aria-label={tWhat('simLapsField', { n: i + 1 })}
                          aria-invalid={sumOff || undefined}
                          className={cn(
                            'min-h-[44px] w-16 rounded-md border bg-surface px-2 py-1 text-center font-mono text-xs text-ink',
                            sumOff ? 'border-danger ring-1 ring-danger' : 'border-line',
                          )}
                          data-testid={`sim-stint-${i}-laps`}
                        />
                        <button
                          type="button"
                          aria-label={tWhat('simStintLapsInc', { n: i + 1 })}
                          onClick={() =>
                            updateSim({
                              stints: simStints.map((r, k) =>
                                k === i ? { ...r, laps: (r.laps > 0 ? r.laps : 4) + 1 } : r,
                              ),
                            })
                          }
                          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-line text-ink-soft transition-colors hover:bg-raised hover:text-ink"
                          data-testid={`sim-stint-${i}-inc`}
                        >
                          <Plus className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                      {/* v0.9.9 — the unit + the LIVE lap range of this stint
                          (cumulative from the draft): what the user must know
                          before placing an SC/rain window over it. */}
                      <span className="text-ink-faint">{tWhat('simLapsUnit')}</span>
                      <span
                        className="font-mono text-[10px] text-ink-faint"
                        data-testid={`sim-stint-${i}-range`}
                      >
                        {st.laps > 0 ? `V${simRanges[i]!.from}–${simRanges[i]!.to}` : '—'}
                      </span>
                      <button
                        type="button"
                        aria-label={tWhat('simDelete')}
                        onClick={() =>
                          updateSim({ stints: simStints.filter((r) => r.id !== st.id) })
                        }
                        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-line text-ink-soft transition-colors hover:bg-raised hover:text-ink"
                        data-testid={`sim-stint-${i}-delete`}
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                      {/* v0.10.0 step 2 — the inline per-field error (skill:
                          error NEAR the field, validated on change): every
                          laps field shares the blame when the sum is off. */}
                      {sumOff && simLapsTotal != null ? (
                        <p
                          className="basis-full text-[10px] text-danger"
                          data-testid={`sim-stint-${i}-error`}
                        >
                          {tWhat('simStintLapsError', {
                            delta: Math.abs(simSumLaps - simLapsTotal),
                          })}
                        </p>
                      ) : null}
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
            {/* v0.9.9 — the live lap total: updates per keystroke, neutral
                when the draft sums to the race distance, red (with the
                engine's own banner below) otherwise. */}
            {simStints.length > 0 && simLapsTotal != null ? (
              <p
                className={cn(
                  'mt-2 font-mono text-[11px]',
                  simSumLaps === simLapsTotal ? 'text-ink-soft' : 'text-danger',
                )}
                data-testid="sim-total-laps"
              >
                {tWhat('simTotalLaps', { sum: simSumLaps, laps: simLapsTotal })}
              </p>
            ) : null}
            <button
              type="button"
              disabled={simStints.length >= 4}
              onClick={() =>
                updateSim({ stints: [...simStints, { id: nextSimId(), compound: 'S', laps: 10 }] })
              }
              className={cn(
                'mt-2 min-h-[32px] cursor-pointer rounded border px-2.5 py-1 text-xs transition-colors',
                simStints.length >= 4
                  ? 'cursor-not-allowed border-line text-ink-faint'
                  : 'border-line text-ink-soft hover:bg-raised',
              )}
              data-testid="sim-add-stint"
            >
              {tWhat('simAddStint')}
            </button>

            {/* SC/VSC event timeline — v0.9.9: a titled list with visible
                per-row labels ("từ vòng" / "dài … vòng") so which number is
                which is no longer a guessing game. */}
            <div className="mt-4">
              <p className="text-xs font-medium text-ink-soft">{tWhat('simEventsTitle')}</p>
              {simEvents.length === 0 ? (
                <p className="mt-1 text-[11px] text-ink-faint" data-testid="sim-events-empty">
                  {tWhat('simEventsEmpty')}
                </p>
              ) : null}
              <ul className="mt-2 space-y-2" data-testid="sim-events">
                <AnimatePresence initial={false}>
                  {simEvents.map((ev, i) => (
                    <motion.li
                      key={ev.id}
                      layout={!simReduceMotion}
                      initial={simReduceMotion ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{
                        opacity: 0,
                        y: -8,
                        transition: simReduceMotion
                          ? { duration: 0 }
                          : { duration: 0.15, ease: 'easeIn' },
                      }}
                      transition={
                        simReduceMotion
                          ? { duration: 0 }
                          : { type: 'spring', stiffness: 420, damping: 34 }
                      }
                      className="flex flex-wrap items-center gap-2 text-xs"
                      data-testid={`sim-event-row-${i}`}
                    >
                      <select
                        aria-label={tWhat('scMode')}
                        value={ev.mode}
                        onChange={(e) =>
                          updateSim({
                            events: simEvents.map((r, k) =>
                              k === i ? { ...r, mode: e.target.value as 'sc' | 'vsc' } : r,
                            ),
                          })
                        }
                        className="min-h-[44px] rounded-md border border-line bg-surface px-2 py-1 font-mono text-xs text-ink"
                        data-testid={`sim-event-${i}-mode`}
                      >
                        <option value="sc">{tWhat('scModeSC')}</option>
                        <option value="vsc">{tWhat('scModeVSC')}</option>
                      </select>
                      <span className="text-ink-faint">{tWhat('simFromLap')}</span>
                      <input
                        type="number"
                        min={1}
                        max={tyre?.data.laps ?? 999}
                        value={ev.startLap}
                        aria-label={tWhat('scStart', { lap: ev.startLap })}
                        onChange={(e) =>
                          updateSim({
                            events: simEvents.map((r, k) =>
                              k === i ? { ...r, startLap: Number(e.target.value) } : r,
                            ),
                          })
                        }
                        className="min-h-[44px] w-16 rounded-md border border-line bg-surface px-2 py-1 font-mono text-xs text-ink"
                        data-testid={`sim-event-${i}-start`}
                      />
                      <span className="text-ink-faint">{tWhat('simLapsLong')}</span>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={ev.laps}
                        aria-label={tWhat('scWindow', { laps: ev.laps })}
                        onChange={(e) =>
                          updateSim({
                            events: simEvents.map((r, k) =>
                              k === i ? { ...r, laps: Number(e.target.value) } : r,
                            ),
                          })
                        }
                        className="min-h-[44px] w-16 rounded-md border border-line bg-surface px-2 py-1 font-mono text-xs text-ink"
                        data-testid={`sim-event-${i}-laps`}
                      />
                      <span className="text-ink-faint">{tWhat('simLapsUnit')}</span>
                      <button
                        type="button"
                        aria-label={tWhat('simDelete')}
                        onClick={() => updateSim({ events: simEvents.filter((r) => r.id !== ev.id) })}
                        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-line text-ink-soft transition-colors hover:bg-raised hover:text-ink"
                        data-testid={`sim-event-${i}-delete`}
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {/* v0.9.9 — a new event starts at the draft's FIRST PIT (the
                    only place a window can change anything), laps = 3. The
                    old default (lap 1) sat where no pit exists and looked
                    like a dead button. */}
                <button
                  type="button"
                  onClick={() =>
                    updateSim({
                      events: [...simEvents, { id: nextSimId(), mode: 'sc', startLap: simFirstPit, laps: 3 }],
                    })
                  }
                  className="min-h-[32px] cursor-pointer rounded border border-line px-2.5 py-1 text-xs text-ink-soft transition-colors hover:bg-raised"
                  data-testid="sim-add-event"
                >
                  {tWhat('simAddEvent')}
                </button>
                {simEvents.length > 0 ? (
                  <span className="text-[11px] text-ink-faint">{tWhat('simAssumpRatio')}</span>
                ) : null}
                {simEvents.length >= 2 ? (
                  <span className="text-[11px] text-amber">{tWhat('simOverlap')}</span>
                ) : null}
              </div>
            </div>

            {/* rain windows — v0.9.9: titled, labelled, capped at the race
                distance (the UI's own 20-lap cap was never an engine law). */}
            <div className="mt-4">
              <p className="text-xs font-medium text-ink-soft">{tWhat('simRainTitle')}</p>
              {simRain.length === 0 ? (
                <p className="mt-1 text-[11px] text-ink-faint" data-testid="sim-rain-empty">
                  {tWhat('simRainEmpty')}
                </p>
              ) : null}
              <ul className="mt-2 space-y-2" data-testid="sim-rains">
                <AnimatePresence initial={false}>
                  {simRain.map((rw, i) => (
                    <motion.li
                      key={rw.id}
                      layout={!simReduceMotion}
                      initial={simReduceMotion ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{
                        opacity: 0,
                        y: -8,
                        transition: simReduceMotion
                          ? { duration: 0 }
                          : { duration: 0.15, ease: 'easeIn' },
                      }}
                      transition={
                        simReduceMotion
                          ? { duration: 0 }
                          : { type: 'spring', stiffness: 420, damping: 34 }
                      }
                      className="flex flex-wrap items-center gap-2 text-xs"
                      data-testid={`sim-rain-row-${i}`}
                    >
                      <CloudRain className="h-3.5 w-3.5 text-info" aria-hidden="true" />
                      <span className="text-ink-faint">{tWhat('simRainFromLap')}</span>
                      <input
                        type="number"
                        min={1}
                        max={tyre?.data.laps ?? 999}
                        value={rw.startLap}
                        aria-label={tWhat('scStart', { lap: rw.startLap })}
                        onChange={(e) =>
                          updateSim({
                            rain: simRain.map((r, k) =>
                              k === i ? { ...r, startLap: Number(e.target.value) } : r,
                            ),
                          })
                        }
                        className="min-h-[44px] w-16 rounded-md border border-line bg-surface px-2 py-1 font-mono text-xs text-ink"
                        data-testid={`sim-rain-${i}-start`}
                      />
                      <span className="text-ink-faint">{tWhat('simLapsLong')}</span>
                      <input
                        type="number"
                        min={1}
                        max={tyre?.data.laps ?? 999}
                        value={rw.laps}
                        aria-label={tWhat('scWindow', { laps: rw.laps })}
                        onChange={(e) =>
                          updateSim({
                            rain: simRain.map((r, k) =>
                              k === i ? { ...r, laps: Number(e.target.value) } : r,
                            ),
                          })
                        }
                        className="min-h-[44px] w-16 rounded-md border border-line bg-surface px-2 py-1 font-mono text-xs text-ink"
                        data-testid={`sim-rain-${i}-laps`}
                      />
                      <span className="text-ink-faint">{tWhat('simLapsUnit')}</span>
                      <button
                        type="button"
                        aria-label={tWhat('simDelete')}
                        onClick={() => updateSim({ rain: simRain.filter((r) => r.id !== rw.id) })}
                        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-line text-ink-soft transition-colors hover:bg-raised hover:text-ink"
                        data-testid={`sim-rain-${i}-delete`}
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
              {/* v0.9.9 — a new rain window starts at the draft's first pit
                  (the old [1,5] broke the untouched plan instantly) and
                  spans 10 laps. */}
              <button
                type="button"
                onClick={() =>
                  updateSim({ rain: [...simRain, { id: nextSimId(), startLap: simFirstPit, laps: 10 }] })
                }
                className="mt-2 min-h-[32px] cursor-pointer rounded border border-line px-2.5 py-1 text-xs text-ink-soft transition-colors hover:bg-raised"
                data-testid="sim-add-rain"
              >
                {tWhat('simAddRain')}
              </button>
              {simRain.length > 0 ? (
                <p className="mt-1 text-[11px] text-ink-faint" data-testid="sim-rain-hint">
                  {tWhat('simRainHint')}
                </p>
              ) : null}
            </div>

            {/* the sandbox result — engine strings render verbatim.
                v0.9.9: an invalid draft shows the red banner on top AND the
                last valid result dimmed (opacity-60 + simStaleResult) — the
                old behavior replaced the numbers with the error list, so the
                user edited blind.
                v0.10.0 step 2 — a fresh price fades/slides in (200ms, once
                per result-block mount — not per keystroke); the stale block
                fades to 0.6 through motion (the class stays for the test). */}
            <div className="mt-4 border-t border-line pt-3" data-testid="simulator-result">
              {simResult == null ? null : simResult.ok ? (
                <motion.div
                  initial={simReduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={
                    simReduceMotion ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' }
                  }
                >
                  {renderSimPlan(simResult)}
                </motion.div>
              ) : (
                <>
                  <ul className="space-y-1" data-testid="sim-errors">
                    {simResult.errors.map((e, i) => (
                      <li
                        key={i}
                        className="rounded border border-danger/30 bg-danger/5 px-3 py-1.5 text-xs text-danger"
                        data-testid={`sim-error-${i}`}
                      >
                        {e}
                      </li>
                    ))}
                  </ul>
                  {lastGoodSim != null ? (
                    <div className="mt-3">
                      <p className="text-[11px] text-amber" data-testid="sim-stale-note">
                        {tWhat('simStaleResult')}
                      </p>
                      <motion.div
                        className="mt-2 opacity-60"
                        data-testid="sim-stale-result"
                        initial={simReduceMotion ? false : { opacity: 1 }}
                        animate={{ opacity: 0.6 }}
                        transition={
                          simReduceMotion ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' }
                        }
                      >
                        {renderSimPlan(lastGoodSim)}
                      </motion.div>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </section>

          {/* alternatives — v0.9.4: this is the RANKING table (car-1 basis,
              wear-corrected); the per-car proposal lives on the cards above,
              so the basis is named right in the section */}
          <section aria-label={t('alternatives')} className="rounded-lg border border-line bg-panel p-4">
            <h3 className="mb-1 text-[15px] font-semibold text-ink">
              <span className="mr-2 font-mono text-[11px] uppercase tracking-wider text-teal">{tSec('alternatives')}</span>
              {t('alternatives')}
            </h3>
            <p className="mb-3 text-[11px] text-ink-faint">{t('alternativesBasis')}</p>
            <ul className="space-y-2.5">
              {tyre.data.strategies.slice(0, 5).map((s: StrategyResult, i) => (
                <li
                  key={i}
                  className="flex flex-wrap items-center gap-2 text-xs"
                  data-testid={`alt-plan-${i}`}
                >
                  <span className="w-10 font-mono text-ink-faint">
                    {s.stops} pit
                  </span>
                  <span className="flex flex-wrap gap-1">
                    {s.stints.map((st, j) => (
                      <span key={j} className="inline-flex items-center gap-0.5">
                        <CompoundBadge compound={st.compound as CompoundKey} size="sm" />
                        <span className="font-mono text-[10px] text-ink-soft">{st.laps}</span>
                      </span>
                    ))}
                  </span>
                  <span className="ml-auto font-mono">
                    {i === 0 ? (
                      <span className="text-good">{t('fastest')}</span>
                    ) : (
                      <span className={s.vsBestS && s.vsBestS > 15 ? 'text-danger' : 'text-amber'}>
                        +{s.vsBestS?.toFixed(1)}s
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* compound lives */}
          <section aria-label={t('lives')} className="rounded-lg border border-line bg-panel p-4">
            <h3 className="mb-3 text-[15px] font-semibold text-ink">
              <span className="mr-2 font-mono text-[11px] uppercase tracking-wider text-teal">{tSec('lives')}</span>
              {t('lives')}
            </h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(['S', 'M', 'H'] as CompoundKey[]).map((c) => (
                <div key={c} className="flex items-center gap-2 rounded bg-surface px-3 py-2">
                  <CompoundBadge compound={c} />
                  <span className="font-mono text-sm text-ink">{tyre.data.lives[c]}</span>
                  <span className="text-[10px] text-ink-faint">{t('laps')}</span>
                  <span className="ml-auto rounded bg-raised px-1.5 py-0.5 font-mono text-[9px] uppercase text-ink-faint">
                    {t(`source.${tyre.data.lifeSource[c]}`)}
                  </span>
                </div>
              ))}
            </div>
            {tyre.data.wet ? (
              <p className="mt-3 rounded border border-info/30 bg-info/5 px-3 py-2 text-xs text-info">
                {t('wet', { rain: String(tyre.data.wet.rainLikely) })}
              </p>
            ) : null}
          </section>

          {/* recommendation (6-field standard) */}
          {tyre.recommendations.map((rec) => (
            <RecommendationCard key={rec.id} recommendation={rec} />
          ))}

          {/* provenance */}
          <details className="rounded-lg border border-line bg-surface p-4" data-testid="tyre-provenance">
            <summary className="cursor-pointer select-none text-xs font-medium text-ink-soft">
              {t('provenance')}
            </summary>
            <ul className="mt-2 space-y-1">
              {tyre.evidence.map((e, i) => (
                <li key={i} className="text-xs text-ink-soft">
                  <span className="font-mono text-[10px] text-ink-faint">[{e.source}]</span> {e.label}
                </li>
              ))}
              {tyre.assumptions.map((a, i) => (
                <li key={`a${i}`} className="text-xs text-ink-faint">
                  — {a.text}
                  {a.fallbackValue ? <span className="font-mono text-amber"> ({a.fallbackValue})</span> : null}
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </div>
  );
}
