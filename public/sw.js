// Minimal service worker - Firebase messaging uses its own SW (firebase-messaging-sw.js)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
