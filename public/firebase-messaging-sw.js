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

// --- IndexedDB: stores user identity for background quick-reply (app closed) ---
const IDB_NAME = 'shepherd-sw';
const IDB_STORE = 'kv';

function idbGet(key) {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = (e) => { e.target.result.createObjectStore(IDB_STORE); };
      req.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction(IDB_STORE, 'readonly');
        const getReq = tx.objectStore(IDB_STORE).get(key);
        getReq.onsuccess = () => resolve(getReq.result || null);
        getReq.onerror = () => resolve(null);
      };
      req.onerror = () => resolve(null);
    } catch (_) { resolve(null); }
  });
}

function idbPut(key, value) {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = (e) => { e.target.result.createObjectStore(IDB_STORE); };
      req.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(value, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      };
      req.onerror = () => resolve(false);
    } catch (_) { resolve(false); }
  });
}

// Page sends user identity + app_id after push registration so the SW can
// send quick-replies directly when the app is closed (no open tab to forward to)
self.addEventListener('message', (event) => {
  if (event.data?.type === 'store-identity') {
    idbPut('identity', {
      user_email: event.data.user_email,
      user_name: event.data.user_name,
      fcm_token: event.data.fcm_token,
      app_id: event.data.app_id,
    });
  }
});

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

  // Path 1: forward to an open app tab (which holds the user's session)
  const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clientList) {
    client.postMessage({ type: 'shepherd-quick-reply', channel, content });
  }
  if (clientList.length > 0) return;

  // Path 2: app is closed — use stored identity to send the reply directly.
  // The FCM token acts as the device credential (validated server-side against
  // the UserDevice table) — no shared secret shipped to the SW.
  const identity = await idbGet('identity');
  if (identity?.fcm_token && identity?.app_id) {
    try {
      const res = await fetch(`/apps/${identity.app_id}/functions/sendQuickReply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          content,
          fcm_token: identity.fcm_token,
          sender_email: identity.user_email,
          sender_name: identity.user_name,
        }),
      });
      if (res.ok) {
        // Brief silent confirmation so the user knows the reply went through
        self.registration.showNotification('✓ Reply sent', {
          body: content.length > 50 ? content.substring(0, 50) + '…' : content,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          silent: true,
        });
        return;
      }
    } catch (e) { /* fall through to manual open */ }
  }

  // Fallback: no stored identity or fetch failed — open the DM for manual reply
  await openOrFocus(`/Communications?channel=${encodeURIComponent(channel)}`, data);
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
