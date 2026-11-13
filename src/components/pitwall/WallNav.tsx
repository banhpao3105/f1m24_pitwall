'use client';

/**
 * Wall navigation — Mode badges + views via URL query params
 * (`/?view=wall|tyres|race|cars|drivers|season|strategy|research&race=N`)
 * — deep-linkable per docs/02 §3.4 while staying on the sandbox's single
 * visible route (documented deviation). IA per docs/04 §7.1: Mode A
 * Race Weekend vs Mode B Factory/Season are visually grouped.
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  Flag,
  Gauge,
  Waves,
  Car,
  Users,
  CalendarDays,
  Briefcase,
  FlaskConical,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Race } from '@/domain/types';
import { useSaveStore } from '@/store/save.store';

export type WallView =
  | 'wall'
  | 'tyres'
  | 'race'
  | 'cars'
  | 'drivers'
  | 'season'
  | 'strategy'
  | 'research';

export function useWallNav() {
  const router = useRouter();
  const params = useSearchParams();
  const view = (params.get('view') as WallView) || 'wall';
  const raceParam = params.get('race');
  const setView = useCallback(
    (v: WallView, raceId?: number) => {
      const next = new URLSearchParams();
      if (v !== 'wall') next.set('view', v);
      if (raceId != null) next.set('race', String(raceId));
      const qs = next.toString();
      router.replace(qs ? `/?${qs}` : '/', { scroll: false });
    },
    [router],
  );
  return { view, raceId: raceParam ? Number(raceParam) : null, setView };
}

interface NavItem {
  key: WallView;
  label: string;
  icon: React.ReactNode;
  mode: 'A' | 'B';
}

export function WallNav({ races }: { races: Race[] }) {
  const t = useTranslations('wall');
  const { view, raceId, setView } = useWallNav();
  const seasonId = useSaveStore((s) => s.model?.meta.seasonId ?? 0);
  const nextRace =
    races.find((r) => r.state !== 2 && r.seasonId === seasonId) ??
    races.filter((r) => r.seasonId === seasonId).at(-1);
  const activeRaceId = raceId ?? nextRace?.raceId ?? null;

  const items: NavItem[] = [
    { key: 'wall', label: t('nav.home'), icon: <Gauge className="h-3.5 w-3.5" />, mode: 'A' },
    { key: 'tyres', label: t('nav.tyres'), icon: <Waves className="h-3.5 w-3.5" />, mode: 'A' },
    { key: 'race', label: t('nav.race'), icon: <Flag className="h-3.5 w-3.5" />, mode: 'A' },
    { key: 'cars', label: t('nav.cars'), icon: <Car className="h-3.5 w-3.5" />, mode: 'B' },
    { key: 'drivers', label: t('nav.drivers'), icon: <Users className="h-3.5 w-3.5" />, mode: 'B' },
    { key: 'season', label: t('nav.season'), icon: <CalendarDays className="h-3.5 w-3.5" />, mode: 'B' },
    { key: 'strategy', label: t('nav.strategy'), icon: <Briefcase className="h-3.5 w-3.5" />, mode: 'B' },
    { key: 'research', label: t('nav.research'), icon: <FlaskConical className="h-3.5 w-3.5" />, mode: 'B' },
  ];

  const button = (item: NavItem) => (
    <button
      key={item.key}
      type="button"
      onClick={() => setView(item.key, item.key === 'wall' ? undefined : activeRaceId ?? undefined)}
      aria-current={view === item.key ? 'page' : undefined}
      title={item.mode === 'A' ? t('modeA') : t('modeB')}
      className={cn(
        'inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors duration-150',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring',
        view === item.key
          ? item.mode === 'A'
            ? 'border-teal/50 bg-teal/10 text-teal'
            : 'border-amber/50 bg-amber/10 text-amber'
          : 'border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink',
      )}
    >
      {item.icon}
      {item.label}
    </button>
  );

  return (
    <nav aria-label={t('nav.label')} className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 hidden rounded border border-teal/40 bg-teal/5 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-teal sm:inline-block">
        {t('modeA')}
      </span>
      {items.filter((i) => i.mode === 'A').map(button)}
      <span className="mx-1 hidden h-4 w-px bg-line sm:block" aria-hidden="true" />
      <span className="mr-1 hidden rounded border border-amber/40 bg-amber/5 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-amber sm:inline-block">
        {t('modeB')}
      </span>
      {items.filter((i) => i.mode === 'B').map(button)}
    </nav>
  );
}
