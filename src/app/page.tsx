'use client';

/**
 * F1 Pit Wall — Phase 2 single-surface page.
 *
 * Planning deviations (documented in src/lib/i18n/config.ts):
 *   - The sandbox preview exposes only `/`, so Phase 1/2 views live on this
 *     route with query-param deep-links (`/?view=cars&race=12`) instead of
 *     the `/wall/*` route map in docs/04 §7.2. The view switch is a
 *     component swap — the route map applies unchanged once routing exists.
 *   - next-intl without locale prefixes; locale persisted in Zustand.
 */

import { useTranslations } from 'next-intl';
import { NextIntlClientProvider } from 'next-intl';
import { Suspense, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Command as CommandIcon, Flag } from 'lucide-react';
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
import { SaveAutoRestore } from '@/components/pitwall/SaveAutoRestore';
import { WallNav } from '@/components/pitwall/WallNav';
import { WallViews } from '@/components/pitwall/WallViews';
import { WallHomeView } from '@/components/pitwall/WallHomeView';
import { TyreLabView } from '@/components/pitwall/TyreLabView';
import { RaceWeekendView } from '@/components/pitwall/RaceWeekendView';
import { CommandPalette } from '@/components/pitwall/CommandPalette';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function PitWallPage() {
  const locale = useUiStore((s) => s.locale);
  const activeLocale = locale ?? 'vi';

  // Dev-only debug hook: lets browser automation / devtools inject a
  // synthetic SaveModel to exercise views without a real .sav. Compiled
  // out of production behaviour (no-op branch on the client bundle).
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      (window as unknown as { __pitwall?: { useSaveStore: typeof useSaveStore } }).__pitwall = {
        useSaveStore,
      };
    }
  }, []);

  return (
    <NextIntlClientProvider
      locale={activeLocale}
      messages={messages[activeLocale]}
      now={new Date()}
      timeZone="Asia/Shanghai"
    >
      <PitWallSurface />
    </NextIntlClientProvider>
  );
}

function PitWallSurface() {
  const t = useTranslations();
  const tPalette = useTranslations('palette');
  const status = useSaveStore((s) => s.status);
  const model = useSaveStore((s) => s.model);
  const progress = useSaveStore((s) => s.progress);
  const error = useSaveStore((s) => s.error);
  const reset = useSaveStore((s) => s.reset);
  const togglePalette = useUiStore((s) => s.togglePalette);

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
            <Button
              size="sm"
              variant="outline"
              onClick={togglePalette}
              aria-label={tPalette('title')}
              aria-keyshortcuts="Meta+K Control+K"
              data-testid="open-palette"
              className="cursor-pointer gap-1.5 border-line bg-surface text-ink-soft hover:text-ink"
            >
              <CommandIcon className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">K</span>
            </Button>
            <LocaleSwitch />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-6">
        {/* Auto-restore the last opened save from IndexedDB (Phase 3). */}
        <SaveAutoRestore />

        {/* Command palette — mounted once; races are passed when a save is ready. */}
        <Suspense fallback={null}>
          <CommandPalette races={model?.races ?? []} />
        </Suspense>

        {status === 'idle' || status === 'error' ? (
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
            className="space-y-5"
            data-testid="wall-shell"
          >
            <div className="flex flex-wrap items-center gap-3">
              <WallNav races={model.races} />
              <Button
                size="sm"
                variant="ghost"
                onClick={reset}
                className="ml-auto cursor-pointer text-ink-soft hover:text-ink"
              >
                {t('upload.title')}
              </Button>
            </div>

            <Suspense fallback={null}>
              <WallViews />
            </Suspense>

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
