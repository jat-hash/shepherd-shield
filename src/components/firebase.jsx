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

  // Also unsubscribe any existing PushSubscription from the service worker.
  // deleteToken() only removes the FCM token from Firebase's backend — it does
  // NOT remove the browser-level PushSubscription that was created with the old
  // VAPID key. If we leave it, getToken() reuses the stale subscription and
  // Firebase issues another invalid token. Unsubscribing forces a genuinely new
  // subscription bound to the correct VAPID key.
  try {
    const existingSub = await swRegistration.pushManager.getSubscription();
    if (existingSub) {
      await existingSub.unsubscribe();
      console.log('[FCM] Removed stale push subscription');
    }
  } catch (unsubErr) {
    console.warn('[FCM] Failed to unsubscribe old push subscription:', unsubErr.message);
  }

  // Fetch the Firebase web push certificate public key from the backend.
  // Firebase's getToken() requires the key registered in Firebase Console >
  // Project Settings > Cloud Messaging > Web Push certificate — NOT the app's
  // own native Web Push VAPID key pair (those are a separate self-generated pair).
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