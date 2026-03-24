const CACHE_NAME = 'shepherd-shield-v3';

// Only cache these specific static assets
const STATIC_ASSETS = [
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Never intercept non-GET requests
  if (request.method !== 'GET') return;

  // Never intercept Vite dev server, HMR, or API requests
  const url = new URL(request.url);
  if (
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/node_modules/') ||
    url.pathname.startsWith('/@') ||
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('base44.com') ||
    url.protocol === 'wss:'
  ) {
    return;
  }

  // For everything else: network first, no caching of JS/CSS to avoid stale chunks
  const ext = url.pathname.split('.').pop();
  if (['js', 'jsx', 'ts', 'tsx', 'css'].includes(ext)) {
    return; // Let browser handle JS/CSS directly, no SW caching
  }

  // Cache-first only for manifest and icons
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});
