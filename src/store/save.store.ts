/**
 * Save session store — Phase 0 (docs/02-ARCHITECTURE.md §3.3, §3.4).
 * Holds the current parse lifecycle: idle → parsing → ready | error.
 * The SaveModel itself is the Normalized Model from src/parser — UI never
 * touches SQL or GVAS bytes.
 */

import { create } from 'zustand';
import type { SaveModel } from '@/domain/types';

export type SaveStatus = 'idle' | 'parsing' | 'ready' | 'error';

export interface ParseProgressInfo {
  percent: number;
  stage: string;
}

export interface SaveErrorInfo {
  code: string;
  message: string;
  details?: string;
}

interface SaveState {
  status: SaveStatus;
  model: SaveModel | null;
  progress: ParseProgressInfo | null;
  error: SaveErrorInfo | null;
  setParsing: () => void;
  setProgress: (progress: ParseProgressInfo) => void;
  setReady: (model: SaveModel) => void;
  setError: (error: SaveErrorInfo) => void;
  /** Clears session state (used when opening another save / resetting). */
  reset: () => void;
}

export const useSaveStore = create<SaveState>()((set) => ({
  status: 'idle',
  model: null,
  progress: null,
  error: null,
  setParsing: () => set({ status: 'parsing', progress: null, error: null }),
  setProgress: (progress) => set({ progress }),
  setReady: (model) => set({ status: 'ready', model, progress: null, error: null }),
  setError: (error) => set({ status: 'error', error, progress: null }),
  reset: () => set({ status: 'idle', model: null, progress: null, error: null }),
}));
