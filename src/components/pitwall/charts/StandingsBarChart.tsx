'use client';

/**
 * StandingsBarChart — v0.5.0 Step 2 (prompt §2 Bước 2, Season).
 * Horizontal point bars for the top N rows of a standings table. Values
 * are the stored `points` of the Normalized Model — player team/driver
 * highlighted amber, everyone else slate.
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
import type { StandingRow } from '@/domain/types';
import { CHART_COLORS, TICK_STYLE, useChartAnimation } from './chart-theme';

export function StandingsBarChart({
  rows,
  highlightIds,
  testId,
}: {
  rows: StandingRow[];
  /** Player team id — or the player's driver ids for the drivers table. */
  highlightIds: number[];
  testId?: string;
}) {
  const t = useTranslations('charts.season');
  const anim = useChartAnimation();
  const top = rows.slice(0, 8);

  if (top.length === 0) {
    return <p className="text-xs text-ink-faint">{t('noData')}</p>;
  }

  const data = [...top].reverse(); // leader ends up at the top of the chart

  return (
    <div style={{ width: '100%', height: top.length * 26 + 24 }} data-testid={testId}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 44, bottom: 0, left: 0 }}>
          <XAxis type="number" hide domain={[0, 'dataMax']} />
          <YAxis
            type="category"
            dataKey="name"
            width={150}
            axisLine={false}
            tickLine={false}
            tick={TICK_STYLE}
          />
          <Tooltip
            cursor={{ fill: 'rgba(46,230,200,0.06)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as StandingRow;
              return (
                <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-lg">
                  <p className="font-medium text-ink">{row.name}</p>
                  <p className="mt-1 font-mono text-[11px] text-ink-soft">
                    P{row.position} · {row.points} {t('points')}
                  </p>
                </div>
              );
            }}
          />
          <Bar dataKey="points" barSize={14} radius={[0, 3, 3, 0]} {...anim}>
            {data.map((row) => (
              <Cell
                key={row.id}
                fill={highlightIds.includes(row.id) ? CHART_COLORS.amber : CHART_COLORS.bar}
              />
            ))}
            <LabelList
              dataKey="points"
              position="right"
              style={{ fill: '#92a3b7', fontSize: 10, fontFamily: 'var(--font-jetbrains-mono), monospace' }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
