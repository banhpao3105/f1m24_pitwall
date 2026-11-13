'use client';

/**
 * Tyre Lab (minimal v1) — docs/04 §7.3.3: hero recommendation card,
 * alternatives with time deltas, compound lives, observed data,
 * provenance. What-if sliders are Phase 2 (backlog).
 */

import { useTranslations } from 'next-intl';
import { Waves } from 'lucide-react';
import type { SaveModel } from '@/domain/types';
import { useTyreLab } from '@/lib/engine-hooks';
import { RecommendationCard } from './RecommendationCard';
import { ConfidenceBadge } from './ConfidenceBadge';
import { StintTimeline } from './StintTimeline';
import { PitWindowBar } from './PitWindowBar';
import { CompoundBadge, type CompoundKey } from './CompoundBadge';
import type { StrategyResult } from '@/engines/tyre.engine';

export function TyreLabView({
  model,
  raceId,
}: {
  model: SaveModel;
  raceId: number | null;
}) {
  const t = useTranslations('tyres');
  const tyre = useTyreLab(raceId);

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
        <span className="font-mono text-xs text-teal">{race.trackName}</span>
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
