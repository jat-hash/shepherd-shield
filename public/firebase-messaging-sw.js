// firebase-messaging-sw.js — Shepherd Shield FCM background push handler.
//
// Receives data-only FCM pushes when the app is backgrounded or fully closed,
// and shows a persistent system notification with SOS vibration for EVERY
// notification type (messages, DMs, incidents, emergencies) so that incoming
// chat alerts demand the same emphatic attention as emergency alerts.
//
// Also forwards events to any open app tab so the foreground page can play
// the coordinated audio tone + screen flash via triggerNotificationEffect.

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

// SOS vibration pattern — used for ALL push types so every notification
// (message, DM, incident, emergency) vibrates emphatically when the app is off.
const SOS_VIBRATE = [100, 80, 100, 80, 100, 200, 300, 200, 300, 200, 300, 200, 100, 80, 100, 80, 100];

function buildOptions(data) {
  const type = data.notification_type || '';
  const isMessage = type === 'dm' || type === 'group_message' || type === 'general' || type === '';
  const clickUrl = data.click_url || (data.dm_channel
    ? '/Communications?channel=' + encodeURIComponent(data.dm_channel)
    : '/Communications');

  const opts = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: SOS_VIBRATE,
    tag: data.dm_channel || type || 'shepherd',
    requireInteraction: true,   // persist until the user acknowledges
    renotify: true,             // re-alert when a new push with same tag arrives
    data: {
      click_url: clickUrl,
      dm_channel: data.dm_channel || '',
      notification_type: type
    }
  };

  // Quick-reply action for chat messages so users can reply from the notification
  if (isMessage) {
    opts.actions = [{ action: 'reply', title: 'Reply', type: 'text' }];
  }

  return opts;
}

function broadcast(msg) {
  self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    list.forEach(c => c.postMessage(msg));
  });
}

// FCM data-only background handler — fires for every push when app is closed/backgrounded
messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  const title = data.title || 'Shepherd Shield';
  self.registration.showNotification(title, buildOptions(data));
  // Forward to open tabs so the foreground page plays the audio tone + screen flash
  broadcast({ type: 'shepherd-push', notification_type: data.notification_type, dm_channel: data.dm_channel });
});

// Notification click — deep-link into the app, or forward quick-reply to an open tab
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};

  // Quick-reply action: forward the typed reply to an open app tab (which has
  // user auth to send the message). Security: we never ship secrets to the SW.
  if (event.action === 'reply' && event.reply) {
    broadcast({ type: 'shepherd-quick-reply', channel: data.dm_channel, content: event.reply });
    return;
  }

  // Deep-link: navigate an open tab to the DM/channel, or open a new window
  const clickUrl = data.click_url || '/Communications';
  broadcast({ type: 'shepherd-deeplink', dm_channel: data.dm_channel });

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes(self.location.origin) && 'focus' in c) {
          c.navigate(clickUrl);
          return c.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(clickUrl);
    })
  );
});

// Claim existing clients immediately on activation so pushes work without a reload
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
