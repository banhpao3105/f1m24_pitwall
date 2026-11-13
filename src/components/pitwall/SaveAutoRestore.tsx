'use client';

/**
 * Save auto-restore — Phase 3 (docs/05 Phase 3: "persist save vào IndexedDB,
 * mở lại không cần nạp lại"). On first mount, if the store is idle and a
 * last-active save pointer exists in IndexedDB, restore that model into the
 * store. Restore is skipped when a parse is already running (race guard) and
 * failures degrade to the normal onboarding flow.
 */

import { useEffect } from 'react';
import { useSaveStore } from '@/store/save.store';
import { getLastActiveSaveId, getSave, setLastActiveSaveId } from '@/lib/save-db';
import { toast } from '@/hooks/use-toast';
import { useTranslations } from 'next-intl';

/**
 * 0.4.1: the restore toast must appear at most ONCE per page load, even if
 * this component remounts (StrictMode double-mount, Fast Refresh, locale
 * provider re-render) — repeated toasts on every view switch were reported
 * as noise. Restore itself stays idempotent.
 */
let restoreToastShown = false;

export function SaveAutoRestore() {
  const t = useTranslations('library');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const id = await getLastActiveSaveId();
        if (!id || cancelled) return;
        const stored = await getSave(id);
        if (!stored || cancelled) return;
        // Race guard: the user may have started a parse while we were reading.
        if (useSaveStore.getState().status !== 'idle') return;
        useSaveStore.getState().setReady(stored.model);
        if (!restoreToastShown) {
          restoreToastShown = true;
          toast({
            title: t('restoredTitle'),
            description: t('restoredDesc', { name: stored.model.meta.fileName }),
            duration: 2500,
          });
        }
      } catch {
        // Degraded (private mode / quota) → normal onboarding flow. Best
        // effort only: clear the dangling pointer so we don't retry forever.
        try {
          await setLastActiveSaveId(null);
        } catch {
          // ignore — nothing else we can do offline
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
