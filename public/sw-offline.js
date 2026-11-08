// Shepherd Shield — offline app shell.
//
// Imported by every service worker this app registers (sw.js,
// firebase-messaging-sw.js, web-push-sw.js), so whichever worker a device ends
// up with also keeps the app itself loadable with no internet: the shell is
// precached on install, navigations fall back to the cached shell, and build
// assets are served from cache and refreshed in the background.

const SHELL_CACHE = 'shepherd-shield-shell-v1';
const SHELL_FILES = ['/', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      Promise.all(SHELL_FILES.map((file) => cache.add(file).catch(() => {})))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('shepherd-shield-shell') && key !== SHELL_CACHE)
            .map((key) => caches.delete(key))
        )
      )
  );
});

// Only this app's own GET requests are cached — API calls, functions and
// third-party origins always go straight to the network.
const cacheable = (request) => {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/functions/')) return false;
  return true;
};

const storeShell = (response) => {
  if (!response || !response.ok) return response;
  const copy = response.clone();
  caches.open(SHELL_CACHE).then((cache) => cache.put('/index.html', copy)).catch(() => {});
  return response;
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (!cacheable(request)) return;

  // Opening the app: always fresh when there is a network, the stored shell
  // when there is not, so a phone with no signal still launches the app.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(storeShell)
        .catch(() =>
          caches.match('/index.html').then((cached) => cached || caches.match('/'))
        )
    );
    return;
  }

  // Everything else this app serves: use the stored copy immediately, then
  // refresh it in the background for the next load.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
