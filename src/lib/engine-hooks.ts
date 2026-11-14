'use client';

/**
 * Engine hooks — memoized engine invocation over the current SaveModel.
 * Keys: (saveHash, raceId, options) — recompute only on real changes
 * (docs/02 §3.3: engine memo, không tính lại khi chỉ đổi tab UI).
 */

import { useMemo } from 'react';
import { buildTyreLab, type TyreLab, type TyreLabOptions } from '@/engines/tyre.engine';
import { buildPaceBoard, type PaceBoard } from '@/engines/pace.engine';
import { buildSim, type SimBoard, type SimOptions } from '@/engines/sim.engine';
import { buildCarLab, type CarLab } from '@/engines/car.engine';
import { buildFinance, type FinanceBoard } from '@/engines/finance.engine';
import {
  buildPersonnel,
  buildDriverDuel,
  type PersonnelBoard,
  type Duel,
} from '@/engines/personnel.engine';
import { buildRegulations, type RegulationBoard } from '@/engines/regulation.engine';
import { buildGazetteIssue, type GazetteIssue } from '@/engines/gazette.engine';
import type { EngineResult } from '@/domain/types';
import { useSaveStore } from '@/store/save.store';

export function useTyreLab(
  raceId: number | null,
  options?: TyreLabOptions,
): EngineResult<TyreLab> | null {
  const model = useSaveStore((s) => s.model);
  // Structurally-stable deps only — the prior object arrives from an async
  // local store and changes identity when it finishes loading.
  const prior = options?.prior;
  return useMemo(() => {
    if (!model || raceId == null) return null;
    return buildTyreLab(model, raceId, prior ? { prior } : undefined);
  }, [model, raceId, prior]);
}

export function usePaceBoard(): EngineResult<PaceBoard> | null {
  const model = useSaveStore((s) => s.model);
  return useMemo(() => {
    if (!model) return null;
    return buildPaceBoard(model);
  }, [model]);
}

export function useSim(raceId: number | null): EngineResult<SimBoard> | null {
  const model = useSaveStore((s) => s.model);
  return useMemo(() => {
    if (!model) return null;
    return buildSim(model, raceId ?? 0);
  }, [model, raceId]);
}

export function useCarLab(): EngineResult<CarLab> | null {
  const model = useSaveStore((s) => s.model);
  return useMemo(() => {
    if (!model) return null;
    return buildCarLab(model);
  }, [model]);
}

export function useFinance(): EngineResult<FinanceBoard> | null {
  const model = useSaveStore((s) => s.model);
  return useMemo(() => {
    if (!model) return null;
    return buildFinance(model);
  }, [model]);
}

export function usePersonnel(): EngineResult<PersonnelBoard> | null {
  const model = useSaveStore((s) => s.model);
  return useMemo(() => {
    if (!model) return null;
    return buildPersonnel(model);
  }, [model]);
}

export function useDriverDuel(
  aStaffId: number | null,
  bStaffId: number | null,
): EngineResult<Duel> | null {
  const model = useSaveStore((s) => s.model);
  return useMemo(() => {
    if (!model || aStaffId == null || bStaffId == null) return null;
    return buildDriverDuel(model, aStaffId, bStaffId);
  }, [model, aStaffId, bStaffId]);
}

export function useRegulations(): EngineResult<RegulationBoard> | null {
  const model = useSaveStore((s) => s.model);
  return useMemo(() => {
    if (!model) return null;
    return buildRegulations(model);
  }, [model]);
}

export function useGazette(raceId: number | null): EngineResult<GazetteIssue> | null {
  const model = useSaveStore((s) => s.model);
  return useMemo(() => {
    if (!model || raceId == null) return null;
    return buildGazetteIssue(model, raceId);
  }, [model, raceId]);
}

export type { SimOptions };
