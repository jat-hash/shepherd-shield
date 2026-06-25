// Shepherd Shield — Firebase Messaging Service Worker
// Handles background push notifications with custom vibration patterns + quick-reply.
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDJvbrjIs4C85H5wrFR11pxcNxuEWwLqt8",
  authDomain: "shepard-shield-32db7.firebaseapp.com",
  projectId: "shepard-shield-32db7",
  storageBucket: "shepard-shield-32db7.firebasestorage.app",
  messagingSenderId: "1044769129553",
  appId: "1:1044769129553:web:3f0989f9f43dc39f51e470",
  measurementId: "G-C50397KQ7S"
});

const messaging = firebase.messaging();

// Take control of existing clients immediately so navigation + postMessage from
// notification taps work without requiring a full reload after the SW updates.
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Vibration patterns (ms on/off) by notification type
const VIBRATE_PATTERNS = {
  emergency: [1000, 200, 1000, 200, 1000, 200, 1000],
  incident: [400, 150, 400, 150, 400],
  assignment: [200, 100, 200],
  dm: [250, 100, 250, 100, 250],
  group_message: [200, 100, 200],
  default: [300, 100, 300, 100, 300]
};

function parsePayload(event) {
  let payload = event.data && event.data.json ? event.data.json() : null;
  if (!payload) {
    try { payload = JSON.parse(event.data && event.data.text ? event.data.text() : '{}'); } catch (_) { payload = {}; }
  }
  const data = (payload && payload.data) || {};
  const notification = (payload && payload.notification) || {};
  const title = data.title || notification.title || 'Shepherd Shield';
  const body = data.body || notification.body || '';
  const type = data.notification_type || '';
  const clickUrl = data.click_url || '/';
  return { title, body, type, clickUrl, data };
}

// Quick-reply is only offered for comms messages (DM + group) — not for emergency/incident/assignment.
function supportsQuickReply(type) {
  return type === 'dm' || type === 'group_message';
}

function buildNotificationOptions(payload) {
  const { type, clickUrl, data } = payload;
  const vibrate = VIBRATE_PATTERNS[type] || VIBRATE_PATTERNS.default;
  const tag = 'shepherd-' + (type || 'alert') + '-' + (data && data.dm_channel ? data.dm_channel : Date.now());

  const opts = {
    body: payload.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate,
    tag,
    // Every push notification stays visible until the user opens/closes it.
    // Without this, Android auto-dismisses system notifications after a few seconds.
    requireInteraction: true,
    data: { url: clickUrl, type, dm_channel: (data && data.dm_channel) || '' }
  };

  if (supportsQuickReply(type)) {
    opts.actions = [{ action: 'reply', title: 'Reply', type: 'text' }];
  }
  return opts;
}

function showAlert(payload) {
  const { title, type, data } = payload;
  const opts = buildNotificationOptions(payload);

  self.registration.showNotification(title, opts).catch(() => {});

  // Wake any open app tabs so they play the loud alarm audio + vibrate, even
  // while the page itself is in the background.
  self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
    for (const client of clientList) {
      client.postMessage({ type: 'shepherd-push', notification_type: type, title, body: payload.body, dm_channel: data && data.dm_channel });
    }
  }).catch(() => {});
}

// Background handler via firebase-messaging compat (data-only + notification payloads)
messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  const notification = payload.notification || {};
  showAlert({
    title: data.title || notification.title || 'Shepherd Shield',
    body: data.body || notification.body || '',
    type: data.notification_type || '',
    clickUrl: data.click_url || '/',
    data
  });
});

// Direct push event — fires for webpush notifications even before firebase compat loads,
// so vibration + display happen immediately with no delay.
self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const payload = parsePayload(event);
    const opts = buildNotificationOptions(payload);
    event.waitUntil(Promise.all([
      self.registration.showNotification(payload.title, opts).catch(() => {}),
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          client.postMessage({ type: 'shepherd-push', notification_type: payload.type, title: payload.title, body: payload.body, dm_channel: payload.data && payload.data.dm_channel });
        }
      }).catch(() => {})
    ]));
  } catch (_) {
    event.waitUntil(self.registration.showNotification('Shepherd Shield', { icon: '/icon-192.png' }));
  }
});

// Quick reply from a push notification — user typed text directly in the notification.
// Forwards the reply text to an already-open app tab so it can be sent using the
// logged-in user's real auth (via base44.functions.invoke). If no app tab is open,
// the reply is dropped — we don't ship the backend secret to the SW for security.
self.addEventListener('notificationclick', (event) => {
  if (event.action === 'reply' && event.reply) {
    event.waitUntil((async () => {
      const replyText = event.reply.trim();
      if (!replyText) return;
      const notifData = event.notification.data || {};
      const channel = notifData.dm_channel || 'All Team';
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true }).catch(() => []);
      const appClient = clientList.find(c => c.url && c.url.includes(self.location.origin));
      if (appClient) {
        appClient.postMessage({ type: 'shepherd-quick-reply', channel, content: replyText });
      }
      // No open tab: reply cannot be sent without the user's auth session.
    })());
    event.notification.close();
    return;
  }

  // Normal tap — focus or navigate an open tab to the target route, else open new.
  // Also post a message to the app so the Communications page can switch to the
  // specific DM channel even when the tab is already on a different route.
  event.notification.close();
  const notifData = event.notification.data || {};
  const targetUrl = notifData.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const appClient = clientList.find(c => c.url && c.url.includes(self.location.origin));
      if (appClient && 'focus' in appClient) {
        try { appClient.navigate(targetUrl); } catch (_) {}
        // Also forward the dm_channel so an open Communications tab switches to it
        appClient.postMessage({ type: 'shepherd-deeplink', url: targetUrl, dm_channel: notifData.dm_channel || '', notification_type: notifData.type || '' });
        return appClient.focus();
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});


