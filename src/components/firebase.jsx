import { initializeApp } from 'firebase/app';
import { base44 } from '@/api/base44Client';

const firebaseConfig = {
  apiKey: "AIzaSyDJvbrjIs4C85H5wrFR11pxcNxuEWwLqt8",
  authDomain: "shepard-shield-32db7.firebaseapp.com",
  projectId: "shepard-shield-32db7",
  storageBucket: "shepard-shield-32db7.firebasestorage.app",
  messagingSenderId: "1044769129553",
  appId: "1:1044769129553:web:3f0989f9f43dc39f51e470",
  measurementId: "G-C50397KQ7S"
};

let app;

export const initFirebase = () => {
  if (!app) {
    app = initializeApp(firebaseConfig);
  }
  return { app };
};

export const getFCMToken = async (swRegistration) => {
  // Check notification permission — use Permissions API as fallback when
  // window.Notification is undefined (some Android browsers/embedded webviews).
  let notifPermission = 'denied';
  if ('Notification' in window) {
    notifPermission = window.Notification.permission;
  } else if ('permissions' in navigator) {
    try {
      const result = await navigator.permissions.query({ name: 'notifications' });
      notifPermission = result.state === 'granted' ? 'granted' : 'denied';
    } catch (_) {}
  }
  if (notifPermission !== 'granted') {
    throw new Error('Notification permission not granted: ' + notifPermission);
  }

  const { getMessaging, getToken, deleteToken } = await import('firebase/messaging');
  const { app: firebaseApp } = initFirebase();
  const messaging = getMessaging(firebaseApp);

  // Force-delete any cached token first — the browser stores tokens in IndexedDB
  // and returns the same (possibly stale/invalid) one on every call. Deleting
  // forces Firebase to issue a genuinely fresh token bound to the current VAPID key.
  try { await deleteToken(messaging); } catch (_) {}

  // Fetch the VAPID public key from the backend so FCM and native Web Push share
  // the same key pair — the one registered in the Firebase console's Web Push
  // certificate. A mismatched hardcoded key causes Firebase to issue tokens it
  // then rejects as "not a valid FCM registration token".
  let vapidKey = '';
  try {
    const res = await base44.functions.invoke('getVapidPublicKey', {});
    vapidKey = res?.data?.public_key || '';
  } catch (_) {}
  if (!vapidKey) throw new Error('VAPID public key not available from backend');

  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: swRegistration
  });

  if (!token) throw new Error('getToken returned empty/null');
  return token;
};