'use client';

/**
 * StrategyBars — v0.6.0 step 5 (prompt §5 Strategy): the strategy view's
 * text lists as bars.
 *   ExpertiseBarsChart — the player team's expertise points per part group
 *   (Parts_Expertise rows the car engine already reads; no engine change).
 *   RoleCountBars — headcount by role (drivers vs staff) from the personnel
 *   board's contract cards.
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
import type { TeamExpertiseRow } from '@/domain/types';
import type { ContractCard } from '@/engines/personnel.engine';
import { CHART_COLORS, TICK_STYLE, useChartAnimation } from './chart-theme';

export function ExpertiseBarsChart({
  expertise,
  playerTeamId,
}: {
  expertise: TeamExpertiseRow[];
  playerTeamId: number;
}) {
  const t = useTranslations('charts.car');
  const anim = useChartAnimation();

  const data = expertise
    .filter((e) => e.teamId === playerTeamId && e.partType)
    .map((e) => ({ partType: e.partType as string, points: e.expertise ?? 0 }))
    .filter((e) => e.points > 0)
    .sort((a, b) => b.points - a.points);

  if (data.length === 0) {
    return <p className="text-xs text-ink-faint">{t('noData')}</p>;
  }

  return (
    <div data-testid="expertise-bars">
      <ResponsiveContainer width="100%" height={data.length * 26 + 24}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 64, bottom: 0, left: 0 }}>
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
                  <p className="mt-1 font-mono text-[11px] text-ink-soft">{row.points} pts</p>
                </div>
              );
            }}
          />
          <Bar dataKey="points" barSize={14} radius={[0, 3, 3, 0]} fill={CHART_COLORS.info} {...anim}>
            <LabelList
              dataKey="points"
              position="right"
              formatter={(value: number) => value.toLocaleString('vi-VN')}
              style={{ fill: '#92a3b7', fontSize: 10, fontFamily: 'var(--font-jetbrains-mono), monospace' }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-1 text-[10px] text-ink-faint">{t('expertiseHint')}</p>
    </div>
  );
}

export function RoleCountBars({ contracts }: { contracts: ContractCard[] }) {
  const t = useTranslations('strategy');
  const anim = useChartAnimation();

  const drivers = contracts.filter((c) => c.role === 'driver').length;
  const staff = contracts.filter((c) => c.role === 'staff').length;
  const expiring = contracts.filter((c) => c.expiring).length;
  const data = [
    { role: t('roleDriver'), count: drivers, tone: CHART_COLORS.amber },
    { role: t('roleStaff'), count: staff, tone: CHART_COLORS.bar },
    { role: t('expiring'), count: expiring, tone: CHART_COLORS.danger },
  ].filter((d) => d.count > 0);

  if (data.length === 0) {
    return <p className="text-xs text-ink-faint">—</p>;
  }

  return (
    <div data-testid="role-count-bars">
      <ResponsiveContainer width="100%" height={data.length * 26 + 24}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 48, bottom: 0, left: 0 }}>
          <XAxis type="number" hide domain={[0, 'dataMax']} allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="role"
            width={90}
            axisLine={false}
            tickLine={false}
            tick={TICK_STYLE}
          />
          <Bar dataKey="count" barSize={14} radius={[0, 3, 3, 0]} {...anim}>
            {data.map((row) => (
              <Cell key={row.role} fill={row.tone} fillOpacity={0.85} />
            ))}
            <LabelList
              dataKey="count"
              position="right"
              style={{ fill: '#92a3b7', fontSize: 10, fontFamily: 'var(--font-jetbrains-mono), monospace' }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
