/* KeplarPlay Service Worker */

const CACHE_NAME = 'keplarplay-v2';
const STATIC_ASSETS = [
  '/index.html',
  '/app.html',
  '/css/base.css',
  '/css/components.css',
  '/css/pages.css',
  '/js/api.js',
  '/js/auth.js',
  '/js/app.js',
  '/js/player.js',
  '/js/ui.js',
  '/js/storage.js',
  '/js/focus.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-icon-512.png',
];

// Install: precache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).catch((err) => {
      console.warn('Failed to precache some assets:', err);
    })
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch: serve cached shell, network-first for API, cache-first for static
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never cache Xtream API calls or stream URLs
  if (
    url.pathname.includes('player_api.php') ||
    url.pathname.includes('/live/') ||
    url.pathname.includes('/movie/') ||
    url.pathname.includes('/series/') ||
    url.pathname.endsWith('.m3u8') ||
    url.pathname.endsWith('.mp4') ||
    url.pathname.endsWith('.ts')
  ) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        // Return cached and optionally revalidate in the background
        fetch(request)
          .then((response) => {
            if (response && response.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(request, response));
            }
          })
          .catch(() => {});
        return cached;
      }

      return fetch(request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
          return response;
        })
        .catch(() => {
          // Fallback to app shell for navigation requests when offline
          if (request.mode === 'navigate') {
            return caches.match('/app.html') || caches.match('/index.html');
          }
        });
    })
  );
});
