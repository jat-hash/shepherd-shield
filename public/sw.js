// Shepherd Shield Service Worker
const CACHE_NAME = 'shepherd-shield-v3';

// Install
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch (network-first for API, cache for assets)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/functions/')) return;

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// ── Push Notification Click Handler ──────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  let targetUrl = '/';

  // Priority 1: explicit click_url from FCM data payload
  if (data.click_url) {
    targetUrl = data.click_url;
  }
  // Priority 2: dm_channel field
  else if (data.dm_channel) {
    targetUrl = `/Communications?channel=${encodeURIComponent(data.dm_channel)}`;
  }
  // Priority 3: notification_type
  else if (data.notification_type === 'group_message') {
    targetUrl = '/Communications';
  }
  // Priority 4: alertId
  else if (data.alertId) {
    targetUrl = '/';
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // If the app is already open, focus it and navigate
      for (const client of clients) {
        if ('focus' in client) {
          client.focus();
          client.navigate(targetUrl).catch(() => {});
          return;
        }
      }
      // Otherwise open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// ── Push Event (background push) ─────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload = {};
  try { payload = event.data.json(); } catch (_) {
    payload = { notification: { title: 'Shepherd Shield', body: event.data.text() } };
  }

  const notif = payload.notification || {};
  const data = payload.data || {};

  const title = notif.title || 'Shepherd Shield';
  const body = notif.body || '';
  const isDM = data.notification_type === 'dm' || !!data.dm_channel;
  const isEmergency = data.alertId || title.includes('EMERGENCY');

  const options = {
    body,
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    tag: data.dm_channel ? `dm-${data.dm_channel}` : (data.alertId ? `alert-${data.alertId}` : `msg-${Date.now()}`),
    renotify: true,
    silent: false,
    requireInteraction: isEmergency,
    vibrate: isEmergency ? [1000, 200, 1000, 200, 1000] : isDM ? [200, 100, 200] : [100],
    data: {
      ...data,
      click_url: data.click_url || (data.dm_channel
        ? `/Communications?channel=${encodeURIComponent(data.dm_channel)}`
        : isEmergency ? '/' : '/Communications')
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Message from App ──────────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'EMERGENCY_ALERT') {
    const alert = event.data.alert;
    self.registration.showNotification('🚨 EMERGENCY ALERT', {
      body: `${alert.alert_type?.toUpperCase()} — ${alert.message}`,
      icon: '/icon-192x192.png',
      badge: '/icon-192x192.png',
      vibrate: [1000, 200, 1000, 200, 1000, 200, 1000],
      tag: 'emergency-' + alert.id,
      requireInteraction: true,
      renotify: true,
      silent: false,
      data: { click_url: '/', alertId: alert.id }
    });
  }

  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
