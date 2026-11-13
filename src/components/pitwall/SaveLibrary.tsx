'use client';

/**
 * Save Library (minimal) — Phase 0 (docs/05-ROADMAP-STANDARDS.md Phase 0:
 * "Upload + Library tối giản"). Lists parsed models from IndexedDB with
 * open/delete. Comparison and export arrive in later phases (backlog).
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { FolderOpen, Trash2, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  listSaves,
  deleteSave,
  setLastActiveSaveId,
  getLastActiveSaveId,
  type StoredSave,
} from '@/lib/save-db';
import { useSaveStore } from '@/store/save.store';

export function SaveLibrary() {
  const t = useTranslations('library');
  const setReady = useSaveStore((s) => s.setReady);
  const [saves, setSaves] = useState<StoredSave[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    listSaves()
      .then(setSaves)
      .catch(() => setSaves([]));
    getLastActiveSaveId()
      .then(setActiveId)
      .catch(() => setActiveId(null));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onDelete = useCallback(
    async (id: string) => {
      // confirm() is intentionally plain: destructive action, keyboard-safe.
      if (window.confirm(t('confirmDelete'))) {
        await deleteSave(id);
        // A deleted save can no longer be the auto-restore target.
        if ((await getLastActiveSaveId()) === id) {
          await setLastActiveSaveId(null);
        }
        refresh();
      }
    },
    [t, refresh],
  );

  const onOpen = useCallback(
    (stored: StoredSave) => {
      setReady(stored.model);
      // Phase 3: opening a save makes it the auto-restore target.
      setLastActiveSaveId(stored.model.meta.id).then(() => {
        setActiveId(stored.model.meta.id);
      }).catch(() => {});
    },
    [setReady],
  );

  return (
    <section
      aria-label={t('title')}
      className="mx-auto w-full max-w-3xl rounded-lg border border-line bg-panel"
      data-testid="save-library"
    >
      <header className="border-b border-line bg-surface px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink">
          <Database className="h-4 w-4 text-teal" aria-hidden="true" />
          {t('title')}
        </h2>
        <p className="mt-0.5 text-xs text-ink-faint">{t('subtitle')}</p>
      </header>

      <div className="max-h-96 overflow-y-auto pitwall-scroll">
        {saves === null ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-12 w-full bg-raised" />
            <Skeleton className="h-12 w-full bg-raised" />
          </div>
        ) : saves.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-ink-faint">{t('empty')}</p>
        ) : (
          <ul className="divide-y divide-line">
            {saves.map((s) => (
              <li
                key={s.model.meta.id}
                className={cn(
                  'flex flex-wrap items-center gap-2 px-4 py-3 hover:bg-raised/40',
                  s.model.meta.id === activeId && 'bg-teal/5',
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm text-ink">
                    <span className="font-medium">{s.model.player.teamName}</span>
                    <Badge
                      variant="outline"
                      className="border-line-strong font-mono text-[10px] text-ink-soft"
                    >
                      {s.model.meta.gameVersion}
                    </Badge>
                    {s.model.meta.id === activeId ? (
                      <Badge
                        variant="outline"
                        className="border-teal/40 bg-teal/5 font-mono text-[10px] text-teal"
                      >
                        {t('active')}
                      </Badge>
                    ) : null}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-ink-faint">
                    {t('savedOn')}: {new Intl.DateTimeFormat(undefined, {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    }).format(new Date(s.savedAt))}
                    {' · '}
                    S{s.model.meta.seasonId} · D{s.model.meta.day}
                    {' · '}
                    {s.model.meta.fileName}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onOpen(s)}
                    className="cursor-pointer gap-1.5 border-line-strong hover:bg-raised"
                  >
                    <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('open')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onDelete(s.model.meta.id)}
                    className="cursor-pointer gap-1.5 text-ink-soft hover:text-danger"
                    aria-label={`${t('delete')} ${s.model.player.teamName}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('delete')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
