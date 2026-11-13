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
 *
 * v0.5.0 Step 1 — wall frame: fixed 240px sidebar on desktop (WallSidebar
 * owns nav + save indicator), 1440px main width, header carries the game
 * clock + next-race weather chip; the phase badge moved to the footer.
 */

import { useTranslations } from 'next-intl';
import { NextIntlClientProvider } from 'next-intl';
import { Suspense, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Command as CommandIcon, Flag, Thermometer, CloudSun } from 'lucide-react';
import { messages } from '@/lib/i18n/config';
import { useUiStore } from '@/store/ui.store';
import { useSaveStore } from '@/store/save.store';
import { cancelParseFlow } from '@/lib/parse-controller';
import { LocaleSwitch } from '@/components/pitwall/LocaleSwitch';
import { PrivacyNote } from '@/components/pitwall/PrivacyNote';
import { SaveDropzone } from '@/components/pitwall/SaveDropzone';
import { ParseProgress } from '@/components/pitwall/ParseProgress';
import { ErrorAlert } from '@/components/pitwall/ErrorAlert';
import { SaveLibrary } from '@/components/pitwall/SaveLibrary';
import { SaveAutoRestore } from '@/components/pitwall/SaveAutoRestore';
import { WallSidebar } from '@/components/pitwall/WallSidebar';
import { WallViews } from '@/components/pitwall/WallViews';
import { WallHomeView } from '@/components/pitwall/WallHomeView';
import { TyreLabView } from '@/components/pitwall/TyreLabView';
import { RaceWeekendView } from '@/components/pitwall/RaceWeekendView';
import { CommandPalette } from '@/components/pitwall/CommandPalette';
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
  const tWall = useTranslations('wall');
  const tPalette = useTranslations('palette');
  const status = useSaveStore((s) => s.status);
  const model = useSaveStore((s) => s.model);
  const progress = useSaveStore((s) => s.progress);
  const error = useSaveStore((s) => s.error);
  const togglePalette = useUiStore((s) => s.togglePalette);

  // Header game clock: Day · season · done/total + next-race weather chip.
  const seasonRaces = model
    ? model.races.filter((r) => r.seasonId === model.meta.seasonId)
    : [];
  const doneCount = seasonRaces.filter((r) => r.state === 2).length;
  const nextRace = seasonRaces.find((r) => r.state !== 2) ?? null;

  return (
    <div className="pitwall-grid-bg flex min-h-screen flex-col bg-void text-ink">
      <WallSidebar />

      <div className="flex min-h-screen flex-col lg:pl-60">
        <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80 print:hidden">
          <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-2.5 lg:hidden">
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

            {/* Game clock — always visible once a save is open (v0.5.0). */}
            {model ? (
              <div
                className="flex items-center gap-2 font-mono text-[11px] text-ink-soft"
                data-testid="header-clock"
              >
                <span
                  className="rounded border border-line bg-panel px-2 py-1"
                  title={tWall('header.gameDayTitle')}
                >
                  {tWall('header.gameDay', {
                    day: model.meta.day,
                    season: model.meta.seasonId,
                    done: doneCount,
                    total: seasonRaces.length,
                  })}
                </span>
                {nextRace?.weather ? (
                  <span
                    className="flex items-center gap-1 rounded border border-line bg-panel px-2 py-1"
                    title={tWall('header.weatherTitle')}
                    data-testid="header-weather"
                  >
                    <Thermometer className="h-3 w-3 text-amber" aria-hidden="true" />
                    {nextRace.weather.raceTempC ?? '—'}°C
                    <span aria-hidden="true">·</span>
                    {nextRace.weather.raceRain ? (
                      <>
                        <CloudSun className="h-3 w-3 text-info" aria-hidden="true" />
                        {tWall('header.wet')}
                      </>
                    ) : (
                      <>{tWall('header.dry')}</>
                    )}
                  </span>
                ) : null}
              </div>
            ) : null}

            <div className="ml-auto flex items-center gap-2">
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

        <main className="mx-auto w-full max-w-[1440px] flex-1 space-y-6 px-4 py-6 pb-28 sm:px-6 lg:pb-6 print:pb-0">
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
                  onRetry={() => useSaveStore.getState().reset()}
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
              <Suspense fallback={null}>
                <WallViews />
              </Suspense>

              <div className="print:hidden">
                <SaveLibrary />
              </div>
            </motion.div>
          ) : null}
        </main>

        <footer className="mt-auto border-t border-line bg-surface print:hidden">
          <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
            <p className="text-[11px] leading-relaxed text-ink-faint">{t('footer.note')}</p>
            <span className="ml-auto font-mono text-[10px] uppercase tracking-wide text-ink-faint">
              {t('app.phaseBadge')}
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
