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
    
    // Request permission first
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('Notification permission denied');
      return null;
    }

    const registration = swRegistration;

    // Get token with service worker registration
    const token = await getToken(msg, {
      vapidKey: 'BJgZNfraPzhyAX_lG6OEaKVQjphyqFt8rAZw6wH05EnDY94vxC7tJSI9NOcMYSWdH84Gd4aalYnv-8cOmCGJQsE',
      serviceWorkerRegistration: registration
    });

    if (!token) {
      throw new Error('Failed to get FCM token');
    }

    return token;
  } catch (error) {
    console.error('Error getting FCM token:', error);
    return null;
  }
};