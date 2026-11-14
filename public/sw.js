/*
 * F1 Pit Wall service worker — Phase 3 (docs/02 §3.6: PWA offline, P1).
 *
 * Strategy:
 *   - App shell (start URL, manifest, icons): precache at install.
 *   - Navigations (HTML/RSC): network-first, fall back to the cached shell
 *     when offline — the app itself is a client-side dashboard, so the
 *     restored IndexedDB save keeps every view usable without network.
 *   - Static assets (/_next/static, sql-wasm, icons): stale-while-revalidate.
 *
 * The save data itself NEVER goes through the worker: it lives in IndexedDB
 * (pitwall-db) owned by the page — the local-first privacy contract holds.
 * Bump CACHE_VERSION on each release to invalidate stale shells.
 */

const CACHE_VERSION = 'pitwall-v0.5.1';
const SHELL_PRECACHE = [
  '/',
  '/manifest.webmanifest',
  '/icons/pitwall-icon-192.png',
  '/icons/pitwall-icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(SHELL_PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/sql-wasm/') ||
    url.pathname.startsWith('/icons/')
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: network-first, cached shell as the offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put('/', copy));
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_VERSION);
          return (
            (await cache.match(request)) ||
            (await cache.match('/')) ||
            new Response('Offline', { status: 503, statusText: 'Offline' })
          );
        }),
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(CACHE_VERSION).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
  }
});
