'use client';

/**
 * Command palette — Phase 3 (docs/04 §7.4 + docs/05 Phase 3 checklist).
 *
 * `Cmd/Ctrl+K` opens; groups follow the IA: module navigation (Mode A/B +
 * Narrative), race jumps (Race Weekend + Gazette per completed race), and
 * actions (locale switch). Number keys 1–9 jump to the matching module —
 * ignored while typing in any editable field (docs/06 §6.6 keyboard rule).
 */

import { useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  Car,
  CalendarDays,
  Flag,
  FlaskConical,
  Gauge,
  Globe,
  Newspaper,
  Briefcase,
  Users,
  Waves,
  type LucideIcon,
} from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { useUiStore } from '@/store/ui.store';
import { useSaveStore } from '@/store/save.store';
import { useWallNav, type WallView } from './WallNav';
import type { Race } from '@/domain/types';

interface PaletteModule {
  key: WallView;
  labelKey: string;
  icon: LucideIcon;
  mode: 'A' | 'B' | 'N';
  shortcut: string;
}

const MODULES: PaletteModule[] = [
  { key: 'wall', labelKey: 'nav.home', icon: Gauge, mode: 'A', shortcut: '1' },
  { key: 'tyres', labelKey: 'nav.tyres', icon: Waves, mode: 'A', shortcut: '2' },
  { key: 'race', labelKey: 'nav.race', icon: Flag, mode: 'A', shortcut: '3' },
  { key: 'cars', labelKey: 'nav.cars', icon: Car, mode: 'B', shortcut: '4' },
  { key: 'drivers', labelKey: 'nav.drivers', icon: Users, mode: 'B', shortcut: '5' },
  { key: 'season', labelKey: 'nav.season', icon: CalendarDays, mode: 'B', shortcut: '6' },
  { key: 'strategy', labelKey: 'nav.strategy', icon: Briefcase, mode: 'B', shortcut: '7' },
  { key: 'research', labelKey: 'nav.research', icon: FlaskConical, mode: 'B', shortcut: '8' },
  { key: 'gazette', labelKey: 'nav.gazette', icon: Newspaper, mode: 'N', shortcut: '9' },
];

/** Editable-target guard for the bare-number shortcuts. */
function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    el.isContentEditable
  );
}

export function CommandPalette({ races }: { races: Race[] }) {
  const t = useTranslations('wall');
  const tPalette = useTranslations('palette');
  const locale = useUiStore((s) => s.locale);
  const setLocale = useUiStore((s) => s.setLocale);
  const open = useUiStore((s) => s.paletteOpen);
  const setOpen = useUiStore((s) => s.setPaletteOpen);
  const toggle = useUiStore((s) => s.togglePalette);
  const { setView } = useWallNav();

  const seasonId = useSaveStore((s) => s.model?.meta.seasonId ?? 0);
  const seasonRaces = useMemo(
    () =>
      races
        .filter((r) => r.seasonId === seasonId)
        .sort((a, b) => b.day - a.day)
        .slice(0, 12), // newest first — the palette lists recent rounds
    [races, seasonId],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggle();
        return;
      }
      if (open || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= 9) {
        const mod = MODULES[n - 1];
        if (mod) {
          e.preventDefault();
          setView(mod.key);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, toggle, setView]);

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  const modeBadge = (m: PaletteModule['mode']): string =>
    m === 'A' ? t('modeA') : m === 'B' ? t('modeB') : t('modeN');

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title={tPalette('title')}
      description={tPalette('title')}
      className="border-line bg-panel sm:max-w-xl"
    >
      <CommandInput
        placeholder={tPalette('placeholder')}
        className="text-ink placeholder:text-ink-faint"
      />
      <CommandList className="pitwall-scroll max-h-80">
        <CommandEmpty>{tPalette('empty')}</CommandEmpty>

        <CommandGroup heading={tPalette('groupNav')}>
          {MODULES.map((m) => {
            const Icon = m.icon;
            return (
              <CommandItem
                key={m.key}
                value={`${m.key} ${t(m.labelKey)}`}
                onSelect={() => run(() => setView(m.key))}
                className="cursor-pointer gap-2.5 text-ink-soft data-[selected=true]:bg-raised data-[selected=true]:text-ink"
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span className="flex-1">{t(m.labelKey)}</span>
                <span className="hidden font-mono text-[10px] text-ink-faint sm:inline">
                  {modeBadge(m.mode)}
                </span>
                <span className="rounded border border-line px-1 font-mono text-[10px] text-ink-faint">
                  {m.shortcut}
                </span>
              </CommandItem>
            );
          })}
        </CommandGroup>

        {seasonRaces.length > 0 ? (
          <>
            <CommandSeparator />
            <CommandGroup heading={tPalette('groupRaces')}>
              {seasonRaces.map((r) => (
                <CommandItem
                  key={`race-${r.raceId}`}
                  value={`race weekend ${r.trackName} ${r.raceId}`}
                  onSelect={() => run(() => setView('race', r.raceId))}
                  className="cursor-pointer gap-2.5 text-ink-soft data-[selected=true]:bg-raised data-[selected=true]:text-ink"
                >
                  <Flag className="h-4 w-4" aria-hidden="true" />
                  <span className="flex-1 truncate">
                    {r.trackName}
                    <span className="ml-2 font-mono text-[10px] text-ink-faint">
                      {r.state === 2 ? tPalette('completed') : tPalette('upcoming')}
                    </span>
                  </span>
                </CommandItem>
              ))}
              {seasonRaces
                .filter((r) => r.state === 2)
                .slice(0, 6)
                .map((r) => (
                  <CommandItem
                    key={`gaz-${r.raceId}`}
                    value={`gazette narrative ${r.trackName} ${r.raceId}`}
                    onSelect={() => run(() => setView('gazette', r.raceId))}
                    className="cursor-pointer gap-2.5 text-ink-soft data-[selected=true]:bg-raised data-[selected=true]:text-ink"
                  >
                    <Newspaper className="h-4 w-4" aria-hidden="true" />
                    <span className="flex-1 truncate">
                      {tPalette('gazetteFor', { track: r.trackName })}
                    </span>
                  </CommandItem>
                ))}
            </CommandGroup>
          </>
        ) : null}

        <CommandSeparator />
        <CommandGroup heading={tPalette('groupActions')}>
          <CommandItem
            value="language locale switch ngôn ngữ"
            onSelect={() => run(() => setLocale(locale === 'vi' ? 'en' : 'vi'))}
            className="cursor-pointer gap-2.5 text-ink-soft data-[selected=true]:bg-raised data-[selected=true]:text-ink"
          >
            <Globe className="h-4 w-4" aria-hidden="true" />
            <span className="flex-1">
              {locale === 'vi' ? tPalette('switchToEn') : tPalette('switchToVi')}
            </span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
      <div className="border-t border-line px-3 py-2 text-[10px] text-ink-faint">
        <kbd className="rounded border border-line bg-raised px-1 font-mono">⌘K</kbd>{' '}
        {tPalette('hint')}
      </div>
    </CommandDialog>
  );
}

export const COMMAND_PALETTE_MODULES = MODULES;
