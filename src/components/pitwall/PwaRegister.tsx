'use client';

/**
 * PWA registration — Phase 3 (docs/02 §3.6). Registers the manual service
 * worker in PRODUCTION builds only: registering against `next dev` would
 * cache HMR chunks and break hot reload. Local-first contract untouched —
 * the SW never sees save data (IndexedDB stays page-owned).
 */

import { useEffect } from 'react';

export function PwaRegister() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== 'production' ||
      typeof navigator === 'undefined' ||
      !('serviceWorker' in navigator)
    ) {
      return;
    }
    const register = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch(() => {
          // Offline support is best-effort; app works fully without it.
        });
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
