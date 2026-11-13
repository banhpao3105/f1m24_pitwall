/**
 * Worker client — main-thread API to the parse worker. Phase 0.
 *
 * Responsibilities (docs/02-ARCHITECTURE.md §3.3):
 *   - spawn one worker, forward progress, resolve with SaveModel
 *   - cancel = terminate (parse has no side effects; safe to throw away)
 *   - typed error codes surface to the UI unchanged
 */

import type { SaveModel } from '../../domain/types';
import type { WorkerResponse } from './parse.worker';

export interface ParseProgress {
  percent: number;
  stage: string;
}

export class ParseCancelledError extends Error {
  constructor() {
    super('Parse cancelled');
    this.name = 'ParseCancelledError';
  }
}

export interface ParsedSave {
  model: SaveModel;
  worker: Worker;
}

export function spawnParseWorker(): Worker {
  return new Worker(new URL('./parse.worker.ts', import.meta.url));
}

/**
 * Parses a .sav File locally in the worker. Resolves with the model plus the
 * live worker handle (caller may terminate it when done to free WASM memory).
 */
export function parseSaveFile(
  file: File,
  onProgress?: (p: ParseProgress) => void,
): Promise<ParsedSave> {
  const worker = spawnParseWorker();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  return new Promise<ParsedSave>((resolve, reject) => {
    const cleanup = () => worker.terminate();

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      if (msg.id !== id) return;
      switch (msg.type) {
        case 'progress':
          onProgress?.({ percent: msg.percent, stage: msg.stage });
          break;
        case 'done':
          cleanup();
          resolve({ model: msg.model, worker });
          break;
        case 'error':
          cleanup();
          reject(
            Object.assign(new Error(msg.message), {
              code: msg.code,
              details: msg.details,
            }),
          );
          break;
      }
    };

    worker.onerror = (event) => {
      cleanup();
      reject(
        Object.assign(new Error(event.message || 'Worker crashed'), {
          code: 'WORKER_ERROR',
        }),
      );
    };

    file
      .arrayBuffer()
      .then((buf) => worker.postMessage({ id, file: buf, fileName: file.name }))
      .catch((err) => {
        cleanup();
        reject(Object.assign(new Error(`Cannot read file: ${String(err)}`), { code: 'FILE_READ_ERROR' }));
      });
  });
}
