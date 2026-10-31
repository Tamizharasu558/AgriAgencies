// KisanAgri Hub Service Worker (PWA & Offline First)
const CACHE_NAME = 'kisanagri-cache-v1.6';
const STATIC_ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/data.js',
  './js/app.js',
  './manifest.json',
  './assets/favicon.svg',
  './assets/favicon.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-maskable.png',
  './assets/apple-touch-icon.png',
  './assets/iffco_urea.jpg',
  './assets/coromandel_gromor.jpg',
  './assets/agrochemical_bottle.jpg'
];

// Install: Cache critical shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate: Clean up older cache versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Stale-while-revalidate for static assets, network-first for navigation
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Don't intercept UPI or external protocols
  if (!req.url.startsWith('http')) return;

  event.respondWith(
    caches.match(req).then((cachedResp) => {
      const fetchPromise = fetch(req).then((networkResp) => {
        if (networkResp && networkResp.status === 200) {
          const respToCache = networkResp.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, respToCache);
          });
        }
        return networkResp;
      }).catch(() => {
        // Offline fallback
        return cachedResp;
      });

      return cachedResp || fetchPromise;
    })
  );
});

