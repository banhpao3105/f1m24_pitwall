'use client';

/**
 * AlertBanner — red/amber alerts (docs/04 §6.5 AlertBanner). Phase 1 v1
 * sources: no-completed-races warning + missing optional tables. Part wear
 * and contract expiry join in Phase 2 (car + personnel engines).
 */

import { useTranslations } from 'next-intl';
import { TriangleAlert, Info } from 'lucide-react';
import type { SaveModel } from '@/domain/types';

export function AlertBanner({ model }: { model: SaveModel }) {
  const t = useTranslations('wall.alerts');
  const noRaces = model.meta.warnings.includes('NO_COMPLETED_RACES');
  const missing = model.meta.tablesMissing;

  if (!noRaces && missing.length === 0) return null;

  return (
    <div className="space-y-2" role="status">
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
