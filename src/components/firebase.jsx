import { initializeApp } from 'firebase/app';

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