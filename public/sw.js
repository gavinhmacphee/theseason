// Team Season — Network-first service worker
// Caches ONLY static app-shell assets (JS, CSS, fonts, images, icons).
// API calls, Supabase data/storage, and HTML pages are NEVER cached.

const CACHE = 'ts-v8';

// Extensions that are safe to cache (hashed filenames from Vite build)
const CACHEABLE_EXT = /\.(js|css|woff2?|ttf|eot|png|jpg|jpeg|svg|ico|webp|avif)(\?.*)?$/i;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = e.request.url;

  // Only handle GET requests
  if (e.request.method !== 'GET') return;

  // NEVER cache: API routes, Supabase (REST, storage, auth), external origins
  if (url.includes('/api/')) return;
  if (url.includes('supabase.co')) return;
  if (url.includes('supabase.in')) return;

  // NEVER cache HTML pages / navigation — always go to network
  if (e.request.mode === 'navigate') return;
  if (url.endsWith('.html') || url.includes('.html?')) return;

  // Only cache static assets (JS, CSS, fonts, images)
  if (!CACHEABLE_EXT.test(url)) return;

  // Network-first for cacheable assets
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // Only cache successful responses
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((cache) => cache.put(e.request, clone));
        }
        return res;
      })
      .catch(() =>
        // Offline — serve from cache
        caches.match(e.request)
      )
  );
});
