'use client';

/**
 * RacePaceLinesChart — v0.6.0 step 3 (prompt §3): per-race pace-gap lines
 * for the player vs the two nearest rivals (nearest by median gap, pace
 * board rivals only). The metric switches between the two pace boards:
 *   peak = fastest-lap board, race = average raced lap board.
 * Gap values come verbatim from the boards via buildSeasonSeries.
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

const RIVAL_STROKES = [CHART_COLORS.rival, CHART_COLORS.info] as const;

export function RacePaceLinesChart({
  series,
  metric,
  testId,
}: {
  series: SeasonSeries;
  metric: 'peak' | 'race';
  testId?: string;
}) {
  const t = useTranslations('charts.series');
  const anim = useChartAnimation();

  const rows = series.paceGapPerTeam[metric];
  const playerRow = rows.find((r) => r.isPlayer) ?? null;
  if (!playerRow || series.races.length === 0) {
    return <p className="text-xs text-ink-faint">{t('noData')}</p>;
  }

  // The two nearest rivals by median gap (pace-board rivals only).
  const rivals = rows
    .filter((r) => r.isRival && !r.isPlayer)
    .sort(
      (a, b) =>
        Math.abs(a.medianS - playerRow.medianS) - Math.abs(b.medianS - playerRow.medianS),
    )
    .slice(0, 2);

  const lines = [
    { row: playerRow, stroke: CHART_COLORS.player, width: 2.5 },
    ...rivals.map((row, i) => ({ row, stroke: RIVAL_STROKES[i % RIVAL_STROKES.length], width: 1.75 })),
  ];

  const data = series.races.map((race, i) => {
    const point: Record<string, string | number | null> = { race: race.trackName };
    for (const { row } of lines) point[`t${row.teamId}`] = row.values[i] ?? null;
    return point;
  });

  return (
    <div data-testid={testId ?? 'race-pace-lines-chart'}>
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
              const row = payload[0].payload as Record<string, string | number | null>;
              return (
                <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-lg">
                  <p className="font-medium text-ink">{label as string}</p>
                  <ul className="mt-1 space-y-0.5">
                    {lines.map(({ row: lrow, stroke }) => {
                      const v = row[`t${lrow.teamId}`];
                      return (
                        <li key={lrow.teamId} className="flex items-center gap-1.5 font-mono text-[11px]">
                          <span aria-hidden="true" className="h-2 w-2 rounded-sm" style={{ backgroundColor: stroke }} />
                          <span className={lrow.isPlayer ? 'font-semibold text-teal' : 'text-ink-soft'}>{lrow.teamName}</span>
                          <span className="ml-auto tabular-nums text-ink">
                            {v != null ? `+${Number(v).toFixed(3)}s` : '—'}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
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
          {lines.map(({ row, stroke, width }) => (
            <Line
              key={row.teamId}
              type="monotone"
              dataKey={`t${row.teamId}`}
              name={row.teamName}
              stroke={stroke}
              strokeWidth={width}
              dot={{ r: 2.5 }}
              activeDot={{ r: 4 }}
              connectNulls
              {...anim}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1" aria-hidden="true">
        {lines.map(({ row, stroke }) => (
          <li key={row.teamId} className="flex items-center gap-1.5 text-[10px]">
            <span className="h-0.5 w-4" style={{ backgroundColor: stroke }} />
            <span className={row.isPlayer ? 'font-semibold text-teal' : 'text-ink-faint'}>
              {row.isPlayer ? `${t('you')} — ${row.teamName}` : row.teamName}
            </span>
            <span className="font-mono text-ink-faint">median {row.medianS.toFixed(3)}s</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
