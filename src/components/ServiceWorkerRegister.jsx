import { useEffect, useState } from "react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { getFCMToken } from "./firebase";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator && 'Notification' in window) {
      // Register Firebase messaging service worker inline
      const firebaseSwCode = `
        importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
        importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

        firebase.initializeApp({
          apiKey: "AIzaSyD7BE-xvRYRzxh1gaHpEqIBw7k49J4xAoo",
          authDomain: "shepherd-shield.firebaseapp.com",
          projectId: "shepherd-shield",
          storageBucket: "shepherd-shield.firebasestorage.app",
          messagingSenderId: "983431306545",
          appId: "1:983431306545:web:6d79ca922449a63187a410",
          measurementId: "G-NS92YPKPB3"
        });

        const messaging = firebase.messaging();

        messaging.onBackgroundMessage(function(payload) {
          console.log('Received background message:', payload);
          const notificationTitle = payload.notification?.title || 'Shepherd Shield';
          const notificationOptions = {
            body: payload.notification?.body || 'You have a new notification',
            icon: payload.notification?.icon || '/firebase-logo.png',
            badge: '/firebase-logo.png',
            data: payload.data
          };
          return self.registration.showNotification(notificationTitle, notificationOptions);
        });
      `;

      const blob = new Blob([firebaseSwCode], { type: 'application/javascript' });
      const swUrl = URL.createObjectURL(blob);

      navigator.serviceWorker
        .register(swUrl, { scope: '/' })
        .then(async (registration) => {
          console.log('Service Worker registered - app will run in background');

          // Request notification permission immediately
          if (Notification.permission === 'default') {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
              toast.success('✓ Background alerts enabled - you\'ll receive notifications even when app is closed');
            } else {
              toast.error('⚠️ Enable notifications to receive emergency alerts when app is closed');
            }
          } else if (Notification.permission === 'granted') {
            toast.success('✓ Background alerts active');
          }

          // Store user data for service worker
          try {
            const user = await base44.auth.me();
            if (user) {
              localStorage.setItem('user_email', user.email);
              localStorage.setItem('user_name', user.full_name || user.email);
            }
          } catch (error) {
            console.log('User not authenticated');
          }

          // Request FCM token from Firebase
          try {
            const user = await base44.auth.me();
            if (user) {
              const fcmToken = await getFCMToken();
              if (fcmToken) {
                // Generate device ID
                let deviceId = localStorage.getItem('device_id');
                if (!deviceId) {
                  deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                  localStorage.setItem('device_id', deviceId);
                }

                // Save real FCM token to backend
                try {
                  await base44.functions.invoke('saveFCMToken', {
                    fcm_token: fcmToken,
                    device_id: deviceId
                  });
                  console.log('Real FCM token registered - push notifications enabled');
                } catch (error) {
                  console.log('Could not register FCM token:', error.message);
                }
              }
            }
          } catch (error) {
            console.log('FCM registration skipped:', error.message);
          }

          // Keep service worker active with periodic updates
          setInterval(() => {
            registration.update();
          }, 60000);

          // Listen for emergency alerts even when app is backgrounded
          navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data.type === 'EMERGENCY_ALERT') {
              // Wake up the app if needed
              window.focus();
            }
          });
        })
        .catch((error) => {
          console.error('Service Worker registration failed:', error);
          toast.error('Background alerts unavailable - browser restrictions');
        });
    }
  }, []);

  return null;
}