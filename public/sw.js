const CACHE_NAME = 'shepherd-shield-v1';

// On install, cache nothing — we'll cache dynamically
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Clean up old caches
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // Skip API calls — let them fail naturally offline
  if (url.pathname.startsWith('/api/') || url.hostname !== self.location.hostname) return;

  // Network-first strategy: try network, fall back to cache
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful responses
        if (response && response.status === 200) {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
        }
        return response;
      })
      .catch(() => {
        // Offline — serve from cache
        return caches.match(request).then((cached) => {
          if (cached) return cached;
          // For navigation requests (page loads), serve the main index.html
          if (request.mode === 'navigate') {
            return caches.match('/') || caches.match('/index.html');
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});
