// Firebase Cloud Messaging Service Worker
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// Initialize Firebase — config values are public/safe in SW context
firebase.initializeApp({
  apiKey: "AIzaSyExample",
  authDomain: "example.firebaseapp.com",
  projectId: "example",
  storageBucket: "example.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:0000000000000000"
});

const messaging = firebase.messaging();

// Background message handler
messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  const notif = payload.notification || {};

  const title = notif.title || data.title || 'Shepherd Shield';
  const body = notif.body || data.body || '';
  const isDM = data.notification_type === 'dm' || !!data.dm_channel;
  const isEmergency = !!data.alertId || title.includes('EMERGENCY');

  const clickUrl = data.click_url || (data.dm_channel
    ? `/Communications?channel=${encodeURIComponent(data.dm_channel)}`
    : isEmergency ? '/' : '/Communications');

  const options = {
    body,
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    tag: data.dm_channel ? `dm-${data.dm_channel}` : (data.alertId ? `alert-${data.alertId}` : `fcm-${Date.now()}`),
    renotify: true,
    silent: false,
    requireInteraction: isEmergency,
    vibrate: isEmergency ? [1000, 200, 1000, 200, 1000] : isDM ? [200, 100, 200] : [100],
    data: {
      ...data,
      click_url: clickUrl
    }
  };

  return self.registration.showNotification(title, options);
});

// Notification click handler for FCM-delivered notifications
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};

  let targetUrl = '/';
  if (data.click_url) {
    targetUrl = data.click_url;
  } else if (data.dm_channel) {
    targetUrl = `/Communications?channel=${encodeURIComponent(data.dm_channel)}`;
  } else if (data.notification_type === 'group_message') {
    targetUrl = '/Communications';
  } else if (data.alertId) {
    targetUrl = '/';
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const client of clients) {
        if ('focus' in client) {
          client.focus();
          client.navigate(targetUrl).catch(() => {});
          return;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
