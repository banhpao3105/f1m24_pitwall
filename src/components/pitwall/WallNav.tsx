'use client';

/**
 * Wall navigation — Mode badge + views via URL query params
 * (`/?view=wall|tyres|race&race=N`) — deep-linkable per docs/02 §3.4 while
 * staying on the sandbox's single visible route (documented deviation).
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Flag, Gauge, Waves } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Race } from '@/domain/types';
import { useSaveStore } from '@/store/save.store';

export type WallView = 'wall' | 'tyres' | 'race';

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

export function WallNav({ races }: { races: Race[] }) {
  const t = useTranslations('wall');
  const { view, raceId, setView } = useWallNav();
  const seasonId = useSaveStore((s) => s.model?.meta.seasonId ?? 0);
  const nextRace =
    races.find((r) => r.state !== 2 && r.seasonId === seasonId) ??
    races.filter((r) => r.seasonId === seasonId).at(-1);
  const activeRaceId = raceId ?? nextRace?.raceId ?? null;

  const items: { key: WallView; label: string; icon: React.ReactNode }[] = [
    { key: 'wall', label: t('nav.home'), icon: <Gauge className="h-3.5 w-3.5" /> },
    { key: 'tyres', label: t('nav.tyres'), icon: <Waves className="h-3.5 w-3.5" /> },
    { key: 'race', label: t('nav.race'), icon: <Flag className="h-3.5 w-3.5" /> },
  ];

  return (
    <nav aria-label={t('nav.label')} className="flex flex-wrap items-center gap-1.5">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => setView(item.key, item.key === 'wall' ? undefined : activeRaceId ?? undefined)}
          aria-current={view === item.key ? 'page' : undefined}
          className={cn(
            'inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors duration-150',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring',
            view === item.key
              ? 'border-teal/50 bg-teal/10 text-teal'
              : 'border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink',
          )}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </nav>
  );
}
