'use client';

/**
 * Wall navigation hook — Mode-grouped views via URL query params
 * (`/?view=wall|tyres|race|cars|drivers|season|strategy|research|gazette&race=N`)
 * — deep-linkable per docs/02 §3.4 while staying on the sandbox's single
 * visible route (documented deviation).
 *
 * v0.5.0 Step 1: the pill nav component was replaced by the fixed sidebar +
 * mobile tab bar in `WallSidebar.tsx` (same IA per docs/04 §7.1). This file
 * keeps the URL contract — the single source of navigation truth.
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

export type WallView =
  | 'wall'
  | 'tyres'
  | 'race'
  | 'cars'
  | 'drivers'
  | 'season'
  | 'strategy'
  | 'research'
  | 'gazette';

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
