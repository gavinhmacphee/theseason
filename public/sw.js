// Team Season — Network-first service worker
// Always fetches fresh from the network; cache is offline fallback only
// API and Supabase calls bypass the SW entirely

const CACHE = 'ts-v4';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      // Delete ALL old caches — including any workbox-precache caches from VitePWA
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('/api/') || e.request.url.includes('supabase')) return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // Got fresh response — cache it for offline and serve it
        const clone = res.clone();
        caches.open(CACHE).then((cache) => cache.put(e.request, clone));
        return res;
      })
      .catch(() =>
        // Offline — serve from cache
        caches.match(e.request)
      )
  );
});
