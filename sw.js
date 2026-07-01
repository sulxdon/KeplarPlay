/* KeplarPlay Service Worker */

const CACHE_NAME = 'keplarplay-v3';

// Compute the base path where this service worker is served so the cache works
// whether the app is hosted at the domain root or in a subdirectory.
const SW_PATH = self.location.pathname;
const BASE_PATH = SW_PATH.replace(/sw\.js$/, '') || '/';

function getAssetUrl(path) {
  if (BASE_PATH === '/') return path;
  return `${BASE_PATH}${path.replace(/^\//, '')}`;
}

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
].map(getAssetUrl);

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

function isXtreamOrStreamRequest(url) {
  return (
    url.pathname.includes('player_api.php') ||
    url.pathname.includes('/live/') ||
    url.pathname.includes('/movie/') ||
    url.pathname.includes('/series/') ||
    url.pathname.endsWith('.m3u8') ||
    url.pathname.endsWith('.mp4') ||
    url.pathname.endsWith('.ts')
  );
}

function isNavigationRequest(request) {
  return request.mode === 'navigate' || request.destination === 'document';
}

// Fetch: serve cached shell, network-first for API, cache-first for static
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never cache Xtream API calls or stream URLs
  if (isXtreamOrStreamRequest(url)) {
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
          if (isNavigationRequest(request)) {
            return caches.match(getAssetUrl('/app.html'))
              || caches.match(getAssetUrl('/index.html'));
          }
        });
    })
  );
});
