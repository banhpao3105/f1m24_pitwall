'use client';

/**
 * Error alert with actionable per-code messages — Phase 0
 * (docs/02-ARCHITECTURE.md §3.5: every failure state has explicit UI).
 */

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorAlertProps {
  code: string;
  message: string;
  details?: string;
  onRetry: () => void;
}

export function ErrorAlert({ code, message, details, onRetry }: ErrorAlertProps) {
  const t = useTranslations('errors');

  let display: string;
  switch (code) {
    case 'NOT_A_GVAS_SAVE':
      display = t('NOT_A_GVAS_SAVE');
      break;
    case 'UNSUPPORTED_SAVE_FORMAT':
      display = t('UNSUPPORTED_SAVE_FORMAT');
      break;
    case 'MALFORMED_GVAS':
      display = t('MALFORMED_GVAS');
      break;
    case 'NOT_A_SQLITE_DB':
      display = t('NOT_A_SQLITE_DB');
      break;
    case 'DB_INFLATE_FAILED':
      display = t('DB_INFLATE_FAILED');
      break;
    case 'MISSING_CORE_TABLES':
      display = t('MISSING_CORE_TABLES', { tables: parseMissingTables(details) });
      break;
    case 'DB_OPEN_FAILED':
      display = t('DB_OPEN_FAILED');
      break;
    case 'NORMALIZE_FAILED':
      display = t('NORMALIZE_FAILED');
      break;
    case 'FILE_TOO_LARGE':
      display = t('FILE_TOO_LARGE');
      break;
    case 'BAD_EXTENSION':
      display = t('BAD_EXTENSION');
      break;
    case 'WORKER_ERROR':
      display = t('WORKER_ERROR');
      break;
    case 'FILE_READ_ERROR':
      display = t('FILE_READ_ERROR');
      break;
    default:
      display = t('PARSE_FAILED', { message });
  }

  return (
    <section
      role="alert"
      aria-label={t('title')}
      className="mx-auto w-full max-w-xl rounded-lg border border-danger/40 bg-panel p-6"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-2">
          <h2 className="text-sm font-semibold text-danger">{t('title')}</h2>
          <p className="text-sm leading-relaxed text-ink">{display}</p>
          <p className="font-mono text-xs text-ink-faint">code: {code}</p>
          {details ? (
            <details className="text-xs text-ink-faint">
              <summary className="cursor-pointer select-none hover:text-ink-soft">
                details
              </summary>
              <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-raised p-2 font-mono text-[11px]">
                {details}
              </pre>
            </details>
          ) : null}
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <Button
          size="sm"
          variant="outline"
          onClick={onRetry}
          className="cursor-pointer gap-1.5 border-line-strong hover:bg-raised"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          {t('retry')}
        </Button>
      </div>
    </section>
  );
}

function parseMissingTables(details?: string): string {
  if (!details) return '?';
  try {
    const parsed = JSON.parse(details) as { missing?: string[] };
    return parsed.missing?.join(', ') ?? '?';
  } catch {
    return details.slice(0, 120);
  }
}
