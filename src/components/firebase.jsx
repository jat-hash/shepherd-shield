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

  const { getMessaging, getToken } = await import('firebase/messaging');
  const { app: firebaseApp } = initFirebase();
  const messaging = getMessaging(firebaseApp);

  // Fetch the Firebase web push certificate public key from the backend.
  let vapidKey = '';
  try {
    const res = await base44.functions.invoke('getVapidPublicKey', {});
    vapidKey = res?.data?.public_key || '';
    console.log('[FCM] VAPID key fetched:', vapidKey ? vapidKey.substring(0, 20) + '...' : 'EMPTY');
  } catch (fetchErr) {
    console.error('[FCM] Failed to fetch VAPID key:', fetchErr.message);
    throw new Error('Failed to fetch VAPID key from backend: ' + fetchErr.message);
  }
  if (!vapidKey) throw new Error('VAPID public key not available from backend — check FIREBASE_VAPID_KEY secret');

  // Let Firebase handle token caching naturally — getToken() returns the
  // existing valid token from IndexedDB if one exists, or creates a fresh
  // subscription if none exists. We deliberately do NOT delete/unsubscribe
  // on every call (that raced with Firebase's own init and caused getToken()
  // to fail, leaving no token saved after reload). The Dashboard's "Force
  // reset" button handles full cleanup explicitly when needed.
  let token;
  try {
    token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: swRegistration
    });
  } catch (getTokenErr) {
    console.error('[FCM] getToken failed:', getTokenErr.code, getTokenErr.message);
    throw new Error('Firebase getToken() failed: ' + (getTokenErr.code || '') + ' ' + getTokenErr.message);
  }

  if (!token) throw new Error('getToken returned empty/null — FCM did not issue a token');
  console.log('[FCM] Token obtained:', token.substring(0, 20) + '...');
  return token;
};