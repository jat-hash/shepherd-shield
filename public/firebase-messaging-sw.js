importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyD7BE-xvRYRzxh1gaHpEqIBw7k49J4xAoo",
  authDomain: "shepherd-shield.firebaseapp.com",
  projectId: "shepherd-shield",
  storageBucket: "shepherd-shield.firebasestorage.app",
  messagingSenderId: "983431306545",
  appId: "1:983431306545:web:6d79ca922449a63187a410"
});

const messaging = firebase.messaging();

// Handle background messages (app closed or in background)
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Background message:', payload);

  const title = payload.notification?.title || payload.data?.title || '🚨 Shepherd Shield Alert';
  const body = payload.notification?.body || payload.data?.body || 'New alert received';
  const priority = payload.data?.priority || 'medium';

  const vibrate = priority === 'high'
    ? [300, 100, 300, 100, 300, 100, 300]
    : priority === 'medium'
    ? [200, 100, 200]
    : [100];

  return self.registration.showNotification(title, {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate,
    requireInteraction: priority === 'high',
    tag: 'shepherd-alert-' + Date.now(),
    data: payload.data || {},
    actions: priority === 'high' ? [
      { action: 'open', title: 'Open App' },
      { action: 'dismiss', title: 'Dismiss' }
    ] : []
  });
});

// Handle notification click — open/focus the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});

// Periodic background sync — poll for new alerts when app is not open
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'shepherd-poll') {
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then((clientList) => {
        clientList.forEach(client => client.postMessage({ type: 'POLL_NOTIFICATIONS' }));
      })
    );
  }
});
