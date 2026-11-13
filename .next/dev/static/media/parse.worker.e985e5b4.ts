/**
 * Parse Web Worker — Phase 0 (docs/02-ARCHITECTURE.md §3.3).
 *
 * Receives { id, file: ArrayBuffer, fileName } — the .sav NEVER leaves the
 * device: all parsing happens right here, in this worker, on the user's
 * machine. Posts { type:'progress' } updates and a final
 * { type:'done'|'error' } message.
 */

import { runParsePipeline } from '../pipeline';

export interface ParseRequest {
  id: string;
  file: ArrayBuffer;
  fileName: string;
}

export type WorkerRequest = ParseRequest;

export type WorkerResponse =
  | { type: 'progress'; id: string; percent: number; stage: string }
  | { type: 'done'; id: string; model: import('../../domain/types').SaveModel }
  | { type: 'error'; id: string; code: string; message: string; details?: string };

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  try {
    const bytes = new Uint8Array(req.file);
    const saveId = await sha256Hex(bytes);
    const result = await runParsePipeline(bytes, {
      fileName: req.fileName,
      fileSizeBytes: bytes.byteLength,
      saveId,
      onProgress: (percent, stage) => {
        const msg: WorkerResponse = { type: 'progress', id: req.id, percent, stage };
        (self as unknown as Worker).postMessage(msg);
      },
    });
    const done: WorkerResponse = {
      type: 'done',
      id: req.id,
      model: result.model,
    };
    (self as unknown as Worker).postMessage(done);
  } catch (err) {
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code: unknown }).code)
        : 'PARSE_FAILED';
    const details =
      typeof err === 'object' && err !== null && 'details' in err
        ? (err as { details?: string }).details
        : undefined;
    const errorMsg: WorkerResponse = {
      type: 'error',
      id: req.id,
      code,
      message: (err as Error).message ?? 'Unknown parse failure',
      details,
    };
    (self as unknown as Worker).postMessage(errorMsg);
  }
};

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
