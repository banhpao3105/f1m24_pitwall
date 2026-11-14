'use client';

/**
 * PaceGapLineChart — v0.6.0 step 2 (prompt §2b): the player's per-race pace
 * gap, two lines (peak = fastest lap, race = average raced lap) + the zero
 * line of the session's fastest team. Gap values arrive VERBATIM from the
 * pace boards via buildSeasonSeries (raceDeltasS) — nothing recomputed.
 */

import { useTranslations } from 'next-intl';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { SeasonSeries } from '@/engines/dashboard.engine';
import { CHART_COLORS, TICK_STYLE, useChartAnimation } from './chart-theme';

export function PaceGapLineChart({
  series,
  testId,
}: {
  series: SeasonSeries;
  testId?: string;
}) {
  const t = useTranslations('charts.series');
  const anim = useChartAnimation();

  if (series.races.length === 0) {
    return <p className="text-xs text-ink-faint">{t('noData')}</p>;
  }

  const data = series.races.map((race, i) => ({
    race: race.trackName,
    peak: series.paceGapPerRace.peak[i] ?? null,
    raceGap: series.paceGapPerRace.race[i] ?? null,
  }));

  return (
    <div data-testid={testId ?? 'pace-gap-line-chart'}>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="race" tick={TICK_STYLE} tickLine={false} axisLine={{ stroke: CHART_COLORS.grid }} interval={0} />
          <YAxis
            tick={TICK_STYLE}
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={(v: number) => `${v.toFixed(1)}s`}
          />
          <Tooltip
            cursor={{ stroke: CHART_COLORS.axis, strokeDasharray: '4 4' }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as (typeof data)[number];
              return (
                <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-lg">
                  <p className="font-medium text-ink">{label as string}</p>
                  <p className="mt-1 flex items-center gap-1.5 font-mono text-[11px] text-ink-soft">
                    <span aria-hidden="true" className="h-2 w-2 rounded-sm" style={{ backgroundColor: CHART_COLORS.info }} />
                    {t('peak')}: <span className="tabular-nums text-ink">{row.peak != null ? `+${row.peak.toFixed(3)}s` : '—'}</span>
                  </p>
                  <p className="flex items-center gap-1.5 font-mono text-[11px] text-ink-soft">
                    <span aria-hidden="true" className="h-2 w-2 rounded-sm" style={{ backgroundColor: CHART_COLORS.player }} />
                    {t('race')}: <span className="tabular-nums text-ink">{row.raceGap != null ? `+${row.raceGap.toFixed(3)}s` : '—'}</span>
                  </p>
                </div>
              );
            }}
          />
          <ReferenceLine
            y={0}
            stroke={CHART_COLORS.axis}
            strokeDasharray="4 4"
            label={{ value: t('zero'), position: 'insideTopRight', fill: CHART_COLORS.axis, fontSize: 10 }}
          />
          <Line
            type="monotone"
            dataKey="peak"
            name={t('peak')}
            stroke={CHART_COLORS.info}
            strokeWidth={2}
            dot={{ r: 2.5 }}
            activeDot={{ r: 4 }}
            connectNulls
            {...anim}
          />
          <Line
            type="monotone"
            dataKey="raceGap"
            name={t('race')}
            stroke={CHART_COLORS.player}
            strokeWidth={2.5}
            dot={{ r: 2.5 }}
            activeDot={{ r: 4 }}
            connectNulls
            {...anim}
          />
        </LineChart>
      </ResponsiveContainer>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1" aria-hidden="true">
        <li className="flex items-center gap-1.5 text-[10px] text-ink-faint">
          <span className="h-0.5 w-4" style={{ backgroundColor: CHART_COLORS.info }} />
          {t('peak')}
        </li>
        <li className="flex items-center gap-1.5 text-[10px] text-ink-faint">
          <span className="h-0.5 w-4" style={{ backgroundColor: CHART_COLORS.player }} />
          {t('race')}
        </li>
      </ul>
    </div>
  );
}
