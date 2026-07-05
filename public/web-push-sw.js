// Shepherd Shield — Native Web Push Service Worker (VAPID)
//
// Handles Web Push API notifications for browsers not covered by FCM
// (e.g. iOS Safari installed PWA). On FCM-capable browsers (Chrome/Android/
// desktop), firebase-messaging-sw.js is used instead — only one push
// subscription per service-worker registration is allowed, so we never
// register this SW where FCM is already in use.
//
// Mirrors firebase-messaging-sw.js's notification handling (SOS vibration for
// messages, quick-reply, deep-link into the right DM) but without the Firebase
// dependency, so it installs cleanly on iOS Safari.

self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });

// Vibration patterns (ms on/off) by notification type. Incoming messages use
// the full SOS-style pattern so they demand attention even with the screen off.
const VIBRATE_PATTERNS = {
  emergency:     [1000, 200, 1000, 200, 1000, 200, 1000],
  incident:      [400, 150, 400, 150, 400],
  assignment:    [200, 100, 200],
  dm:            [1000, 200, 1000, 200, 1000, 200, 1000],
  group_message: [1000, 200, 1000, 200, 1000, 200, 1000],
  default:       [1000, 200, 1000, 200, 1000, 200, 1000]
};

function parsePayload(event) {
  let payload = {};
  try { payload = event.data && event.data.json ? event.data.json() : {}; } catch (_) {
    try { payload = JSON.parse(event.data && event.data.text ? event.data.text() : '{}'); } catch (e) { payload = {}; }
  }
  const data = payload.data || payload;
  const notification = payload.notification || {};
  return {
    title: data.title || notification.title || 'Shepherd Shield',
    body: data.body || notification.body || '',
    type: data.notification_type || '',
    clickUrl: data.click_url || '/',
    dmChannel: data.dm_channel || '',
    data
  };
}

function supportsQuickReply(type) {
  return type === 'dm' || type === 'group_message';
}

function buildOptions(p) {
  const vibrate = VIBRATE_PATTERNS[p.type] || VIBRATE_PATTERNS.default;
  const tag = 'shepherd-' + (p.type || 'alert') + '-' + (p.dmChannel || Date.now());
  const opts = {
    body: p.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate,
    tag,
    requireInteraction: true,
    data: { url: p.clickUrl, type: p.type, dm_channel: p.dmChannel }
  };
  if (supportsQuickReply(p.type)) {
    opts.actions = [{ action: 'reply', title: 'Reply', type: 'text' }];
  }
  return opts;
}

self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const p = parsePayload(event);
    const opts = buildOptions(p);
    event.waitUntil(Promise.all([
      self.registration.showNotification(p.title, opts).catch(() => {}),
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
        for (const c of list) {
          c.postMessage({ type: 'shepherd-push', notification_type: p.type, title: p.title, body: p.body, dm_channel: p.dmChannel });
        }
      }).catch(() => {})
    ]));
  } catch (_) {
    event.waitUntil(self.registration.showNotification('Shepherd Shield', { icon: '/icon-192.png' }));
  }
});

self.addEventListener('notificationclick', (event) => {
  // Quick reply (text input) forwarded to an open app tab — sent using the
  // logged-in user's auth. If no tab is open the reply is dropped (we never
  // ship the backend secret to the service worker).
  if (event.action === 'reply' && event.reply) {
    event.waitUntil((async () => {
      const replyText = (event.reply || '').trim();
      if (!replyText) return;
      const notifData = event.notification.data || {};
      const channel = notifData.dm_channel || 'All Team';
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true }).catch(() => []);
      const appClient = list.find(c => c.url && c.url.includes(self.location.origin));
      if (appClient) {
        appClient.postMessage({ type: 'shepherd-quick-reply', channel, content: replyText });
      }
    })());
    event.notification.close();
    return;
  }

  event.notification.close();
  const notifData = event.notification.data || {};
  const targetUrl = notifData.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const appClient = list.find(c => c.url && c.url.includes(self.location.origin));
      if (appClient && 'focus' in appClient) {
        try { appClient.navigate(targetUrl); } catch (_) {}
        appClient.postMessage({ type: 'shepherd-deeplink', url: targetUrl, dm_channel: notifData.dm_channel || '', notification_type: notifData.type || '' });
        return appClient.focus();
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
