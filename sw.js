const CACHE_NAME = 'hexgame-cache-v1';
const CORE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './textures.js',
  './src/game.js',
  './src/gameExports.js',
  './src/reset.js',
  './manifest.webmanifest'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) {
        // Update in background
        fetch(req).then(resp => {
          caches.open(CACHE_NAME).then(cache => cache.put(req, resp.clone()));
        }).catch(()=>{});
        return cached;
      }
      return fetch(req).then(resp => {
        if (!resp || resp.status !== 200 || resp.type === 'opaque') return resp;
        const copy = resp.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        return resp;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
