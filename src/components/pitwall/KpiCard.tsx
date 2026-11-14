'use client';

/**
 * KpiCard — v0.6.0 step 1: the shared KPI tile extracted from Home
 * (prompt §1: "KpiCard nếu chưa có"). Same visual contract as the previous
 * inline tiles: 32px tabular numerals, icon + label + sub + delta line.
 */

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

export function KpiCard({
  icon,
  label,
  value,
  sub,
  delta,
  testId,
  index = 0,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  delta?: ReactNode;
  testId?: string;
  /** Stagger index for the entry animation. */
  index?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.04 }}
      className="rounded-lg border border-line bg-panel p-4"
      data-testid={testId ?? 'kpi-card'}
    >
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-ink-faint">
        <span className="text-ink-faint" aria-hidden="true">{icon}</span>
        {label}
      </p>
      <p
        className="mt-1 truncate font-mono text-[32px] font-bold leading-none tabular-nums text-ink"
        title={typeof value === 'string' ? value : undefined}
      >
        {value}
      </p>
      {sub ? <p className="mt-1.5 truncate text-[13px] text-ink-soft">{sub}</p> : null}
      {delta ? <p className="mt-0.5 truncate font-mono text-[10px]">{delta}</p> : null}
    </motion.div>
  );
}
