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

  console.log('[FCM] Permission before request:', Notification.permission);
  const permission = await Notification.requestPermission();
  console.log('[FCM] Permission after request:', permission);
  if (permission !== 'granted') {
    throw new Error('Permission not granted: ' + permission);
  }

  console.log('[FCM] SW scope:', swRegistration?.scope, 'active state:', swRegistration?.active?.state);
  console.log('[FCM] SW installing:', swRegistration?.installing, 'waiting:', swRegistration?.waiting);

  let token;
  try {
    token = await getToken(msg, {
      vapidKey: 'BAxRHyGzTmKXXJiC9XAH8Aa_o9XaojKy0wvo9KaXJBKw1q91eWUrBTleHI06csPY8fexF00P2qNlQ5-lYu_xGFw',
      serviceWorkerRegistration: swRegistration
    });
    console.log('[FCM] getToken result:', token ? token.substring(0, 20) + '...' : 'EMPTY/NULL');
  } catch (err) {
    console.error('[FCM] getToken threw:', err.code, err.message);
    throw new Error('getToken error: ' + (err.code || '') + ' ' + err.message);
  }

  if (!token) {
    throw new Error('getToken returned empty/null - SW may not be valid or domain not authorized');
  }

  return token;
};