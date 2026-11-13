'use client';

/**
 * Engine hooks — memoized engine invocation over the current SaveModel.
 * Keys: (saveHash, raceId, options) — recompute only on real changes
 * (docs/02 §3.3: engine memo, không tính lại khi chỉ đổi tab UI).
 */

import { useMemo } from 'react';
import { buildTyreLab, type TyreLab } from '@/engines/tyre.engine';
import { buildPaceBoard, type PaceBoard } from '@/engines/pace.engine';
import type { EngineResult } from '@/domain/types';
import { useSaveStore } from '@/store/save.store';

export function useTyreLab(raceId: number | null): EngineResult<TyreLab> | null {
  const model = useSaveStore((s) => s.model);
  return useMemo(() => {
    if (!model || raceId == null) return null;
    return buildTyreLab(model, raceId);
  }, [model, raceId]);
}

export function usePaceBoard(): EngineResult<PaceBoard> | null {
  const model = useSaveStore((s) => s.model);
  return useMemo(() => {
    if (!model) return null;
    return buildPaceBoard(model);
  }, [model]);
}
