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
  try {
    const { messaging: msg } = initFirebase();
    
    // Log current permission state before requesting
    console.log('[FCM] Current Notification.permission:', Notification.permission);
    
    // Request permission first
    const permission = await Notification.requestPermission();
    console.log('[FCM] requestPermission() result:', permission);
    
    if (permission !== 'granted') {
      console.log('[FCM] Permission not granted, aborting');
      return null;
    }

    console.log('[FCM] SW registration:', swRegistration?.scope, 'active:', swRegistration?.active?.state);

    // Get token with service worker registration
    const token = await getToken(msg, {
      vapidKey: 'BJgZNfraPzhyAX_lG6OEaKVQjphyqFt8rAZw6wH05EnDY94vxC7tJSI9NOcMYSWdH84Gd4aalYnv-8cOmCGJQsE',
      serviceWorkerRegistration: swRegistration
    });

    console.log('[FCM] Token obtained:', token ? token.substring(0, 20) + '...' : 'NULL');

    if (!token) {
      throw new Error('getToken returned empty token');
    }

    return token;
  } catch (error) {
    console.error('[FCM] Error getting FCM token:', error.message, error.code);
    return null;
  }
};