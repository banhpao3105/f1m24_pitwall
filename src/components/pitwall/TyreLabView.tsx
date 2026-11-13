'use client';

/**
 * Tyre Lab — Phase 2 (docs/04 §7.3.3): hero recommendation card,
 * alternatives with time deltas, WHAT-IF (pit shift slider + rain toggle
 * — docs/03 §5.3), compound lives, observed data, provenance.
 */

import { useTranslations, useLocale } from 'next-intl';
import { useMemo, useState } from 'react';
import { Waves, SlidersHorizontal, CloudRain } from 'lucide-react';
import type { SaveModel } from '@/domain/types';
import { trackDisplay } from '@/lib/track-display';
import { useTyreLab } from '@/lib/engine-hooks';
import { whatIfPitShift, buildWetPlan } from '@/engines/tyre.engine';
import { RecommendationCard } from './RecommendationCard';
import { ConfidenceBadge } from './ConfidenceBadge';
import { StintTimeline } from './StintTimeline';
import { PitWindowBar } from './PitWindowBar';
import { DegCurveChart } from './charts/DegCurveChart';
import { CompoundBadge, type CompoundKey } from './CompoundBadge';
import type { StrategyResult } from '@/engines/tyre.engine';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

export function TyreLabView({
  model,
  raceId,
}: {
  model: SaveModel;
  raceId: number | null;
}) {
  const t = useTranslations('tyres');
  const tWhat = useTranslations('whatif');
  const locale = useLocale() as 'vi' | 'en';
  const tyre = useTyreLab(raceId);

  // what-if local state (docs/03 §5.3: pit sớm/muộn ±, toggle mưa)
  const [pitShift, setPitShift] = useState(0);
  const [rainOn, setRainOn] = useState(false);

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
    return buildWetPlan(model, tyre.data.laps);
  }, [model, rainOn, tyre]);

  const seasonRaces = model.races.filter((r) => r.seasonId === model.meta.seasonId);
  const race = seasonRaces.find((r) => r.raceId === raceId) ?? seasonRaces.find((r) => r.state !== 2) ?? seasonRaces.at(-1) ?? null;

  if (!race) {
    return (
      <p className="rounded-lg border border-line bg-panel p-6 text-sm text-ink-faint">
        {t('noRace')}
      </p>
    );
  }

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

      {!tyre || !tyre.data.best ? (
        <p className="rounded-lg border border-line bg-panel p-6 text-sm text-ink-faint">
          {t('noPlan')}
        </p>
      ) : (
        <>
          {/* hero plan */}
          <section aria-label={t('hero')} className="rounded-lg border border-teal/30 bg-panel p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-teal">
                {t('heroPlan', {
                  plan: tyre.data.best.stints.map((s) => `${s.compound}(${s.laps})`).join(' → '),
                  stops: tyre.data.best.stops,
                })}
              </h3>
              {tyre.data.expectedStops != null ? (
                <span className="rounded bg-raised px-2 py-0.5 font-mono text-[10px] text-ink-soft">
                  {t('expectedStops', { stops: tyre.data.expectedStops, source: t(`source.${tyre.data.expectedSource ?? 'model'}`) })}
                </span>
              ) : null}
              {/* 0.4.1: reconcile the two numbers when they differ — the field
                  average is reference data, the plan is the time optimum. */}
              {tyre.data.expectedStops != null &&
              tyre.data.expectedStops !== tyre.data.best.stops ? (
                <p className="mt-2 text-[11px] leading-relaxed text-ink-faint" data-testid="tyre-stops-reconcile">
                  {t('stopsReconcile', {
                    expected: tyre.data.expectedStops,
                    source: t(`source.${tyre.data.expectedSource ?? 'model'}`),
                    plan: tyre.data.best.stops,
                  })}
                </p>
              ) : null}
            </div>
            <StintTimeline
              stints={tyre.data.best.stints}
              totalLaps={tyre.data.laps}
              pitLaps={tyre.data.best.pitLaps}
            />
            {tyre.data.best.pitLaps.length > 0 ? (
              <div className="mt-4">
                <PitWindowBar
                  optimalLap={tyre.data.best.pitLaps[0]}
                  windowLo={Math.max(2, tyre.data.best.pitLaps[0] - 2)}
                  windowHi={tyre.data.best.pitLaps[0] + 2}
                  totalLaps={tyre.data.laps}
                  lifeCap={tyre.data.lives[tyre.data.best.stints[0].compound as CompoundKey]}
                />
              </div>
            ) : null}
          </section>

          {/* degradation curves — engine constants visualised (v0.5.0 step 2) */}
          <section aria-label={t('degTitle')} className="rounded-lg border border-line bg-panel p-4">
            <header className="mb-3 flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-ink">{t('degTitle')}</h3>
              <span className="rounded bg-raised px-1.5 py-0.5 font-mono text-[9px] uppercase text-ink-faint">
                {t(`source.${tyre.data.lifeSource.S}`)}
              </span>
            </header>
            <DegCurveChart
              data={{
                laps: tyre.data.laps,
                deltas: tyre.data.deltas,
                lives: tyre.data.lives,
                pitLap: tyre.data.best.pitLaps[0],
                firstCompound: tyre.data.best.stints[0]?.compound as CompoundKey | undefined,
              }}
            />
          </section>

          {/* what-if (Phase 2) */}
          <section aria-label={tWhat('title')} className="rounded-lg border border-line bg-panel p-4" data-testid="tyre-whatif">
            <header className="mb-3 flex flex-wrap items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-teal" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-ink">{tWhat('title')}</h3>
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

          {/* alternatives */}
          <section aria-label={t('alternatives')} className="rounded-lg border border-line bg-panel p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink">{t('alternatives')}</h3>
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
            <h3 className="mb-3 text-sm font-semibold text-ink">{t('lives')}</h3>
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
