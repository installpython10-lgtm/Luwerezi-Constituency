/**
 * Mzimba Luwerezi Constituency — Progressive Web App Service Worker
 * Caches public static assets only. Pages, authenticated data, and API responses are never cached.
 */

const CACHE_NAME = 'luwerezi-portal-v12';

// Cache static assets relative to the service worker so both / and /public/ deployments work.
const STATIC_ASSETS = [
  './manifest.webmanifest',
  './css/variables.css',
  './css/base.css',
  './css/components.css',
  './css/pages.css',
  './css/sports.css',
  './css/admin.css',
  './js/main.js',
  './js/locales/en.js',
  './js/locales/ch.js',
  './js/modules/i18n.js',
  './js/modules/developer-credit.js',
  './js/modules/admin-shortcut.js',
  './js/modules/supabase-client.js',
  './js/modules/reporting.js',
  './js/modules/projects.js',
  './js/modules/sports.js',
  './js/modules/resident.js',
  './js/modules/admin.js',
  './assets/images/logo.png',
  './assets/images/icon.png',
  './assets/images/fischer.jpeg',
  './assets/images/profile.jpg'
];

/**
 * Installation Event: Pre-caches critical website assets.
 */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Pre-caching public static assets');
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[ServiceWorker] Some pre-cache assets could not be loaded immediately:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

/**
 * Activation Event: Cleans up deprecated cache stores.
 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name.startsWith('luwerezi-portal-') && name !== CACHE_NAME) {
            console.log('[ServiceWorker] Deleting old cache version:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

/**
 * Fetch Event: cache public static assets only; bypass documents and dynamic data.
 */
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  if (event.request.method !== 'GET' || requestUrl.origin !== self.location.origin) {
    return;
  }

  if (requestUrl.hostname.endsWith('.supabase.co') ||
      requestUrl.pathname.includes('/rest/v1/') ||
      requestUrl.pathname.includes('/auth/v1/') ||
      requestUrl.pathname.includes('/storage/v1/')) {
    return;
  }

  const isStaticAsset = /\.(?:css|js|png|jpe?g|svg|webmanifest|woff2?)$/i.test(requestUrl.pathname);
  if (!isStaticAsset) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          caches.open(CACHE_NAME)
            .then((cache) => cache.put(event.request, networkResponse.clone()))
            .catch((error) => console.warn('[ServiceWorker] Could not cache static asset:', error));
        }
        return networkResponse;
      }).catch(() => {
        return cachedResponse;
      });

      return cachedResponse || fetchPromise;
    })
  );
});