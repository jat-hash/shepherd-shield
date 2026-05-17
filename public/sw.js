const CACHE_NAME = 'shepherd-shield-v3';
const STATIC_ASSETS = ['/', '/index.html'];

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS).catch(() => {}))
  );
});

// ── Activate ──────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch — network first, cache fallback ─────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/functions/')) return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// ── Notification click ────────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const existing = clients.find(c => c.url.includes(self.location.origin));
      if (existing) {
        existing.focus();
        existing.navigate(targetUrl);
      } else {
        self.clients.openWindow(targetUrl);
      }
    })
  );
});

// ── Push (FCM fallback) ───────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data?.json() || {}; } catch (_) {}

  const notification = data.notification || {};
  const title = notification.title || 'Shepherd Shield Alert';
  const body = notification.body || 'New alert';
  const isEmergency = data.data?.isEmergency === 'true' || title.toLowerCase().includes('emergency');

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: isEmergency ? 'emergency' : `alert-${Date.now()}`,
      requireInteraction: isEmergency,
      vibrate: isEmergency ? [500, 200, 500, 200, 800] : [200, 100, 200],
      data: { url: data.data?.url || '/' },
    })
  );
});

// ── Message from app (keepalive + emergency) ──────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'KEEPALIVE') {
    // Just receiving this prevents the SW from being terminated.
    // Optionally ping all clients so they know SW is alive.
    self.clients.matchAll().then(clients => {
      clients.forEach(c => c.postMessage({ type: 'SW_ALIVE' }));
    });
    return;
  }

  if (event.data?.type === 'EMERGENCY_ALERT') {
    const { title, body } = event.data;
    self.registration.showNotification(title || '🚨 EMERGENCY ALERT', {
      body: body || 'Immediate action required',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'emergency',
      requireInteraction: true,
      vibrate: [800, 200, 800, 200, 800, 200, 1000],
      data: { url: '/' },
    });
  }

  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ── Periodic Background Sync ──────────────────────────────────────────────────
// Fires even when the app is closed (Chrome/Android, if permission granted).
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'shepherd-poll' || event.tag === 'shepherd-incidents' || event.tag === 'shepherd-locations') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
        if (clients.length > 0) {
          // App is open — tell it to refresh
          clients.forEach(c => c.postMessage({ type: 'BACKGROUND_SYNC', tag: event.tag }));
        } else {
          // App is closed — show a silent keepalive notification (immediately closed)
          // so the browser knows we're doing useful work
          return self.registration.showNotification('Shepherd Shield', {
            body: 'Checking for new alerts…',
            silent: true,
            tag: 'silent-keepalive',
            icon: '/icon-192.png',
          }).then(() => {
            setTimeout(() => {
              self.registration.getNotifications({ tag: 'silent-keepalive' })
                .then(notifs => notifs.forEach(n => n.close()));
            }, 1000);
          });
        }
      })
    );
  }
});

// ── Background Sync (one-shot, triggered by app) ──────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'shepherd-sync') {
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(c => c.postMessage({ type: 'SYNC_NOW' }));
      })
    );
  }
});
