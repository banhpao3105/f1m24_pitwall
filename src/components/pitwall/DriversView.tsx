'use client';

/**
 * Drivers view — Phase 2 (docs/04 §7.3.5): driver cards (form, medians,
 * tyre preservation), teammate duel head-to-head (JTBD #8), personnel
 * recommendations. Data comes from the personnel engine (verified races
 * data + adaptive contracts) — no SQL here.
 */

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Users, Swords, Trophy } from 'lucide-react';
import type { SaveModel } from '@/domain/types';
import type { DriverCard as DriverCardModel } from '@/engines/personnel.engine';
import { usePersonnel, useDriverDuel } from '@/lib/engine-hooks';
import { RecommendationCard } from './RecommendationCard';
import { ConfidenceBadge } from './ConfidenceBadge';
import { DataUnavailable } from './DataUnavailable';
import { DriverAvatar } from './TeamIdentity';
import { Sparkline } from './charts/Sparkline';
import { teamColour } from '@/lib/team-colours';
import { formatSigned } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

const FORM_TONE: Record<string, string> = {
  W: 'border-good/50 bg-good/10 text-good',
  DNF: 'border-danger/50 bg-danger/10 text-danger',
};

function FormChips({ chips }: { chips: DriverCardModel['form'] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {chips.map((c, i) => (
        <span
          key={`${c.raceId}-${i}`}
          className={cn(
            'inline-flex min-w-6 items-center justify-center rounded border px-1 py-0.5 font-mono text-[9px]',
            FORM_TONE[c.label] ?? 'border-line bg-raised text-ink-soft',
          )}
          title={`Race ${c.raceId}`}
        >
          {c.label}
        </span>
      ))}
    </span>
  );
}

function DriverCardItem({
  driver,
  model,
  pointsSeries,
  gainedTotal,
}: {
  driver: DriverCardModel;
  model: SaveModel;
  pointsSeries: number[];
  gainedTotal: number;
}) {
  const t = useTranslations('drivers');
  const teamId = model.drivers.find((d) => d.staffId === driver.staffId)?.teamId;
  const colour = teamColour(model, teamId);
  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'rounded-lg border bg-panel p-4',
        driver.isPlayer ? 'border-amber/40' : 'border-line',
      )}
      style={{ borderLeft: `3px solid ${colour}` }}
      data-testid={`driver-card-${driver.staffId}`}
    >
      <header className="flex flex-wrap items-center gap-2">
        {/* avatar initials on the team livery colour (v0.5.0 step 3) */}
        <DriverAvatar model={model} teamId={teamId} name={driver.name} />
        <h3 className="text-sm font-semibold text-ink">{driver.name}</h3>
        <span className="font-mono text-[10px] text-ink-faint">{driver.teamName ?? '—'}</span>
        {driver.position != null ? (
          <span className="ml-auto font-mono text-xs text-amber">
            P{driver.position} · {driver.points ?? 0} pts
          </span>
        ) : null}
      </header>
      {/* v0.6.0 step 5 — per-race points sparkline + window gained */}
      <div className="mt-2 flex items-center gap-2 text-[11px]">
        <span className="shrink-0 text-ink-faint">{t('form6')}</span>
        <Sparkline values={pointsSeries} testId={`driver-spark-${driver.staffId}`} />
        <span className="ml-auto font-mono text-ink-faint">{t('gained6')}</span>
        <span
          className={cn(
            'font-mono',
            gainedTotal > 0 ? 'text-good' : gainedTotal < 0 ? 'text-danger' : 'text-ink-soft',
          )}
          data-testid={`driver-gained-${driver.staffId}`}
        >
          {formatSigned(gainedTotal)}
        </span>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <div className="flex items-center justify-between gap-1">
          <dt className="text-ink-faint">{t('form')}</dt>
          <dd>
            {driver.form.length > 0 ? (
              <FormChips chips={driver.form} />
            ) : (
              <span className="text-ink-faint">—</span>
            )}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-1">
          <dt className="text-ink-faint">{t('qualiMed')}</dt>
          <dd className="font-mono text-ink">
            {driver.qualiMedian != null ? `P${driver.qualiMedian}` : '—'}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-1">
          <dt className="text-ink-faint">{t('raceMed')}</dt>
          <dd className="font-mono text-ink">
            {driver.raceMedian != null ? `P${driver.raceMedian}` : '—'}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-1">
          <dt className="text-ink-faint" title={t('stintHint')}>{t('stint')}</dt>
          <dd className="font-mono text-ink">
            {driver.avgStintLaps != null ? `${driver.avgStintLaps} ${t('laps')}` : '—'}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-1">
          <dt className="text-ink-faint">{t('dnfRate')}</dt>
          <dd className="font-mono text-ink">
            {driver.dnfRate != null ? `${Math.round(driver.dnfRate * 100)}%` : '—'}
          </dd>
        </div>
      </dl>
    </motion.article>
  );
}

