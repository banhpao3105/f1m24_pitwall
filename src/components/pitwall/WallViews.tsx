'use client';

/**
 * WallViews — resolves view + race from URL query params (deep-link
 * contract docs/02 §3.4) and renders the matching view. Single component
 * so page.tsx stays clean; useSearchParams needs the Suspense boundary
 * provided by page.tsx.
 */

import { useSaveStore } from '@/store/save.store';
import { useWallNav } from './WallNav';
import { ViewShell } from './ViewShell';
import { WallHomeView } from './WallHomeView';
import { TyreLabView } from './TyreLabView';
import { RaceWeekendView } from './RaceWeekendView';
import { CarLabView } from './CarLabView';
import { DriversView } from './DriversView';
import { SeasonView } from './SeasonView';
import { StrategyView } from './StrategyView';
import { ResearchView } from './ResearchView';
import { GazetteView } from './GazetteView';

export function WallViews() {
  const model = useSaveStore((s) => s.model);
  const { view, raceId } = useWallNav();
  if (!model) return null;

  // v0.5.0 step 4: brief skeleton on view switches (reduced-motion aware).
  const shellKey = `${view}:${raceId ?? ''}`;

  return (
    <ViewShell viewKey={shellKey}>
      {(() => {
        switch (view) {
          case 'tyres':
            return <TyreLabView model={model} raceId={raceId} />;
          case 'race':
            return <RaceWeekendView model={model} raceId={raceId} />;
          case 'cars':
            return <CarLabView model={model} />;
          case 'drivers':
            return <DriversView model={model} />;
          case 'season':
            return <SeasonView model={model} />;
          case 'strategy':
            return <StrategyView />;
          case 'research':
            return <ResearchView />;
          case 'gazette':
            return <GazetteView model={model} raceId={raceId} />;
          case 'wall':
          default:
            return <WallHomeView model={model} />;
        }
      })()}
    </ViewShell>
  );
}
