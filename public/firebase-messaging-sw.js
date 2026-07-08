// Shepherd Shield — Firebase Cloud Messaging Service Worker
// Handles background push notifications, including when the app is fully closed.
//
// Design: we keep the Firebase messaging SDK imported so foreground onMessage
// forwarding keeps working, but we display background notifications via a raw
// `push` event listener. onBackgroundMessage was unreliable at waking the SW to
// show notifications when the app was closed; a raw push listener fires for
// every push event regardless of SW lifecycle state, which guarantees display.

importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyDJvbrjIs4C85H5wrFR11pxcNxuEWwLqt8",
  authDomain: "shepard-shield-32db7.firebaseapp.com",
  projectId: "shepard-shield-32db7",
  storageBucket: "shepard-shield-32db7.firebasestorage.app",
  messagingSenderId: "1044769129553",
  appId: "1:1044769129553:web:3f0989f9f43dc39f51e470",
  measurementId: "G-C50397KQ7S"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();
// Deliberately do NOT register onBackgroundMessage — the raw `push` listener
// below handles display + tab forwarding and is more reliable when the SW is
// woken from a terminated state (app closed).

// SOS vibration pattern used for all incoming alerts
const SOS_VIBRATE = [100, 80, 100, 80, 100, 200, 300, 200, 300, 200, 300, 200, 100, 80, 100, 80, 100];

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

function parsePayload(event) {
  if (!event.data) return {};
  try { return event.data.json(); } catch (e) {}
  try { return JSON.parse(event.data.text()); } catch (e) {}
  return {};
}

// Forward the push to any open app tabs so the in-app alarm (loud audio +
// vibration) fires even while a tab is backgrounded. Skipped when a tab is
// focused (foreground) — Firebase forwards to onMessage in that case, which
// already triggers the alarm, so we avoid a double alert.
async function forwardToBackgroundedClients(data) {
  const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const hasFocused = clientList.some(c => c.focused);
  if (hasFocused) return;
  for (const client of clientList) {
    client.postMessage({
      type: 'shepherd-push',
      title: data.title,
      body: data.body,
      notification_type: data.notification_type,
      dm_channel: data.dm_channel,
      alert_id: data.alert_id,
    });
  }
}

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = parsePayload(event); } catch (e) { payload = {}; }
  const d = payload.data || {};
  const notif = payload.notification || {};
  const title = d.title || notif.title || 'Shepherd Shield';
  const body = d.body || notif.body || 'New notification';
  const notifType = d.notification_type || '';
  const dmChannel = d.dm_channel || '';
  const alertId = d.alert_id || '';
  const clickUrl = d.click_url || (dmChannel
    ? `/Communications?channel=${encodeURIComponent(dmChannel)}`
    : '/Communications');

  // Quick-reply inline action for direct & group messages
  const actions = (notifType === 'dm' || notifType === 'group_message')
    ? [{ action: 'reply', title: 'Reply', type: 'text' }]
    : [];

  const options = {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    requireInteraction: true,
    vibrate: SOS_VIBRATE,
    data: {
      click_url: clickUrl,
      dm_channel: dmChannel,
      notification_type: notifType,
      alert_id: alertId,
      title,
      body,
    },
    actions,
  };

  event.waitUntil(Promise.all([
    self.registration.showNotification(title, options),
    forwardToBackgroundedClients({
      title,
      body,
      notification_type: notifType,
      dm_channel: dmChannel,
      alert_id: alertId,
    }),
  ]));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Inline quick-reply: forward the typed text to an open tab (which holds the
  // user session). The SW never calls the backend directly with secrets — per
  // project decision, quick-reply from the SW is forwarded to an open tab only.
  if (event.action === 'reply' && event.reply) {
    event.waitUntil(handleQuickReply(event));
    return;
  }

  const data = event.notification.data || {};
  const clickUrl = data.click_url || '/Communications';
  event.waitUntil(openOrFocus(clickUrl, data));
});

async function handleQuickReply(event) {
  const data = event.notification.data || {};
  const channel = data.dm_channel;
  const content = event.reply;
  if (!channel || !content) return;

  const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clientList) {
    client.postMessage({ type: 'shepherd-quick-reply', channel, content });
  }
  // No open tab — open the DM so the user can reply manually
  if (clientList.length === 0) {
    await openOrFocus(`/Communications?channel=${encodeURIComponent(channel)}`, data);
  }
}

async function openOrFocus(targetUrl, data) {
  const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clientList) {
    if ('focus' in client) {
      try { await client.navigate(targetUrl); } catch (e) {}
      if (data?.dm_channel) {
        client.postMessage({ type: 'shepherd-deeplink', dm_channel: data.dm_channel });
      }
      return client.focus();
    }
  }
  return self.clients.openWindow(targetUrl);
}
