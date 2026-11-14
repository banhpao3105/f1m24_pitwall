'use client';

/**
 * GainedBarChart — v0.6.0 step 2 (prompt §2c): the player's per-race
 * positions gained (Σ startingPos − finishingPos of classified cars),
 * green bars when positive, red when negative. Same per-race numbers as
 * the results board — no new metric, no recomputation.
 */

import { useTranslations } from 'next-intl';
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { SeasonSeries } from '@/engines/dashboard.engine';
import { CHART_COLORS, TICK_STYLE, useChartAnimation } from './chart-theme';
import { formatSigned } from '@/lib/utils';

export function GainedBarChart({
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
    gained: series.positionsGainedPerRace[i] ?? 0,
  }));

  return (
    <div data-testid={testId ?? 'gained-bar-chart'}>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 18, right: 12, bottom: 0, left: -18 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="race" tick={TICK_STYLE} tickLine={false} axisLine={{ stroke: CHART_COLORS.grid }} interval={0} />
          <YAxis tick={TICK_STYLE} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => `${v}`} />
          <Tooltip
            cursor={{ fill: 'rgba(46,230,200,0.06)' }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const value = payload[0].value as number;
              return (
                <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-lg">
                  <p className="font-medium text-ink">{label as string}</p>
                  <p className="mt-1 font-mono text-[11px] text-ink-soft">
                    {t('gained')}: <span className={`tabular-nums ${value >= 0 ? 'text-good' : 'text-danger'}`}>{formatSigned(value)}</span>
                  </p>
                </div>
              );
            }}
          />
          <ReferenceLine y={0} stroke={CHART_COLORS.axis} />
          <Bar dataKey="gained" barSize={26} radius={[3, 3, 0, 0]} {...anim}>
            {data.map((row) => (
              <Cell
                key={row.race}
                fill={row.gained >= 0 ? CHART_COLORS.good : CHART_COLORS.danger}
                fillOpacity={0.85}
              />
            ))}
            <LabelList
              dataKey="gained"
              position="top"
              formatter={(value: number) => formatSigned(value)}
              style={{ fill: '#92a3b7', fontSize: 10, fontFamily: 'var(--font-jetbrains-mono), monospace' }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
