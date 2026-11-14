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
import type { CarLeagueRow, DevQueueRow, PartConditionRow } from '@/engines/car.engine';
import type { PartItem, SaveModel } from '@/domain/types';
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

/* ── v0.6.0 step 4 additions (dashboard-first) ──────────────────────────── */

/** Per-team average condition for one part group, computed UI-side from
 * Parts_Items (same normalized rows car.engine reads — no engine change). */
function teamConditionAverages(items: PartItem[], partType: string): number[] {
  const byTeam = new Map<number, { sum: number; n: number }>();
  for (const it of items) {
    if (it.partType !== partType || it.teamId == null || it.condition == null) continue;
    const e = byTeam.get(it.teamId) ?? { sum: 0, n: 0 };
    e.sum += it.condition;
    e.n += 1;
    byTeam.set(it.teamId, e);
  }
  return [...byTeam.values()]
    .filter((e) => e.n > 0)
    .map((e) => e.sum / e.n);
}

function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * PartPerformanceChart — v0.6.0 step 4 (prompt §4 Car Lab): per part group,
 * the player's average condition vs the league median (median of every
 * team's average condition for the same group, from Parts_Items.TeamID).
 * Same condition numbers the durability cards show — nothing invented.
 */
export function PartPerformanceChart({
  rows,
  items,
}: {
  rows: PartConditionRow[];
  items: PartItem[];
}) {
  const t = useTranslations('charts.car');
  const anim = useChartAnimation();

  const data = rows
    .filter((r) => r.conditionAvg != null)
    .map((r) => {
      const league = medianOf(teamConditionAverages(items, r.partType));
      return {
        partType: r.partType,
        player: Math.round((r.conditionAvg as number) * 100),
        median: league != null ? Math.round(league * 100) : null,
      };
    });

  if (data.length === 0) {
    return <p className="text-xs text-ink-faint">{t('noCondition')}</p>;
  }

  return (
    <div data-testid="part-performance-chart">
      <ResponsiveContainer width="100%" height={data.length * 40 + 24}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 48, bottom: 0, left: 0 }}>
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
                    {t('playerBar')}: {row.player != null ? `${row.player}%` : '—'}
                  </p>
                  <p className="font-mono text-[11px] text-ink-soft">
                    {t('medianBar')}: {row.median != null ? `${row.median}%` : '—'}
                  </p>
                </div>
              );
            }}
          />
          <Bar dataKey="player" barSize={10} radius={[0, 3, 3, 0]} fill={CHART_COLORS.player} {...anim}>
            <LabelList
              dataKey="player"
              position="right"
              formatter={(value: number) => (value != null ? `${value}%` : '—')}
              style={{ fill: CHART_COLORS.playerStroke, fontSize: 10, fontFamily: 'var(--font-jetbrains-mono), monospace' }}
            />
          </Bar>
          <Bar dataKey="median" barSize={10} radius={[0, 3, 3, 0]} fill={CHART_COLORS.bar} {...anim}>
            <LabelList
              dataKey="median"
              position="right"
              formatter={(value: number) => (value != null ? `${value}%` : '—')}
              style={{ fill: '#92a3b7', fontSize: 10, fontFamily: 'var(--font-jetbrains-mono), monospace' }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-ink-faint" aria-hidden="true">
        <li className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: CHART_COLORS.player }} />
          {t('playerBar')}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: CHART_COLORS.bar }} />
          {t('medianBar')}
        </li>
      </ul>
      <p className="mt-1 text-[10px] text-ink-faint">{t('partPerfHint')}</p>
    </div>
  );
}

/**
 * DevPointsChart — v0.6.0 step 4 (prompt §4 Car Lab): development progress —
 * the design points already stored per dev-queue row (Parts_Designs.Points),
 * grouped by part type. Same numbers the dev-queue list shows.
 */
export function DevPointsChart({ rows }: { rows: DevQueueRow[] }) {
  const t = useTranslations('charts.car');
  const anim = useChartAnimation();

  const byType = new Map<string, number>();
  for (const q of rows) {
    const key = q.partType ?? q.name ?? `#${q.designId}`;
    byType.set(key, (byType.get(key) ?? 0) + q.points);
  }
  const data = [...byType.entries()]
    .map(([partType, points]) => ({ partType, points }))
    .sort((a, b) => b.points - a.points);

  if (data.length === 0) {
    return <p className="text-xs text-ink-faint">{t('noCondition')}</p>;
  }

  return (
    <div data-testid="dev-points-chart">
      <ResponsiveContainer width="100%" height={data.length * 26 + 24}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, bottom: 0, left: 0 }}>
          <XAxis type="number" hide domain={[0, 'dataMax']} />
          <YAxis
            type="category"
            dataKey="partType"
            width={110}
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
                  <p className="font-medium text-ink">{row.partType}</p>
                  <p className="mt-1 font-mono text-[11px] text-ink-soft">+{row.points} pts</p>
                </div>
              );
            }}
          />
          <Bar dataKey="points" barSize={14} radius={[0, 3, 3, 0]} fill={CHART_COLORS.amber} {...anim}>
            <LabelList
              dataKey="points"
              position="right"
              formatter={(value: number) => `+${value}`}
              style={{ fill: '#92a3b7', fontSize: 10, fontFamily: 'var(--font-jetbrains-mono), monospace' }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-1 text-[10px] text-ink-faint">{t('devHint')}</p>
    </div>
  );
}
