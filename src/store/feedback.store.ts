'use client';

/**
 * Local recommendation feedback — Phase 2 (docs/03 §5.11 feedback loop).
 * 👍/👎 per recommendation id, persisted to localStorage ONLY. Never sent
 * anywhere (local-first privacy contract, docs golden rule 1).
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type FeedbackVote = 'up' | 'down';

interface FeedbackState {
  votes: Record<string, FeedbackVote>;
  setVote: (id: string, vote: FeedbackVote) => void;
  /** Toggles: same vote again clears it. */
  toggleVote: (id: string, vote: FeedbackVote) => void;
  clear: () => void;
}

const STORAGE_KEY = 'pitwall:feedback';

export const useFeedbackStore = create<FeedbackState>()(
  persist(
    (set) => ({
      votes: {},
      setVote: (id, vote) => set((s) => ({ votes: { ...s.votes, [id]: vote } })),
      toggleVote: (id, vote) =>
        set((s) => {
          const next = { ...s.votes };
          if (next[id] === vote) delete next[id];
          else next[id] = vote;
          return { votes: next };
        }),
      clear: () => set({ votes: {} }),
    }),
    { name: STORAGE_KEY, storage: createJSONStorage(() => localStorage) },
  ),
);
