/**
 * In-memory idb-keyval mock for unit tests — same function surface
 * (`createStore/set/get/del/entries`) backed by a plain Map. Values are kept
 * by reference (a FileSystemFileHandle holds functions — in Chromium the
 * structured-clone algorithm special-cases handles; here we just need key
 * semantics).
 */

import { vi } from 'vitest';

export interface IdbMemoryMock {
  createStore: () => string;
  set: (key: string, value: unknown) => Promise<void>;
  get: (key: string) => Promise<unknown>;
  del: (key: string) => Promise<void>;
  entries: () => Promise<[string, unknown][]>;
  /** Direct access for assertions + between-test resets. */
  __mem: Map<string, unknown>;
}

export function createIdbMemoryMock(): IdbMemoryMock {
  const mem = new Map<string, unknown>();
  return {
    createStore: () => 'mock-store',
    set: vi.fn(async (key: string, value: unknown) => {
      mem.set(key, value);
    }),
    get: vi.fn(async (key: string) =>
      mem.has(key) ? mem.get(key) : undefined,
    ),
    del: vi.fn(async (key: string) => {
      mem.delete(key);
    }),
    entries: vi.fn(async () => [...mem.entries()]),
    __mem: mem,
  };
}
