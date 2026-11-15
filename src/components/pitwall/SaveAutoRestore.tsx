'use client';

/**
 * Save auto-restore — Phase 3 (docs/05 Phase 3: "persist save vào IndexedDB,
 * mở lại không cần nạp lại"). On first mount, if the store is idle and a
 * last-active save pointer exists in IndexedDB, restore that model into the
 * store. Restore is skipped when a parse is already running (race guard) and
 * failures degrade to the normal onboarding flow.
 *
 * v0.8.1 — F5 re-read: when a FileSystemFileHandle was stored for THIS save
 * (Chromium picker path), the file on disk is inspected FIRST via
 * queryPermission (never requestPermission at boot — that needs a user
 * gesture and lives in the sidebar one-click button):
 *   - granted + file changed      → re-parse from disk (cache overwritten)
 *   - granted + file unchanged    → cache restored untouched (no re-parse)
 *   - prompt / denied / no API    → cache restored + sidebar gets a state
 *   - file gone (NotFoundError)   → cache restored + handle dropped + toast
 * Every path still degrades to the plain cache restore.
 */

import { useEffect } from 'react';
import { useSaveStore } from '@/store/save.store';
import {
  getLastActiveSaveId,
  getSave,
  setLastActiveSaveId,
  getLastActiveHandle,
  setLastActiveHandle,
  type StoredSave,
} from '@/lib/save-db';
import { inspectHandleOnBoot } from '@/lib/save-reload';
import { useSaveReloadStore } from '@/store/save-reload.store';
import { startParseFlow } from '@/lib/parse-controller';
import { toast } from '@/hooks/use-toast';
import { useTranslations } from 'next-intl';

/**
 * 0.4.1: the restore toast must appear at most ONCE per page load, even if
 * this component remounts (StrictMode double-mount, Fast Refresh, locale
 * provider re-render) — repeated toasts on every view switch were reported
 * as noise. Restore itself stays idempotent.
 */
let restoreToastShown = false;

/** Test-only reset — the flag is module state and outlives a single test. */
export function __resetRestoreToastForTests(): void {
  restoreToastShown = false;
}

export function SaveAutoRestore() {
  const t = useTranslations('library');

  useEffect(() => {
    let cancelled = false;

    const restoreCachedModel = (stored: StoredSave, silent = false): void => {
      useSaveStore.getState().setReady(stored.model);
      if (!restoreToastShown && !silent) {
        restoreToastShown = true;
        toast({
          title: t('restoredTitle'),
          description: t('restoredDesc', { name: stored.model.meta.fileName }),
          duration: 2500,
        });
      }
    };

    (async () => {
      try {
        const id = await getLastActiveSaveId();
        if (!id || cancelled) return;
        const stored = await getSave(id);
        if (!stored || cancelled) return;

        // v0.8.1: a stored handle only counts when it belongs to THIS save —
        // a later drag-drop of another save leaves the old handle behind and
        // it must never feed its file into this session.
        const record = await getLastActiveHandle();
        const handleForSave = record && record.saveId === id ? record : null;
        const outcome = handleForSave
          ? await inspectHandleOnBoot(handleForSave, stored)
          : null;
        if (cancelled) return;

        // Race guard: the user may have started a parse while we were reading.
        if (useSaveStore.getState().status !== 'idle') return;

        const reload = useSaveReloadStore.getState();

        if (handleForSave && outcome) {
          switch (outcome.kind) {
            case 'needs-permission':
              reload.set(
                'needs-permission',
                id,
                handleForSave.fileName,
              );
              restoreCachedModel(stored);
              return;
            case 'unsupported':
              reload.set('unsupported', id, handleForSave.fileName);
              restoreCachedModel(stored);
              return;
            case 'missing':
              // Stop retrying forever — drop the dangling handle. The missing
              // toast REPLACES the standard restored toast on this path.
              await setLastActiveHandle(null);
              reload.set('none', null, null);
              if (!restoreToastShown) {
                restoreToastShown = true;
                toast({
                  title: t('reloadMissingTitle'),
                  description: t('reloadMissingDesc'),
                  duration: 4000,
                });
              }
              restoreCachedModel(stored, true);
              return;
            case 'unchanged':
              reload.set('auto', id, handleForSave.fileName);
              restoreCachedModel(stored);
              return;
            case 'changed': {
              // Fresh disk content — full parse flow (progress UI, cache
              // overwrite, last-active update, handle re-saved inside).
              await startParseFlow(outcome.file, handleForSave.handle);
              if (cancelled) return;
              const { status, model } = useSaveStore.getState();
              if (status === 'ready' && model) {
                reload.set('auto', model.meta.id, model.meta.fileName);
                if (!restoreToastShown) {
                  restoreToastShown = true;
                  toast({
                    title: t('reloadedTitle'),
                    description: t('reloadedDesc', {
                      day: model.meta.day,
                      name: model.meta.fileName,
                    }),
                    duration: 2500,
                  });
                }
              }
              return;
            }
          }
        }

        restoreCachedModel(stored);
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
