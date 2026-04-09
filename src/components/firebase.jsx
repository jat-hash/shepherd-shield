import { initializeApp } from 'firebase/app';

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

export const initFirebase = () => {
  if (!app) {
    app = initializeApp(firebaseConfig);
  }
  return { app };
};

export const getFCMToken = async (swRegistration) => {
  const notifPermission = ('Notification' in window) ? window.Notification.permission : 'denied';
  if (notifPermission !== 'granted') {
    throw new Error('Notification permission not granted: ' + notifPermission);
  }

  const { getMessaging, getToken } = await import('firebase/messaging');
  const { app: firebaseApp } = initFirebase();
  const messaging = getMessaging(firebaseApp);

  const token = await getToken(messaging, {
    vapidKey: 'BDXxLp5-kEn--p9rd4nRgyapdT_sTe7IhthMn5Sm4AUxzAcYB_Ka_KxVVTLnxta6OLq08YR-C3ujPJoXFiEYLS8',
    serviceWorkerRegistration: swRegistration
  });

  if (!token) throw new Error('getToken returned empty/null');
  return token;
};