export function DriversView({ model }: { model: SaveModel }) {
  const t = useTranslations('drivers');
  const personnel = usePersonnel();

  /* v0.6.0 step 5 — per-driver per-race points (sparkline) + positions
   * gained over the same 6-race window the pace boards use. Computed from
   * Races_Results rows — no engine change. */
  const windowRaces = model.races
    .filter((r) => r.seasonId === model.meta.seasonId && r.state === 2)
    .sort((a, b) => a.day - b.day)
    .slice(-6);
  const seriesByDriver = new Map<number, { points: number[]; gained: number }>();
  for (const race of windowRaces) {
    for (const res of race.results) {
      const e = seriesByDriver.get(res.driverId) ?? { points: [], gained: 0 };
      e.points.push(res.points);
      if (!res.dnf && res.startingPos != null) e.gained += res.startingPos - res.finishingPos;
      seriesByDriver.set(res.driverId, e);
    }
  }
  const pointsSeriesOf = (staffId: number): number[] =>
    seriesByDriver.get(staffId)?.points ?? windowRaces.map(() => 0);
  const gainedOf = (staffId: number): number => seriesByDriver.get(staffId)?.gained ?? 0;
  const avgFinishOf = (staffId: number): number | null => {
    const vals = windowRaces
      .flatMap((r) => r.results)
      .filter((res) => res.driverId === staffId && !res.dnf)
      .map((res) => res.finishingPos);
    return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  };

  const drivers = personnel?.data.drivers ?? [];
  const playerFirst = [...drivers].sort((a, b) => {
    if (a.isPlayer !== b.isPlayer) return a.isPlayer ? -1 : 1;
    return (a.position ?? 99) - (b.position ?? 99);
  });

  const selectable = drivers.length > 0 ? drivers : model.drivers.map((d) => ({
    staffId: d.staffId,
    name: d.fullName,
  }));
  const defaultA = selectable[0]?.staffId ?? null;
  const defaultB = selectable[1]?.staffId ?? null;
  const [aId, setAId] = useState<number | null>(defaultA);
  const [bId, setBId] = useState<number | null>(defaultB);
  const duel = useDriverDuel(aId, bId);

  if (!personnel) return null;

  return (
    <div className="space-y-5" data-testid="drivers-view">
      <header className="flex flex-wrap items-center gap-2">
        <Users className="h-4 w-4 text-amber" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-ink">{t('title')}</h2>
        <span className="ml-auto">
          <ConfidenceBadge confidence={personnel.confidence} />
        </span>
      </header>

      {personnel.recommendations.map((rec) => (
        <RecommendationCard key={rec.id} recommendation={rec} />
      ))}

      {selectable.length === 0 ? (
        <DataUnavailable title={t('noData')} detail={t('noDataHint')} />
      ) : (
        <>
          <section
            aria-label={t('cards')}
            className="max-h-[480px] overflow-y-auto pitwall-scroll pr-1"
            data-testid="driver-cards"
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {playerFirst.map((d) => (
                <DriverCardItem
                  key={d.staffId}
                  driver={d}
                  model={model}
                  pointsSeries={pointsSeriesOf(d.staffId)}
                  gainedTotal={gainedOf(d.staffId)}
                />
              ))}
            </div>
          </section>

          {/* duel */}
          <section aria-label={t('duelTitle')} className="rounded-lg border border-line bg-panel p-4">
            <header className="mb-3 flex flex-wrap items-center gap-2">
              <Swords className="h-4 w-4 text-teal" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-ink">{t('duelTitle')}</h3>
              {duel ? <ConfidenceBadge confidence={duel.confidence} /> : null}
            </header>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Select
                value={aId != null ? String(aId) : undefined}
                onValueChange={(v) => setAId(Number(v))}
              >
                <SelectTrigger aria-label={t('pickA')} className="border-line bg-surface text-ink">
                  <SelectValue placeholder={t('pickA')} />
                </SelectTrigger>
                <SelectContent className="border-line bg-surface">
                  {selectable.map((d) => (
                    <SelectItem key={d.staffId} value={String(d.staffId)}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={bId != null ? String(bId) : undefined}
                onValueChange={(v) => setBId(Number(v))}
              >
                <SelectTrigger aria-label={t('pickB')} className="border-line bg-surface text-ink">
                  <SelectValue placeholder={t('pickB')} />
                </SelectTrigger>
                <SelectContent className="border-line bg-surface">
                  {selectable.map((d) => (
                    <SelectItem key={d.staffId} value={String(d.staffId)}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {duel && duel.data.h2h.races > 0 ? (
              <div className="mt-3 space-y-2" data-testid="duel-panel">
                <div className="grid grid-cols-3 items-center gap-2 rounded bg-surface px-3 py-2 text-xs">
                  <span className="truncate text-right font-mono text-ink">{duel.data.a.name}</span>
                  <span className="text-center font-mono text-[10px] uppercase text-ink-faint">
                    {t('h2h')}
                  </span>
                  <span className="truncate font-mono text-ink">{duel.data.b.name}</span>
                </div>
                {/* v0.6.0 step 5 — the duel as paired bars: points, average
                    finish, races finished ahead. Same numbers as the rows
                    below, just drawn (no new metric). */}
                <div className="space-y-1.5" data-testid="duel-bars">
                  {([
                    {
                      key: 'points',
                      label: t('points'),
                      a: duel.data.a.points ?? 0,
                      b: duel.data.b.points ?? 0,
                      fmt: (v: number | null) => `${v ?? 0}`,
                    },
                    {
                      key: 'avgFinish',
                      label: t('avgFinish'),
                      a: avgFinishOf(duel.data.a.staffId),
                      b: avgFinishOf(duel.data.b.staffId),
                      fmt: (v: number | null) => (v != null ? `P${v.toFixed(1)}` : '—'),
                    },
                    {
                      key: 'ahead',
                      label: t('racesAhead'),
                      a: duel.data.h2h.raceA,
                      b: duel.data.h2h.raceB,
                      fmt: (v: number | null) => `${v ?? 0}`,
                    },
                  ] as const).map((row) => {
                    const va = row.a;
                    const vb = row.b;
                    const invert = row.key === 'avgFinish'; // lower = better
                    const wa =
                      va == null || vb == null || (va + vb) === 0
                        ? 50
                        : invert
                          ? (1 - va / (va + vb)) * 100
                          : (va / (va + vb)) * 100;
                    return (
                      <div key={row.key} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-[11px]">
                        <span className="h-1.5 justify-self-end rounded bg-teal/80" style={{ width: `${wa}%` }} />
                        <span className="w-28 text-center text-ink-faint">{row.label}</span>
                        <span
                          className="h-1.5 justify-self-start rounded bg-amber/80"
                          style={{ width: `${100 - wa}%` }}
                        />
                        <span className="col-span-3 flex justify-between font-mono text-[10px] text-ink-soft">
                          <span>{row.fmt(va)}</span>
                          <span>{row.fmt(vb)}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="grid grid-cols-3 items-center gap-2 text-xs">
                  <span className="text-right font-mono text-ink">{duel.data.h2h.qualiA}</span>
                  <span className="text-center text-ink-faint">{t('h2hQuali')}</span>
                  <span className="font-mono text-ink">{duel.data.h2h.qualiB}</span>
                </div>
                <div className="grid grid-cols-3 items-center gap-2 text-xs">
                  <span className="text-right font-mono text-ink">{duel.data.h2h.raceA}</span>
                  <span className="text-center text-ink-faint">{t('h2hRace')}</span>
                  <span className="font-mono text-ink">{duel.data.h2h.raceB}</span>
                </div>
                <div className="grid grid-cols-3 items-center gap-2 text-xs">
                  <span className="text-right font-mono text-amber">{duel.data.a.points ?? 0}</span>
                  <span className="text-center text-ink-faint">{t('points')}</span>
                  <span className="font-mono text-amber">{duel.data.b.points ?? 0}</span>
                </div>
                <div className="grid grid-cols-3 items-center gap-2 text-xs">
                  <span className="text-right font-mono text-teal">{duel.data.a.avgStintLaps ?? '—'}</span>
                  <span className="text-center text-ink-faint" title={t('stintHint')}>
                    {t('stint')}
                  </span>
                  <span className="font-mono text-teal">{duel.data.b.avgStintLaps ?? '—'}</span>
                </div>
                {duel.recommendations.map((rec) => (
                  <RecommendationCard key={rec.id} recommendation={rec} />
                ))}
              </div>
            ) : (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-faint">
                <Trophy className="h-3 w-3" aria-hidden="true" />
                {t('duelNoData')}
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
