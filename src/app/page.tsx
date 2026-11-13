'use client';

/**
 * F1 Pit Wall — Phase 0 (Foundation) single-surface page.
 *
 * Planning deviation (documented in src/lib/i18n/config.ts): the sandbox
 * preview exposes only `/`, so Phase 0 ships the Upload + Library flow on
 * this route. `/wall/*` routes follow in Phase 1 per docs/04-UX-UI-ROUTES.md.
 */

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { NextIntlClientProvider } from 'next-intl';
import { motion } from 'framer-motion';
import { Flag, Gauge } from 'lucide-react';
import { messages } from '@/lib/i18n/config';
import { useUiStore } from '@/store/ui.store';
import { useSaveStore } from '@/store/save.store';
import { cancelParseFlow } from '@/lib/parse-controller';
import { LocaleSwitch } from '@/components/pitwall/LocaleSwitch';
import { PrivacyNote } from '@/components/pitwall/PrivacyNote';
import { SaveDropzone } from '@/components/pitwall/SaveDropzone';
import { ParseProgress } from '@/components/pitwall/ParseProgress';
import { ErrorAlert } from '@/components/pitwall/ErrorAlert';
import { SaveMetaCard } from '@/components/pitwall/SaveMetaCard';
import { SaveLibrary } from '@/components/pitwall/SaveLibrary';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function Phase0Page() {
  const locale = useUiStore((s) => s.locale);
  const [, startTransition] = useTransition();
  // Locale comes from the persisted store; re-render on switch is instant.
  void startTransition;
  const activeLocale = locale ?? 'vi';

  return (
    <NextIntlClientProvider
      locale={activeLocale}
      messages={messages[activeLocale]}
      now={new Date()}
      timeZone="Asia/Shanghai"
    >
      <Phase0Surface />
    </NextIntlClientProvider>
  );
}

function Phase0Surface() {
  const t = useTranslations();
  const status = useSaveStore((s) => s.status);
  const model = useSaveStore((s) => s.model);
  const progress = useSaveStore((s) => s.progress);
  const error = useSaveStore((s) => s.error);
  const reset = useSaveStore((s) => s.reset);

  return (
    <div className="pitwall-grid-bg flex min-h-screen flex-col bg-void text-ink">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md border border-teal/40 bg-teal/10" aria-hidden="true">
              <Flag className="h-4 w-4 text-teal" />
            </span>
            <div className="leading-tight">
              <h1 className="font-mono text-sm font-bold tracking-[0.18em] text-ink">
                {t('app.title')}
              </h1>
              <p className="text-[11px] text-ink-faint">{t('app.tagline')}</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge
              variant="outline"
              className="hidden border-teal/40 bg-teal/5 font-mono text-[10px] tracking-wide text-teal sm:inline-flex"
            >
              {t('app.phaseBadge')}
            </Badge>
            <LocaleSwitch />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-8">
        {status === 'idle' || status === 'error' ? (
          <>
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              {status === 'error' && error ? (
                <ErrorAlert
                  code={error.code}
                  message={error.message}
                  details={error.details ?? error.message}
                  onRetry={reset}
                />
              ) : null}
              <SaveDropzone />
              <PrivacyNote />
            </motion.div>
          </>
        ) : null}

        {status === 'parsing' ? (
          <ParseProgress
            percent={progress?.percent ?? 0}
            stage={progress?.stage ?? 'gvas'}
            onCancel={cancelParseFlow}
          />
        ) : null}

        {status === 'ready' && model ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
            data-testid="save-meta"
          >
            <SaveMetaCard model={model} />
            <div className="mx-auto flex w-full max-w-3xl items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3">
              <Gauge className="h-4 w-4 shrink-0 text-info" aria-hidden="true" />
              <p className="flex-1 text-xs text-ink-soft">{t('meta.nextPhase')}</p>
              <Button
                size="sm"
                variant="ghost"
                onClick={reset}
                className="cursor-pointer text-ink-soft hover:text-ink"
              >
                {t('upload.title')}
              </Button>
            </div>
            <SaveLibrary />
          </motion.div>
        ) : null}
      </main>

      <footer className="mt-auto border-t border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <p className="text-[11px] leading-relaxed text-ink-faint">{t('footer.note')}</p>
          <span className="ml-auto font-mono text-[10px] uppercase tracking-wide text-ink-faint">
            {t('footer.phase')}
          </span>
        </div>
      </footer>
    </div>
  );
}
