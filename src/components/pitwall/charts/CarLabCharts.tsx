'use client';

/**
 * Car Lab charts — v0.5.0 Step 2 (prompt §2 Bước 2).
 *   CarLeagueChart: horizontal bars, one per team. Bar length is the
 *   inverted pace rank (longest = fastest) — a visual transform of the
 *   engine rank, labelled explicitly, never a made-up score (0.5.3: the
 *   design-points source no longer exists).
 *   PartConditionChart: condition average per part group with the WATCH
 *   threshold (car.engine DURABILITY_RISK_WATCH_BELOW = 0.7) as a vertical
 *   reference line; worst group sorts first.
 */

import { useTranslations } from 'next-intl';
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { CarLeagueRow, PartConditionRow } from '@/engines/car.engine';
import type { SaveModel } from '@/domain/types';
import { teamColour, FALLBACK_TEAM_COLOUR } from '@/lib/team-colours';
import { CHART_COLORS, TICK_STYLE, useChartAnimation } from './chart-theme';

export function CarLeagueChart({
  rows,
  model,
}: {
  rows: CarLeagueRow[];
  /** Team identity (v0.5.0 step 3) — real liveries when available. */
  model?: SaveModel;
}) {
  const t = useTranslations('charts.car');
  const anim = useChartAnimation();

  if (rows.length === 0) {
    return <p className="text-xs text-ink-faint">{t('noLeague')}</p>;
  }

  const total = rows.length;
  const data = rows.map((r) => ({
    ...r,
    // bar = inverted rank (visual only) — never a made-up score.
    value: total + 1 - (r.rank ?? total),
  }));
  // Player first visually? Keep board order (rank ascending) — fastest top.
  const ordered = [...data].sort((a, b) => b.value - a.value).reverse();

  return (
    <div style={{ width: '100%', height: rows.length * 26 + 24 }} data-testid="car-league-chart">
      <ResponsiveContainer>
        <BarChart data={ordered} layout="vertical" margin={{ top: 4, right: 52, bottom: 0, left: 0 }}>
          <XAxis type="number" hide domain={[0, 'dataMax']} />
          <YAxis
            type="category"
            dataKey="teamName"
            width={150}
            axisLine={false}
            tickLine={false}
            tick={TICK_STYLE}
          />
          <Tooltip
            cursor={{ fill: 'rgba(46,230,200,0.06)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as (typeof ordered)[number];
              return (
                <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-lg">
                  <p className="font-medium text-ink">{row.teamName}</p>
                  <p className="mt-1 font-mono text-[11px] text-ink-soft">
                    {`P${row.rank ?? '—'} · ${t('rankInverted')}`}
                  </p>
                </div>
              );
            }}
          />
          <Bar dataKey="value" barSize={14} radius={[0, 3, 3, 0]} {...anim}>
            {ordered.map((row) => {
              const livery = model ? teamColour(model, row.teamId) : FALLBACK_TEAM_COLOUR;
              const fill = row.isPlayer
                ? CHART_COLORS.player
                : livery === FALLBACK_TEAM_COLOUR
                  ? CHART_COLORS.bar
                  : livery;
              return (
                <Cell
                  key={row.teamId}
                  fill={fill}
                  stroke={row.isPlayer ? CHART_COLORS.playerStroke : undefined}
                  strokeWidth={row.isPlayer ? 1 : 0}
                />
              );
            })}
            <LabelList
              dataKey="value"
              position="right"
              formatter={(value: number) => `P${total + 1 - value}`}
              style={{ fill: '#92a3b7', fontSize: 10, fontFamily: 'var(--font-jetbrains-mono), monospace' }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-1 text-[10px] text-ink-faint">
        {t('byPace')}
      </p>
    </div>
  );
}

export function PartConditionChart({ rows }: { rows: PartConditionRow[] }) {
  const t = useTranslations('charts.car');
  const anim = useChartAnimation();

  const usable = rows.filter((r) => r.conditionAvg != null);
  if (usable.length === 0) {
    return <p className="text-xs text-ink-faint">{t('noCondition')}</p>;
  }

  const data = usable
    .map((r) => ({ ...r, pct: Math.round((r.conditionAvg as number) * 100) }))
    .sort((a, b) => a.pct - b.pct); // worst first (bottom of chart → draw reversed)

  return (
    <div style={{ width: '100%', height: data.length * 28 + 24 }} data-testid="part-condition-chart">
      <ResponsiveContainer>
        <BarChart data={[...data].reverse()} layout="vertical" margin={{ top: 4, right: 48, bottom: 0, left: 0 }}>
          <XAxis type="number" hide domain={[0, 100]} />
          <YAxis
            type="category"
            dataKey="partType"
            width={110}
            axisLine={false}
            tickLine={false}
            tick={TICK_STYLE}
          />
          <ReferenceLine
            x={70}
            stroke={CHART_COLORS.amber}
            strokeDasharray="4 4"
            label={{
              value: t('watchLine'),
              position: 'top',
              fill: CHART_COLORS.amber,
              fontSize: 10,
              fontFamily: 'var(--font-jetbrains-mono), monospace',
            }}
          />
          <Tooltip
            cursor={{ fill: 'rgba(46,230,200,0.06)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as (typeof data)[number];
              return (
                <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-lg">
                  <p className="font-medium text-ink">{row.partType}</p>
                  <p className="mt-1 font-mono text-[11px] text-ink-soft">
                    {row.pct}% · {row.count} {t('parts')}
                  </p>
                </div>
              );
            }}
          />
          <Bar dataKey="pct" barSize={14} radius={[0, 3, 3, 0]} {...anim}>
            {data.map((row) => (
              <Cell
                key={row.partType}
                fill={row.pct < 40 ? CHART_COLORS.danger : row.pct < 70 ? CHART_COLORS.amber : CHART_COLORS.good}
              />
            ))}
            <LabelList
              dataKey="pct"
              position="right"
              formatter={(value: number) => `${value}%`}
              style={{ fill: '#92a3b7', fontSize: 10, fontFamily: 'var(--font-jetbrains-mono), monospace' }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
