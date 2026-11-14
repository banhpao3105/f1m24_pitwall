'use client';

/**
 * CompoundCompareChart — v0.6.0 step 4 (prompt §4 Tyre Lab): one bar chart
 * per compound metric, shared S/M/H axis:
 *   1. life (laps)            — tyre.data.lives
 *   2. pace delta (+s vs S)   — tyre.data.deltas
 *   3. end-of-life deg (+s/lap) — DEG_FINAL (engine constant, source-labelled)
 * Three separate scales — never merged into one normalised score.
 */

import { useTranslations } from 'next-intl';
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { CompoundKey } from '../CompoundBadge';

/** The chart compares the three dry compounds only (I/W are weather sets). */
type DryCompound = Extract<CompoundKey, 'S' | 'M' | 'H'>;
import { CHART_COLORS, TICK_STYLE, useChartAnimation } from './chart-theme';

const COMPOUND_FILL: Record<DryCompound, string> = {
  S: CHART_COLORS.soft,
  M: CHART_COLORS.medium,
  H: CHART_COLORS.hard,
};

export function CompoundCompareChart({
  lives,
  deltas,
  testId,
}: {
  lives: Record<DryCompound, number>;
  deltas: Record<DryCompound, number>;
  testId?: string;
}) {
  const t = useTranslations('charts.tyre');
  const anim = useChartAnimation();
  const compounds: DryCompound[] = ['S', 'M', 'H'];

  const panels: { key: string; title: string; unit: (v: number) => string; values: Record<DryCompound, number> }[] = [
    {
      key: 'life',
      title: t('life'),
      unit: (v) => `${v.toFixed(0)}`,
      values: lives,
    },
    {
      key: 'delta',
      title: t('delta'),
      unit: (v) => `+${v.toFixed(2)}s`,
      values: deltas,
    },
    {
      key: 'deg',
      title: t('deg'),
      unit: (v) => `+${v.toFixed(1)}s`,
      values: { S: 3.0, M: 2.0, H: 1.8 },
    },
  ];

  return (
    <div className="space-y-4" data-testid={testId ?? 'compound-compare-chart'}>
      {panels.map((panel) => {
        const data = compounds.map((c) => ({ compound: c, value: panel.values[c] ?? 0 }));
        return (
          <div key={panel.key}>
            <p className="mb-1 text-[11px] font-medium text-ink-soft">{panel.title}</p>
            <ResponsiveContainer width="100%" height={compounds.length * 22 + 14}>
              <BarChart data={data} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 0 }}>
                <XAxis type="number" hide domain={[0, 'dataMax']} />
                <YAxis
                  type="category"
                  dataKey="compound"
                  width={26}
                  axisLine={false}
                  tickLine={false}
                  tick={TICK_STYLE}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(46,230,200,0.06)' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0].payload as (typeof data)[number];
                    return (
                      <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-lg">
                        <p className="font-medium text-ink">{row.compound}</p>
                        <p className="mt-1 font-mono text-[11px] text-ink-soft">{panel.unit(row.value)}</p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="value" barSize={12} radius={[0, 3, 3, 0]} {...anim}>
                  {data.map((row) => (
                    <Cell key={row.compound} fill={COMPOUND_FILL[row.compound]} fillOpacity={0.9} />
                  ))}
                  <LabelList
                    dataKey="value"
                    position="right"
                    formatter={(value: number) => panel.unit(value)}
                    style={{ fill: '#92a3b7', fontSize: 10, fontFamily: 'var(--font-jetbrains-mono), monospace' }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        );
      })}
      <p className="text-[10px] text-ink-faint">{t('hint')}</p>
    </div>
  );
}
