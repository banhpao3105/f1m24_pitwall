'use client';

/**
 * Wall frame — v0.5.0 Step 1 (docs/04 §7.1 IA, unchanged).
 *
 * Desktop ≥lg: fixed 240px left sidebar grouped by mode (RACE WEEKEND /
 * FACTORY·SEASON / TẠP CHÍ) with active state + shortcut keys 1–9 (same
 * mapping as the command palette) + footer showing the open save.
 * Mobile <lg: bottom tab bar with the 5 primary views + "Thêm" sheet with
 * the remaining 4 — bottom bar never covers content (main gets pb).
 *
 * Presentation only: navigation state stays in the URL via useWallNav
 * (deep-link contract docs/02 §3.4).
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Gauge,
  Waves,
  Flag,
  Car,
  Users,
  CalendarDays,
  Briefcase,
  FlaskConical,
  Newspaper,
  MoreHorizontal,
  FileHeart,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WallView } from './WallNav';
import { useWallNav } from './WallNav';
import { useSaveStore } from '@/store/save.store';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

interface NavItemDef {
  key: WallView;
  icon: LucideIcon;
  shortcut: string;
}

interface NavGroupDef {
  mode: 'A' | 'B' | 'N';
  items: NavItemDef[];
}

/** Same order + shortcuts as CommandPalette (1–9). */
const GROUPS: NavGroupDef[] = [
  {
    mode: 'A',
    items: [
      { key: 'wall', icon: Gauge, shortcut: '1' },
      { key: 'tyres', icon: Waves, shortcut: '2' },
      { key: 'race', icon: Flag, shortcut: '3' },
    ],
  },
  {
    mode: 'B',
    items: [
      { key: 'cars', icon: Car, shortcut: '4' },
      { key: 'drivers', icon: Users, shortcut: '5' },
      { key: 'season', icon: CalendarDays, shortcut: '6' },
      { key: 'strategy', icon: Briefcase, shortcut: '7' },
      { key: 'research', icon: FlaskConical, shortcut: '8' },
    ],
  },
  { mode: 'N', items: [{ key: 'gazette', icon: Newspaper, shortcut: '9' }] },
];

const PRIMARY_MOBILE: WallView[] = ['wall', 'tyres', 'race', 'season', 'gazette'];
const SHEET_MOBILE: WallView[] = ['cars', 'drivers', 'strategy', 'research'];

const ICONS: Record<WallView, LucideIcon> = {
  wall: Gauge,
  tyres: Waves,
  race: Flag,
  cars: Car,
  drivers: Users,
  season: CalendarDays,
  strategy: Briefcase,
  research: FlaskConical,
  gazette: Newspaper,
};

/** `wall` view label lives at wall.nav.home — the rest match 1:1. */
const LABEL_KEY: Record<WallView, string> = {
  wall: 'home',
  tyres: 'tyres',
  race: 'race',
  cars: 'cars',
  drivers: 'drivers',
  season: 'season',
  strategy: 'strategy',
  research: 'research',
  gazette: 'gazette',
};

const MODE_ACCENT: Record<'A' | 'B' | 'N', string> = {
  A: 'text-teal',
  B: 'text-amber',
  N: 'text-gold',
};

