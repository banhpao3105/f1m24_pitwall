'use client';

/**
 * PaceBarChart — v0.5.0 Step 2 (prompt §2 Bước 2).
 * Horizontal bars: one per team, length = median pace delta (s) to the
 * fastest team of the board. The number IS the engine's `paceDeltaS`
 * minus the board minimum — no recomputation of pace anywhere.
 *   player team  → teal + bright stroke
 *   rivalRef     → amber (the same team playerVsRivalS quotes)
 *   everyone     → slate blue-grey
 * Tooltip: rank + median gap + sample count. 1-line conclusion stays in
 * the parent section (i18n pace.vsRival).
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
import type { PaceTeamRow } from '@/engines/pace.engine';
import type { SaveModel } from '@/domain/types';
import { teamColour, FALLBACK_TEAM_COLOUR } from '@/lib/team-colours';
import { CHART_COLORS, TICK_STYLE, useChartAnimation } from './chart-theme';

export function PaceBarChart({
  rows,
  model,
  testId,
}: {
  rows: PaceTeamRow[];
  /** Team identity (v0.5.0 step 3): real liveries when Teams_Colours exists. */
  model?: SaveModel;
  testId?: string;
}) {
  const t = useTranslations('charts.pace');
  const anim = useChartAnimation();

  if (rows.length === 0) {
    return <p className="text-xs text-ink-faint">{t('noData')}</p>;
  }

  const min = Math.min(...rows.map((r) => r.paceDeltaS));
  // Fastest team first — Recharts vertical layout draws the first row at
  // the bottom, so feed it reversed and let the fastest sit on top.
  const data = [...rows]
    .sort((a, b) => a.paceDeltaS - b.paceDeltaS)
    .map((r) => ({
      ...r,
      delta: Math.max(0, r.paceDeltaS - min),
    }))
    .reverse();

  return (
    <div style={{ width: '100%', height: rows.length * 26 + 24 }} data-testid={testId ?? 'pace-chart'}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, bottom: 0, left: 0 }}>
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
              const row = payload[0].payload as (typeof data)[number];
              return (
                <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-lg">
                  <p className="font-medium text-ink">{row.teamName}</p>
                  <p className="mt-1 font-mono text-[11px] text-ink-soft">
                    {t('deltaVsFastest', { delta: row.delta.toFixed(3) })}
                  </p>
                  <p className="font-mono text-[11px] text-ink-faint">
                    {t('median', { median: row.paceDeltaS.toFixed(3) })} ·{' '}
                    {t('samples', { count: row.samples })}
                  </p>
                </div>
              );
            }}
          />
          <Bar dataKey="delta" barSize={14} radius={[0, 3, 3, 0]} {...anim}>
            {data.map((row) => {
              // Real livery colour when the save carries Teams_Colours;
              // teal/amber highlights keep the player + rivalRef legible.
              const livery = model ? teamColour(model, row.teamId) : FALLBACK_TEAM_COLOUR;
              const fill =
                row.isPlayer
                  ? CHART_COLORS.player
                  : row.isRival
                    ? CHART_COLORS.rival
                    : livery === FALLBACK_TEAM_COLOUR
                      ? CHART_COLORS.bar
                      : livery;
              return (
                <Cell
                  key={row.teamId}
                  fill={fill}
                  stroke={row.isPlayer ? CHART_COLORS.playerStroke : row.isRival ? CHART_COLORS.rivalStroke : undefined}
                  strokeWidth={row.isPlayer || row.isRival ? 1 : 0}
                />
              );
            })}
            <LabelList
              dataKey="delta"
              position="right"
              formatter={(value: number) => (value === 0 ? t('baseline') : `+${value.toFixed(3)}s`)}
              style={{ fill: '#92a3b7', fontSize: 10, fontFamily: 'var(--font-jetbrains-mono), monospace' }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-1 text-[10px] text-ink-faint">{t('hint')}</p>
    </div>
  );
}
