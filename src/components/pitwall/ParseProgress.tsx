'use client';

/**
 * Parse progress — Phase 0 (docs/02-ARCHITECTURE.md §3.5 "Đang parse").
 * Shows stage label + percent + Cancel (cancellable interaction rule §6.6).
 */

import { useTranslations } from 'next-intl';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Loader2, X } from 'lucide-react';

interface ParseProgressProps {
  percent: number;
  stage: string;
  onCancel: () => void;
}

const STAGE_KEYS: Record<string, string> = {
  gvas: 'gvas',
  inflate: 'inflate',
  sqlite: 'sqlite',
  normalize: 'normalize',
  done: 'done',
};

export function ParseProgress({ percent, stage, onCancel }: ParseProgressProps) {
  const t = useTranslations('progress');
  const stageKey = STAGE_KEYS[stage] ?? 'gvas';

  return (
    <section
      aria-label={t('title')}
      aria-live="polite"
      className="mx-auto w-full max-w-xl rounded-lg border border-line bg-panel p-6"
    >
      <div className="mb-4 flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-teal" aria-hidden="true" />
        <div>
          <h2 className="text-sm font-semibold text-ink">{t('title')}</h2>
          <p className="text-xs text-ink-soft">{t(`stages.${stageKey}`)}</p>
        </div>
        <span className="ml-auto font-mono text-sm text-teal" aria-hidden="true">
          {percent}%
        </span>
      </div>
      <Progress value={percent} className="h-1.5" aria-hidden="true" />
      <div className="mt-4 flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          className="cursor-pointer gap-1.5 text-ink-soft hover:text-ink"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          {t('cancel')}
        </Button>
      </div>
    </section>
  );
}
