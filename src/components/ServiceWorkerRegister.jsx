import { useEffect, useState } from "react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { getFCMToken } from "./firebase";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register(swUrl)
        .catch(() => {
          console.log('Blob service worker registration failed, trying fallback');
          // Fallback: create service worker with minimal code for environments that don't support blob URLs
          const fallbackCode = `
            self.addEventListener('install', () => self.skipWaiting());
            self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
            self.addEventListener('push', (e) => {
              if (e.data) {
                const payload = e.data.json();
                e.waitUntil(self.registration.showNotification(payload.notification?.title || 'Alert', {
                  body: payload.notification?.body || 'New notification',
                  icon: '/icon-192x192.png'
                }));
              }
            });
          `;
          const fallbackBlob = new Blob([fallbackCode], { type: 'application/javascript' });
          const fallbackUrl = URL.createObjectURL(fallbackBlob);
          return navigator.serviceWorker.register(fallbackUrl);
        })
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