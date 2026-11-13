'use client';

/**
 * SaveDropzone — Phase 0 (docs/04-UX-UI-ROUTES.md §7.3.7).
 * Accepts .sav only, 500 MB limit (docs/05-ROADMAP-STANDARDS.md §9.5).
 * Parse orchestration lives in src/lib/parse-controller.ts (module scope —
 * survives the dropzone unmounting when status flips to 'parsing').
 * The file NEVER leaves the device.
 */

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Upload } from 'lucide-react';
import { startParseFlow } from '@/lib/parse-controller';
import { cn } from '@/lib/utils';

export function SaveDropzone() {
  const t = useTranslations('upload');
  const [dragOver, setDragOver] = useState(false);

  const onFile = useCallback((file: File | undefined | null) => {
    if (file) void startParseFlow(file);
  }, []);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        onFile(e.dataTransfer.files?.[0]);
      }}
      className={cn(
        'group relative mx-auto flex w-full max-w-xl cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors duration-200',
        'focus-within:outline focus-within:outline-2 focus-within:outline-ring',
        dragOver
          ? 'border-teal bg-teal/5'
          : 'border-line-strong bg-surface hover:border-teal/60 hover:bg-raised/40',
      )}
      role="button"
      tabIndex={0}
      aria-label={t('title')}
      onClick={() => document.getElementById('sav-input')?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          document.getElementById('sav-input')?.click();
        }
      }}
      data-testid="save-dropzone"
    >
      <input
        id="sav-input"
        type="file"
        accept=".sav"
        className="sr-only"
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.currentTarget.value = '';
        }}
      />
      <span
        className={cn(
          'flex h-12 w-12 items-center justify-center rounded-full border border-line bg-raised transition-colors duration-200',
          dragOver ? 'border-teal text-teal' : 'text-ink-soft group-hover:text-teal',
        )}
        aria-hidden="true"
      >
        <Upload className="h-5 w-5" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-medium text-ink">{t('title')}</p>
        <p className="text-xs text-ink-soft">{t('hint')}</p>
      </div>
      <p className="font-mono text-[11px] uppercase tracking-wide text-ink-faint">
        {t('accept')} · {t('sizeLimit')}
      </p>
    </div>
  );
}
