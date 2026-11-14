'use client';

/**
 * PointsAreaChart — v0.6.0 step 2 (prompt §2a): cumulative constructors
 * points per race, top 5 teams + the player's team (always included,
 * highlighted teal). All numbers come verbatim from buildSeasonSeries —
 * no recomputation. X axis: window races, oldest first.
 */

import { useTranslations } from 'next-intl';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { SeasonSeries } from '@/engines/dashboard.engine';
import type { SaveModel } from '@/domain/types';
import { teamColour, FALLBACK_TEAM_COLOUR } from '@/lib/team-colours';
import { CHART_COLORS, TICK_STYLE, useChartAnimation } from './chart-theme';

export function PointsAreaChart({
  series,
  model,
  testId,
}: {
  series: SeasonSeries;
  model?: SaveModel;
  testId?: string;
}) {
  const t = useTranslations('charts.series');
  const anim = useChartAnimation();

  const top = series.pointsCumulative.slice(0, 5);
  const playerRow = series.pointsCumulative.find((r) => r.isPlayer);
  const included = playerRow && !top.some((r) => r.isPlayer) ? [...top, playerRow] : top;
  if (included.length === 0 || series.races.length === 0) {
    return <p className="text-xs text-ink-faint">{t('noData')}</p>;
  }

  const data = series.races.map((race, i) => {
    const point: Record<string, string | number> = { race: race.trackName };
    for (const row of included) point[`t${row.teamId}`] = row.values[i] ?? 0;
    return point;
  });

  const colourOf = (teamId: number, isPlayer: boolean): string => {
    if (isPlayer) return CHART_COLORS.player;
    const livery = model ? teamColour(model, teamId) : FALLBACK_TEAM_COLOUR;
    return livery === FALLBACK_TEAM_COLOUR ? CHART_COLORS.bar : livery;
  };

  return (
    <div data-testid={testId ?? 'points-area-chart'}>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="race" tick={TICK_STYLE} tickLine={false} axisLine={{ stroke: CHART_COLORS.grid }} interval={0} />
          <YAxis tick={TICK_STYLE} tickLine={false} axisLine={false} width={48} />
          <Tooltip
            cursor={{ stroke: CHART_COLORS.axis, strokeDasharray: '4 4' }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const entries = [...payload]
                .map((p) => p.payload as Record<string, string | number>)
                .slice(0, 1)
                .flatMap((row) =>
                  included
                    .map((row2) => ({ row: row2, value: Number(row[`t${row2.teamId}`] ?? 0) }))
                    .sort((a, b) => b.value - a.value),
                );
              return (
                <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-lg">
                  <p className="font-medium text-ink">{label as string}</p>
                  <ul className="mt-1 space-y-0.5">
                    {entries.map(({ row, value }) => (
                      <li key={row.teamId} className="flex items-center gap-1.5 font-mono text-[11px]">
                        <span
                          aria-hidden="true"
                          className="h-2 w-2 shrink-0 rounded-sm"
                          style={{ backgroundColor: colourOf(row.teamId, row.isPlayer) }}
                        />
                        <span className={row.isPlayer ? 'font-semibold text-teal' : 'text-ink-soft'}>
                          {row.teamName}
                        </span>
                        <span className="ml-auto tabular-nums text-ink">{value} pts</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            }}
          />
          {included.map((row) => (
            <Area
              key={row.teamId}
              type="monotone"
              dataKey={`t${row.teamId}`}
              stroke={colourOf(row.teamId, row.isPlayer)}
              strokeWidth={row.isPlayer ? 2.5 : 1.5}
              strokeOpacity={row.isPlayer ? 1 : 0.6}
              fill={colourOf(row.teamId, row.isPlayer)}
              fillOpacity={row.isPlayer ? 0.16 : 0.05}
              dot={false}
              activeDot={{ r: 3 }}
              name={row.teamName}
              {...anim}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1" aria-hidden="true">
        {included.map((row) => (
          <li key={row.teamId} className="flex items-center gap-1.5 text-[10px]">
            <span
              className="h-2 w-2 rounded-sm"
              style={{ backgroundColor: colourOf(row.teamId, row.isPlayer) }}
            />
            <span className={row.isPlayer ? 'font-semibold text-teal' : 'text-ink-faint'}>
              {row.teamName}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