export function WallSidebar() {
  const t = useTranslations('wall');
  const tNav = useTranslations('wall.nav');
  const tSidebar = useTranslations('wall.sidebar');
  const { view, raceId, setView } = useWallNav();
  const model = useSaveStore((s) => s.model);
  const reset = useSaveStore((s) => s.reset);
  const [moreOpen, setMoreOpen] = useState(false);

  // Deep-link contract (docs/02 §3.4): non-home views carry the active race
  // (explicit ?race= or the next unfinished race), exactly like the old pill nav.
  const seasonRacesForNav = model
    ? model.races.filter((r) => r.seasonId === model.meta.seasonId)
    : [];
  const activeRaceId =
    raceId ??
    seasonRacesForNav.find((r) => r.state !== 2)?.raceId ??
    seasonRacesForNav.at(-1)?.raceId ??
    null;

  const go = (v: WallView) => {
    setView(v, v === 'wall' ? undefined : activeRaceId ?? undefined);
  };

  const seasonRaces = model
    ? model.races.filter((r) => r.seasonId === model.meta.seasonId)
    : [];
  const done = seasonRaces.filter((r) => r.state === 2).length;

  const itemClasses = (active: boolean) =>
    cn(
      'group relative flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors duration-150',
      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring',
      active
        ? 'bg-raised text-ink'
        : 'text-ink-soft hover:bg-raised/60 hover:text-ink',
    );

  const sidebarButton = (item: NavItemDef) => {
    const active = view === item.key;
    const Icon = item.icon;
    return (
      <button
        key={item.key}
        type="button"
        onClick={() => go(item.key)}
        aria-current={active ? 'page' : undefined}
        className={itemClasses(active)}
        data-testid={`nav-${item.key}`}
      >
        {/* active vạch teal */}
        <span
          aria-hidden="true"
          className={cn(
            'absolute inset-y-1 left-0 w-0.5 rounded-full bg-teal transition-opacity duration-150',
            active ? 'opacity-100' : 'opacity-0',
          )}
        />
        <Icon className={cn('h-4 w-4 shrink-0', active ? MODE_ACCENT[groupOf(item.key)] : 'text-ink-faint')} aria-hidden="true" />
        <span className="truncate">{tNav(LABEL_KEY[item.key])}</span>
        <kbd
          className={cn(
            'ml-auto rounded border px-1.5 py-0.5 font-mono text-[10px] leading-none',
            active ? 'border-line-strong bg-surface text-ink-soft' : 'border-line bg-surface text-ink-faint',
          )}
        >
          {item.shortcut}
        </kbd>
      </button>
    );
  };

  const groupOf = (key: WallView): 'A' | 'B' | 'N' =>
    GROUPS.find((g) => g.items.some((i) => i.key === key))?.mode ?? 'A';

  const groupTitle = (mode: 'A' | 'B' | 'N') =>
    mode === 'A' ? t('modeA') : mode === 'B' ? t('modeB') : t('modeN');

  return (
    <>
      {/* ── Desktop sidebar ─────────────────────────────────────────── */}
      <aside
        className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface lg:flex print:hidden"
        aria-label={t('nav.label')}
        data-testid="wall-sidebar"
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-md border border-teal/40 bg-teal/10" aria-hidden="true">
            <Flag className="h-4 w-4 text-teal" />
          </span>
          <span className="font-mono text-sm font-bold tracking-[0.18em] text-ink">
            {tSidebar('brand')}
          </span>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto px-2.5 py-3 pitwall-scroll">
          {GROUPS.map((group) => (
            <div key={group.mode}>
              <p className="mb-1 px-3 font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                {groupTitle(group.mode)}
              </p>
              <div className="space-y-0.5">{group.items.map(sidebarButton)}</div>
            </div>
          ))}
        </nav>

        {/* Save indicator — always visible once a save is open (v0.5.0). */}
        <div className="border-t border-line px-4 py-3" data-testid="sidebar-save">
          {model ? (
            <>
              <p className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                {tSidebar('saveActive')}
              </p>
              <p className="mt-0.5 truncate font-mono text-xs text-ink" title={model.meta.fileName}>
                {model.meta.fileName}
              </p>
              <p className="mt-0.5 font-mono text-[11px] text-ink-faint">
                {t('header.gameDay', {
                  day: model.meta.day,
                  season: model.meta.seasonId,
                  done,
                  total: seasonRaces.length,
                })}
              </p>
              <button
                type="button"
                onClick={reset}
                data-testid="sidebar-change-save"
                className="mt-2 inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1.5 text-[11px] text-ink-soft transition-colors duration-150 hover:border-teal/40 hover:text-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
              >
                <FileHeart className="h-3.5 w-3.5" aria-hidden="true" />
                {tSidebar('changeSave')}
              </button>
            </>
          ) : (
            <p className="text-[11px] text-ink-faint">{tSidebar('noSave')}</p>
          )}
        </div>
      </aside>

      {/* ── Mobile bottom bar ───────────────────────────────────────── */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur lg:hidden print:hidden"
        aria-label={t('nav.label')}
        style={{ paddingBottom: 'max(0px, env(safe-area-inset-bottom))' }}
        data-testid="mobile-tabnav"
      >
        <div className="flex items-stretch justify-around">
          {PRIMARY_MOBILE.map((key) => {
            const Icon = ICONS[key];
            const active = view === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => go(key)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex min-h-[52px] flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring',
                  active ? 'text-teal' : 'text-ink-faint',
                )}
                data-testid={`mnav-${key}`}
              >
                {active ? (
                  <span aria-hidden="true" className="absolute top-0 h-0.5 w-8 rounded-full bg-teal" />
                ) : null}
                <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                <span className="max-w-full truncate">{tNav(LABEL_KEY[key])}</span>
              </button>
            );
          })}
          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label={tSidebar('more')}
                className="flex min-h-[52px] flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] text-ink-faint transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                data-testid="mnav-more"
              >
                <MoreHorizontal className="h-4.5 w-4.5" aria-hidden="true" />
                <span>{tSidebar('more')}</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="border-line bg-surface text-ink">
              <SheetHeader>
                <SheetTitle className="font-mono text-xs uppercase tracking-wider text-ink-faint">
                  {tSidebar('moreTitle')}
                </SheetTitle>
              </SheetHeader>
              <div className="grid grid-cols-2 gap-2 pb-4">
                {SHEET_MOBILE.map((key) => {
                  const Icon = ICONS[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setMoreOpen(false);
                        go(key);
                      }}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2.5 text-[13px] transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring',
                        view === key
                          ? 'border-teal/50 bg-teal/10 text-teal'
                          : 'border-line bg-panel text-ink-soft hover:text-ink',
                      )}
                      data-testid={`msheet-${key}`}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      {tNav(key)}
                    </button>
                  );
                })}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </>
  );
}
