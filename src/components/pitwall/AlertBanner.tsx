'use client';

/**
 * AlertBanner — red/amber alerts (docs/04 §6.5 AlertBanner). Phase 2 adds
 * car durability HIGH-risk parts + expiring contracts via the car and
 * personnel engines (missing-data states degrade silently — no noise).
 */

import { useTranslations } from 'next-intl';
import { TriangleAlert, Info, Cog, CalendarClock } from 'lucide-react';
import type { SaveModel } from '@/domain/types';
import { useCarLab, usePersonnel } from '@/lib/engine-hooks';

export function AlertBanner({ model }: { model: SaveModel }) {
  const t = useTranslations('wall.alerts');
  const noRaces = model.meta.warnings.includes('NO_COMPLETED_RACES');
  const missing = model.meta.tablesMissing;
  const carLab = useCarLab();
  const personnel = usePersonnel();

  const highRiskParts =
    carLab?.data.parts.filter((p) => p.risk === 'HIGH' && p.conditionAvg != null) ?? [];
  const expiringDrivers =
    personnel?.data.contracts.filter((c) => c.expiring && c.role === 'driver') ?? [];

  if (
    !noRaces &&
    missing.length === 0 &&
    highRiskParts.length === 0 &&
    expiringDrivers.length === 0
  ) {
    return null;
  }

  return (
    <div className="space-y-2" role="status">
      {highRiskParts.map((p) => (
        <div
          key={p.partType}
          className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2"
          data-testid="alert-part-risk"
        >
          <Cog className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
          <p className="text-xs text-danger">{t('partRisk', { part: p.partType })}</p>
        </div>
      ))}
      {expiringDrivers.map((c) => (
        <div
          key={c.staffId}
          className="flex items-start gap-2 rounded-lg border border-amber/40 bg-amber/10 px-3 py-2"
          data-testid="alert-contract"
        >
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-amber" aria-hidden="true" />
          <p className="text-xs text-amber">{t('contractExpiry', { name: c.name, days: c.daysLeft ?? 0 })}</p>
        </div>
      ))}
      {noRaces ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber/40 bg-amber/10 px-3 py-2">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber" aria-hidden="true" />
          <p className="text-xs text-amber">{t('noRaces')}</p>
        </div>
      ) : null}
      {missing.length > 0 ? (
        <div className="flex items-start gap-2 rounded-lg border border-line bg-surface px-3 py-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" aria-hidden="true" />
          <p className="text-xs text-ink-soft">{t('missingTables', { tables: missing.join(', ') })}</p>
        </div>
      ) : null}
    </div>
  );
}
