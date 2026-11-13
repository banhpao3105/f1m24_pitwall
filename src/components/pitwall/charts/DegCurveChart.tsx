'use client';

/**
 * DegCurveChart — v0.5.0 Step 2 (prompt §2 Bước 2, Tyre Lab).
 * Pace-loss curves for S/M/H over stint laps, mirroring the engine's own
 * closed form (tyre.engine): per-lap loss at stint lap k is
 *   deltas[c] + DEG_FINAL[c] * (k / lives[c]) ^ DEG_EXP
 * with `deltas`/`lives` coming straight from the TyreLab result and
 * DEG_FINAL/DEG_EXP imported from the engine module — constants only,
 * the engine itself is untouched.
 * Overlays: optimal pit lap (teal) + first-compound life cap (red zone).
 */

import { useTranslations } from 'next-intl';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { DEG_EXP, DEG_FINAL } from '@/engines/tyre.engine';
import type { Compound } from '@/engines/tyre.engine';
import { CHART_COLORS, TICK_STYLE, useChartAnimation } from './chart-theme';

const COMPOUND_COLOR: Record<Compound, string> = {
  S: CHART_COLORS.soft,
  M: CHART_COLORS.medium,
  H: CHART_COLORS.hard,
};

export interface DegCurveData {
  /** Race laps planned for the weekend. */
  laps: number;
  /** Per-compound pace delta vs fresh soft (engine `deltas`). */
  deltas: Record<Compound, number>;
  /** Per-compound life ceilings in laps (engine `lives`). */
  lives: Record<Compound, number>;
  /** Optimal first pit lap from the hero plan. */
  pitLap?: number;
  /** First stint compound of the hero plan — its cap drives the red zone. */
  firstCompound?: string;
}

export function DegCurveChart({ data }: { data: DegCurveData }) {
  const t = useTranslations('charts.deg');
  const anim = useChartAnimation();

  const maxX = Math.max(data.laps, 1);
  const series: Record<Compound, (number | null)[]> = {
    S: [], M: [], H: [],
  };
  const rows: { lap: number; S: number | null; M: number | null; H: number | null }[] = [];
  for (let lap = 1; lap <= maxX; lap++) {
    for (const c of ['S', 'M', 'H'] as Compound[]) {
      // Fresh-set curve: the engine's closed form differentiated per lap.
      // Beyond the compound's life ceiling the tyre is unusable → null
      // (line stops, never invents performance past the cap).
      series[c].push(
        lap <= data.lives[c]
          ? Number((data.deltas[c] + DEG_FINAL[c] * Math.pow(lap / data.lives[c], DEG_EXP)).toFixed(3))
          : null,
      );
    }
    rows.push({ lap, S: series.S[lap - 1], M: series.M[lap - 1], H: series.H[lap - 1] });
  }

  // Narrow the incoming first-compound string to a real dry Compound.
  const capCompound = (['S', 'M', 'H'] as Compound[]).find((c) => c === data.firstCompound);
  const cap = capCompound ? data.lives[capCompound] : null;
  const maxDelta = Math.max(
    ...['S', 'M', 'H'].map((c) => {
      const vals = series[c as Compound].filter((v): v is number => v != null);
      return vals.length > 0 ? vals[vals.length - 1] : 0;
    }),
    1,
  );

  return (
    <div style={{ width: '100%', height: 260 }} data-testid="deg-curve-chart">
      <ResponsiveContainer>
        <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="lap"
            type="number"
            domain={[1, maxX]}
            ticks={[1, 25, 50].filter((n) => n < maxX).concat(maxX)}
            tick={TICK_STYLE}
            tickLine={false}
            axisLine={{ stroke: CHART_COLORS.grid }}
            label={{ value: t('lapAxis'), position: 'insideBottomRight', offset: -2, style: TICK_STYLE }}
          />
          <YAxis
            tick={TICK_STYLE}
            tickLine={false}
            axisLine={false}
            domain={[0, Math.ceil(maxDelta + 0.5)]}
            tickFormatter={(v: number) => `+${v}s`}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-lg">
                  <p className="font-mono text-[11px] text-ink-soft">
                    {t('lapAxis')} {String(label)}
                  </p>
                  {payload
                    .filter((p) => p.value != null)
                    .map((p) => (
                      <p key={p.dataKey as string} className="font-mono text-[11px]" style={{ color: p.color }}>
                        {p.dataKey}: +{Number(p.value).toFixed(2)}s
                      </p>
                    ))}
                </div>
              );
            }}
          />
          <Legend
            formatter={(value: string) => <span style={{ color: '#92a3b7', fontSize: 11 }}>{value}</span>}
          />
          {/* NOTE: no Fragment here — Recharts only discovers reference
              elements that are direct children of the chart. */}
          {cap != null && capCompound ? (
            <ReferenceArea
              x1={cap}
              x2={maxX}
              fill={CHART_COLORS.danger}
              fillOpacity={0.07}
              stroke="none"
            />
          ) : null}
          {cap != null && capCompound ? (
            <ReferenceLine
              x={cap}
              stroke={CHART_COLORS.danger}
              strokeDasharray="4 4"
              label={{
                value: t('capLine', { compound: capCompound, lap: cap }),
                position: 'insideTopRight',
                fill: CHART_COLORS.danger,
                fontSize: 10,
                fontFamily: 'var(--font-jetbrains-mono), monospace',
              }}
            />
          ) : null}
          {data.pitLap != null ? (
            <ReferenceLine
              x={data.pitLap}
              stroke={CHART_COLORS.player}
              strokeDasharray="4 4"
              label={{
                value: t('pitLine', { lap: data.pitLap }),
                position: 'insideTopLeft',
                fill: CHART_COLORS.player,
                fontSize: 10,
                fontFamily: 'var(--font-jetbrains-mono), monospace',
              }}
            />
          ) : null}
          <Line
            type="monotone"
            dataKey="S"
            stroke={COMPOUND_COLOR.S}
            strokeWidth={2}
            dot={false}
            connectNulls={false}
            {...anim}
          />
          <Line
            type="monotone"
            dataKey="M"
            stroke={COMPOUND_COLOR.M}
            strokeWidth={2}
            dot={false}
            connectNulls={false}
            {...anim}
          />
          <Line
            type="monotone"
            dataKey="H"
            stroke={COMPOUND_COLOR.H}
            strokeWidth={2}
            dot={false}
            connectNulls={false}
            {...anim}
          />
        </LineChart>
      </ResponsiveContainer>
      <p className="mt-1 text-[10px] text-ink-faint">{t('hint')}</p>
    </div>
  );
}
