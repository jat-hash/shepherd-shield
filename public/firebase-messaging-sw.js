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

// Background data-only messages — we control display + vibration here
messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  const title = data.title || (payload.notification && payload.notification.title) || 'Shepherd Shield';
  const body = data.body || (payload.notification && payload.notification.body) || '';
  const type = data.notification_type || '';
  const clickUrl = data.click_url || '/';
  const vibrate = VIBRATE_PATTERNS[type] || VIBRATE_PATTERNS.default;

  self.registration.showNotification(title, {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate,
    tag: 'shepherd-' + (type || 'alert') + '-' + Date.now(),
    requireInteraction: type === 'emergency' || type === 'incident',
    data: { url: clickUrl, type }
  });
});

// Tap on notification — focus or open the app at the target route
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          try { client.navigate(targetUrl); } catch (_) {}
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
