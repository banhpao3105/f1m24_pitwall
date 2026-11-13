/**
 * Shared SaveModel test fixture — Phase 2.
 * `emptyPhase2Sections()` gives the v1 adaptive sections in their "no data"
 * state so engine tests start from a deterministic degradation baseline.
 */

import type { SaveModel } from '@/domain/types';

export function emptyPhase2Sections(): Pick<
  SaveModel,
  'parts' | 'finance' | 'personnel' | 'regulations'
> {
  return {
    parts: {
      designs: [],
      items: [],
      loadouts: [],
      expertise: [],
      tablesPresent: {
        designs: false,
        items: false,
        statValues: false,
        loadouts: false,
        expertise: false,
      },
    },
    finance: {
      transactions: [],
      tablesPresent: { balance: false, transactions: false },
    },
    personnel: {
      contracts: [],
      performance: [],
      patience: [],
      tablesPresent: { contracts: false, performance: false, patience: false },
    },
    regulations: [],
  };
}
