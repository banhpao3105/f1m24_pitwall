'use client';

/**
 * Save Library — v0.9.8: a full-page tab (/?view=saves) replacing the
 * minimal bottom-of-wall list (no more max-w-3xl/max-h-96 — the tab scrolls
 * with the page like every other view). Lists parsed models from IndexedDB;
 * records written from v0.9.8 also carry the ORIGINAL .sav bytes
 * (StoredSave.raw, local-only) and can be downloaded back to the same
 * user; legacy records are model-only and say so. Bulk: multi-select
 * delete (sequential deleteSave, one confirm — confirm() is intentionally
 * plain: destructive action, keyboard-safe; the v0.9.6 pattern kept).
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download, FolderOpen, Trash2, Database } from 'lucide-react';
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
import { useWallNav } from './WallNav';

/** 8,831,556 B → "8.4 MB" (1 decimal, MiB). */
function fmtSize(bytes?: number): string {
  if (bytes == null) return '—';
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export function SaveLibrary() {
  const t = useTranslations('library');
  const setReady = useSaveStore((s) => s.setReady);
  const { setView } = useWallNav();
  const [saves, setSaves] = useState<StoredSave[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

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
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        refresh();
      }
    },
    [t, refresh],
  );

  const onDeleteMany = useCallback(async () => {
    if (selected.size === 0) return;
    // confirm() is intentionally plain (same law as the single delete).
    if (window.confirm(t('confirmDeleteMany', { count: selected.size }))) {
      for (const id of selected) {
        await deleteSave(id);
      }
      // The open save leaving the library also leaves the auto-restore
      // target — cleared ONCE, exactly like the single-delete path.
      const active = await getLastActiveSaveId();
      if (active != null && selected.has(active)) {
        await setLastActiveSaveId(null);
      }
      setSelected(new Set());
      refresh();
    }
  }, [selected, t, refresh]);

  const onOpen = useCallback(
    (stored: StoredSave) => {
      setReady(stored.model);
      // Opening a save makes it the auto-restore target…
      setLastActiveSaveId(stored.model.meta.id).catch(() => {});
      setActiveId(stored.model.meta.id);
      // …and lands the user straight back on the wall, ready to use it.
      setView('wall');
    },
    [setReady, setView],
  );

  /** Hand the ORIGINAL bytes back to the same user — objectURL → click →
   *  revoke immediately; the bytes never leave the device. */
  const onDownload = useCallback((s: StoredSave) => {
    if (!s.raw) return;
    const url = URL.createObjectURL(s.raw);
    const a = document.createElement('a');
    a.href = url;
    a.download = s.model.meta.fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, []);

  const toggleRow = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = (): void => {
    setSelected((prev) => {
      if (saves != null && prev.size === saves.length) return new Set();
      return new Set((saves ?? []).map((s) => s.model.meta.id));
    });
  };

  const allSelected = saves != null && selected.size === saves.length && saves.length > 0;
  const totalBytes = (saves ?? []).reduce((sum, s) => sum + (s.model.meta.fileSizeBytes ?? 0), 0);

  return (
    <section
      aria-label={t('title')}
      className="w-full rounded-lg border border-line bg-panel"
      data-testid="save-library"
    >
      <header className="border-b border-line bg-surface px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink">
          <Database className="h-4 w-4 text-teal" aria-hidden="true" />
          {t('title')}
        </h2>
        <p className="mt-0.5 text-xs text-ink-faint">{t('subtitle')}</p>
        {saves != null && saves.length > 0 ? (
          <p className="mt-1 font-mono text-[11px] text-ink-soft" data-testid="library-stats">
            {t('totalSize', { count: saves.length, size: fmtSize(totalBytes) })}
          </p>
        ) : null}
      </header>

      {saves != null && saves.length > 0 ? (
        <div
          className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-2"
          data-testid="bulk-bar"
        >
          <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-soft">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = selected.size > 0 && !allSelected;
              }}
              onChange={toggleAll}
              aria-label={t('selectAll')}
              data-testid="select-all"
              className="h-4 w-4 cursor-pointer accent-teal"
            />
            {t('selectAll')}
          </label>
          {selected.size > 0 ? (
            <>
              <span className="font-mono text-xs text-amber" data-testid="selected-count">
                {t('selectedCount', { count: selected.size })}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void onDeleteMany()}
                className="ml-auto cursor-pointer gap-1.5 text-danger hover:text-danger"
                data-testid="delete-selected"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                {t('deleteSelected', { count: selected.size })}
              </Button>
            </>
          ) : null}
        </div>
      ) : null}

      <div>
        {saves === null ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-12 w-full bg-raised" />
            <Skeleton className="h-12 w-full bg-raised" />
          </div>
        ) : saves.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-ink-faint">{t('empty')}</p>
        ) : (
          <ul className="divide-y divide-line">
            {saves.map((s) => {
              const id = s.model.meta.id;
              return (
                <li
                  key={id}
                  className={cn(
                    'flex flex-wrap items-center gap-2 px-4 py-3 hover:bg-raised/40',
                    id === activeId && 'bg-teal/5',
                  )}
                  data-testid="library-row"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(id)}
                    onChange={() => toggleRow(id)}
                    aria-label={t('selectRow', { fileName: s.model.meta.fileName })}
                    data-testid={`select-row-${id}`}
                    className="h-4 w-4 cursor-pointer accent-teal"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm text-ink">
                      <span className="font-medium">{s.model.player.teamName}</span>
                      <Badge
                        variant="outline"
                        className="border-line-strong font-mono text-[10px] text-ink-soft"
                      >
                        {s.model.meta.gameVersion}
                      </Badge>
                      {id === activeId ? (
                        <Badge
                          variant="outline"
                          className="border-teal/40 bg-teal/5 font-mono text-[10px] text-teal"
                        >
                          {t('active')}
                        </Badge>
                      ) : null}
                      {s.raw ? (
                        <Badge
                          variant="outline"
                          className="border-info/40 bg-info/5 font-mono text-[10px] text-info"
                          data-testid={`raw-badge-${id}`}
                        >
                          {t('hasRaw')}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-line font-mono text-[10px] text-ink-faint"
                          data-testid={`raw-badge-${id}`}
                        >
                          {t('modelOnly')}
                        </Badge>
                      )}
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
                      {' · '}
                      <span data-testid={`size-${id}`}>{fmtSize(s.model.meta.fileSizeBytes)}</span>
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
                    {s.raw ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onDownload(s)}
                        className="cursor-pointer gap-1.5 border-line-strong hover:bg-raised"
                        data-testid={`download-${id}`}
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                        {t('download')}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled
                        title={t('downloadNoRaw')}
                        className="cursor-not-allowed gap-1.5 border-line text-ink-faint"
                        data-testid={`download-${id}`}
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                        {t('download')}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onDelete(id)}
                      className="cursor-pointer gap-1.5 text-ink-soft hover:text-danger"
                      aria-label={`${t('delete')} ${s.model.player.teamName}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      {t('delete')}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
