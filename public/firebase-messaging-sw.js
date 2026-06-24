// Shepherd Shield — Firebase Messaging Service Worker
// Handles background push notifications with custom vibration patterns.
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyD7BE-xvRYRzxh1gaHpEqIBw7k49J4xAoo",
  authDomain: "shepherd-shield.firebaseapp.com",
  projectId: "shepherd-shield",
  storageBucket: "shepherd-shield.firebasestorage.app",
  messagingSenderId: "983431306545",
  appId: "1:983431306545:web:6d79ca922449a63187a410",
  measurementId: "G-NS92YPKPB3"
});

const messaging = firebase.messaging();

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

function showAlert(payload) {
  const { title, body, type, clickUrl } = payload;
  const vibrate = VIBRATE_PATTERNS[type] || VIBRATE_PATTERNS.default;
  const tag = 'shepherd-' + (type || 'alert') + '-' + (payload.data && payload.data.dm_channel ? payload.data.dm_channel : Date.now());

  self.registration.showNotification(title, {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate,
    tag,
    requireInteraction: type === 'emergency' || type === 'incident',
    data: { url: clickUrl, type }
  }).catch(() => {});

  // Wake any open app tabs so they play the loud alarm audio + vibrate, even
  // while the page itself is in the background.
  self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
    for (const client of clientList) {
      client.postMessage({ type: 'shepherd-push', notification_type: type, title, body, dm_channel: payload.data && payload.data.dm_channel });
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
    event.waitUntil(Promise.all([
      self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        vibrate: VIBRATE_PATTERNS[payload.type] || VIBRATE_PATTERNS.default,
        tag: 'shepherd-' + (payload.type || 'alert') + '-' + (payload.data && payload.data.dm_channel ? payload.data.dm_channel : Date.now()),
        requireInteraction: payload.type === 'emergency' || payload.type === 'incident',
        data: { url: payload.clickUrl, type: payload.type }
      }).catch(() => {}),
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

// Tap on notification — focus or navigate an open tab to the target route, else open new
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Prefer a tab already on our origin
      for (const client of clientList) {
        if (client.url && client.url.startsWith(self.location.origin) && 'focus' in client) {
          try { client.navigate(targetUrl); } catch (_) {}
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
