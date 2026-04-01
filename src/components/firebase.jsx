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

  console.log('[FCM] Permission:', Notification.permission);
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Permission not granted: ' + permission);
  }

  console.log('[FCM] SW scope:', swRegistration?.scope, 'state:', swRegistration?.active?.state);

  const token = await getToken(msg, {
    vapidKey: 'BJgZNfraPzhyAX_lG6OEaKVQjphyqFt8rAZw6wH05EnDY94vxC7tJSI9NOcMYSWdH84Gd4aalYnv-8cOmCGJQsE',
    serviceWorkerRegistration: swRegistration
  });

  if (!token) {
    throw new Error('getToken returned empty/null');
  }

  return token;
};