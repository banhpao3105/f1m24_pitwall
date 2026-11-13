/**
 * Parse controller — owns the parse session OUTSIDE any component lifecycle.
 *
 * Bug fixed here: the dropzone component used to own the session and called
 * cancel() on unmount — but the dropzone unmounts the moment status flips to
 * 'parsing', killing the worker instantly. The controller is module-scoped:
 * cancel happens only when the user asks for it or when a new parse starts.
 */

import { createParseSession, type ParseSession } from '@/parser/worker/parse-client';
import { useSaveStore } from '@/store/save.store';
import { putSave, setLastActiveSaveId } from '@/lib/save-db';
import { toast } from '@/hooks/use-toast';

const MAX_FILE_BYTES = 500 * 1024 * 1024; // 500 MB (docs/05 §9.5)

let activeSession: ParseSession | null = null;

function killSession(): void {
  activeSession?.cancel();
  activeSession = null;
}

export function cancelParseFlow(): void {
  killSession();
  useSaveStore.getState().reset();
}

export async function startParseFlow(file: File): Promise<void> {
  const store = useSaveStore.getState();

  if (!file.name.toLowerCase().endsWith('.sav')) {
    store.setError({ code: 'BAD_EXTENSION', message: file.name });
    return;
  }
  if (file.size > MAX_FILE_BYTES) {
    store.setError({ code: 'FILE_TOO_LARGE', message: file.name });
    return;
  }

  // A previous idle worker (if any) is freed here — never mid-parse unless
  // the user re-triggers the dropzone, which is an explicit cancel.
  killSession();
  store.setParsing();

  const session = createParseSession();
  activeSession = session;

  try {
    const { model, worker } = await session.start(file, (p) =>
      useSaveStore.getState().setProgress(p),
    );
    // Model transferred out of the worker — free the WASM heap.
    worker.terminate();
    try {
      await putSave(model);
      await setLastActiveSaveId(model.meta.id);
    } catch (err) {
      // Persistence is best-effort (quota / private mode); the parse result
      // stays valid for this session.
      toast({
        title: 'IndexedDB',
        description: `Could not cache this save locally: ${String(err)}`,
      });
    }
    useSaveStore.getState().setReady(model);
  } catch (err) {
    const e = err as Error & { code?: string; details?: string };
    // Cancellation terminates the worker silently — surface it as idle.
    if (e.name === 'ParseCancelledError') {
      useSaveStore.getState().reset();
      return;
    }
    useSaveStore.getState().setError({
      code: e.code ?? 'PARSE_FAILED',
      message: e.message,
      details: e.details,
    });
  } finally {
    if (activeSession === session) activeSession = null;
  }
}
