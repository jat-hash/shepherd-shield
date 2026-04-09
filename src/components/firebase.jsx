import { initializeApp } from 'firebase/app';
import { getMessaging, getToken } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: "AIzaSyD7BE-xvRYRzxh1gaHpEqIBw7k49J4xAoo",
  authDomain: "shepherd-shield.firebaseapp.com",
  projectId: "shepherd-shield",
  storageBucket: "shepherd-shield.firebasestorage.app",
  messagingSenderId: "983431306545",
  appId: "1:983431306545:web:6d79ca922449a63187a410",
  measurementId: "G-NS92YPKPB3"
};

let app;
let messaging;

export const initFirebase = () => {
  if (!app) {
    app = initializeApp(firebaseConfig);
    messaging = getMessaging(app);
  }
  return { app, messaging };
};

export const getFCMToken = async (swRegistration) => {
  const { messaging: msg } = initFirebase();

  const notifPermission = ('Notification' in window) ? window.Notification.permission : 'denied';
  console.log('[FCM] Current permission:', notifPermission);
  if (notifPermission !== 'granted') {
    throw new Error('Notification permission not granted: ' + notifPermission);
  }

  console.log('[FCM] SW scope:', swRegistration?.scope, 'active state:', swRegistration?.active?.state);
  console.log('[FCM] SW installing:', swRegistration?.installing, 'waiting:', swRegistration?.waiting);
  console.log('[FCM] messaging object exists:', !!msg);

  let token;
  try {
    console.log('[FCM] Calling getToken with VAPID key and SW registration...');
    token = await getToken(msg, {
      vapidKey: 'BDXxLp5-kEn--p9rd4nRgyapdT_sTe7IhthMn5Sm4AUxzAcYB_Ka_KxVVTLnxta6OLq08YR-C3ujPJoXFiEYLS8',
      serviceWorkerRegistration: swRegistration
    });
    console.log('[FCM] getToken success, result:', token ? token.substring(0, 20) + '...' : 'EMPTY/NULL');
  } catch (err) {
    console.error('[FCM] getToken error - code:', err.code, 'message:', err.message);
    console.error('[FCM] Full error:', err);
    throw new Error('getToken failed: ' + (err.code || 'unknown') + ' - ' + err.message);
  }

  if (!token) {
    throw new Error('getToken returned empty/null - SW may not be valid or domain not authorized');
  }

  console.log('[FCM] Returning token successfully');
  return token;
};