'use client';

/**
 * Tyre Lab — Phase 2 (docs/04 §7.3.3): hero recommendation card,
 * alternatives with time deltas, WHAT-IF (pit shift slider + rain toggle
 * — docs/03 §5.3), compound lives, observed data, provenance.
 */

import { useTranslations, useLocale } from 'next-intl';
import { useMemo, useState, useEffect, useRef } from 'react';
import { Waves, SlidersHorizontal, CloudRain, Flag, Activity, Bot, ClipboardCheck, Check, CircleAlert } from 'lucide-react';
import type { SaveModel } from '@/domain/types';
import { trackDisplay } from '@/lib/track-display';
import { getTrackCorrection, putTrackCorrection, TRACK_CORRECTIONS_VERSION } from '@/lib/track-corrections';
import { useTyreLab } from '@/lib/engine-hooks';
import { whatIfPitShift, whatIfSCVSC, buildWetPlan, type TyreLabPrior, type PaceMeasuredEntry } from '@/engines/tyre.engine';
import { RecommendationCard } from './RecommendationCard';
import { ConfidenceBadge } from './ConfidenceBadge';
import { StintTimeline } from './StintTimeline';
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

          {/* what-if (Phase 2) */}
          <section aria-label={tWhat('title')} className="rounded-lg border border-line bg-panel p-4" data-testid="tyre-whatif">
            <header className="mb-3 flex flex-wrap items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-teal" aria-hidden="true" />
              <span className="font-mono text-[11px] uppercase tracking-wider text-teal">{tSec('whatif')}</span>
              <h3 className="text-[15px] font-semibold text-ink">{tWhat('title')}</h3>
            </header>
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
