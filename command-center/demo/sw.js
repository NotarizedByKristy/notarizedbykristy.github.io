/* ══════════════════════════════════════════
   Command Center — Service Worker
   Enables offline use and fast loading.

   IMPORTANT: When you update index.html,
   bump CACHE_VERSION below (v1 → v2 → v3...).
   That forces every installed app to pull the
   new version instead of serving the old cache.
══════════════════════════════════════════ */

const CACHE_VERSION = 'v2';
// Each copy's cache is named after its own web address, so several client
// copies hosted on one website never clear each other's offline files.
const CACHE_PREFIX  = `command-center-${self.registration.scope}-`;
const CACHE_NAME    = CACHE_PREFIX + CACHE_VERSION;

// Files cached on install so the app works fully offline
const CORE_ASSETS = [
  './',
  './index.html',
  './icon-72.png',
  './icon-96.png',
  './icon-128.png',
  './icon-144.png',
  './icon-152.png',
  './icon-167.png',
  './icon-180.png',
  './icon-192.png',
  './icon-256.png',
  './icon-384.png',
  './icon-512.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png',
  './favicon.png',
];

// ── INSTALL — cache the app shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE_ASSETS))
      // Activate this new worker immediately rather than
      // waiting for all tabs to close
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] Install cache failed:', err))
  );
});

// ── ACTIVATE — clear out old version caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── FETCH — serve strategy
self.addEventListener('fetch', event => {
  const req = event.request;

  // Only handle GET; let POST etc. pass straight through
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Google Fonts — cache-first, long lived
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(()=>{});
          return res;
        }).catch(() => cached);
      })
    );
    return;
  }

  // Mileage APIs (Nominatim / OSRM) — always network, never cache.
  // These need live data and will simply fail gracefully offline.
  if (url.hostname.includes('nominatim') || url.hostname.includes('project-osrm')) {
    event.respondWith(
      fetch(req).catch(() =>
        new Response(JSON.stringify({ error: 'offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  // App files — network-first so updates land quickly,
  // falling back to cache when offline.
  event.respondWith(
    fetch(req)
      .then(res => {
        // Only cache successful same-origin responses
        if (res && res.status === 200 && url.origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(()=>{});
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then(cached => {
          if (cached) return cached;
          // Navigation request with nothing cached → serve the app shell
          if (req.mode === 'navigate') return caches.match('./index.html');
          return new Response('Offline', { status: 503, statusText: 'Offline' });
        })
      )
  );
});

// ── MESSAGE — allows the page to trigger an immediate update
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
