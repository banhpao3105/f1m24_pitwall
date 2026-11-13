'use client';

/**
 * WallViews — resolves view + race from URL query params (deep-link
 * contract docs/02 §3.4) and renders the matching view. Single component
 * so page.tsx stays clean; useSearchParams needs the Suspense boundary
 * provided by page.tsx.
 */

import { useSaveStore } from '@/store/save.store';
import { useWallNav } from './WallNav';
import { WallHomeView } from './WallHomeView';
import { TyreLabView } from './TyreLabView';
import { RaceWeekendView } from './RaceWeekendView';

export function WallViews() {
  const model = useSaveStore((s) => s.model);
  const { view, raceId } = useWallNav();
  if (!model) return null;

  switch (view) {
    case 'tyres':
      return <TyreLabView model={model} raceId={raceId} />;
    case 'race':
      return <RaceWeekendView model={model} raceId={raceId} />;
    case 'wall':
    default:
      return <WallHomeView model={model} />;
  }
}
