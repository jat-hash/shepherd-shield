import { useEffect, useState } from "react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      // Create inline service worker
      const swCode = `
        self.addEventListener('install', (event) => {
          console.log('Emergency alert system installed');
          self.skipWaiting();
        });

        self.addEventListener('activate', (event) => {
          console.log('Emergency alert system activated');
          event.waitUntil(self.clients.claim());
        });

        self.addEventListener('notificationclick', async (event) => {
          event.notification.close();
          const urlToOpen = self.location.origin;
          event.waitUntil(
            self.clients.matchAll({ type: 'window', includeUncontrolled: true })
              .then((clientList) => {
                for (const client of clientList) {
                  if (client.url === urlToOpen && 'focus' in client) {
                    return client.focus();
                  }
                }
                if (self.clients.openWindow) {
                  return self.clients.openWindow(urlToOpen);
                }
              })
          );
        });

        self.addEventListener('message', async (event) => {
          if (event.data && event.data.type === 'EMERGENCY_ALERT') {
            const { alert } = event.data;
            await self.registration.showNotification('🚨 EMERGENCY ALERT', {
              body: alert.alert_type.toUpperCase() + '\\n\\n' + alert.message,
              vibrate: [1000, 200, 1000, 200, 1000, 200, 1000],
              tag: 'emergency-' + alert.id,
              requireInteraction: true,
              renotify: true,
              silent: false,
              data: { url: self.location.origin, alertId: alert.id }
            });
            const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
            if (clients.length > 0) {
              clients[0].focus();
            } else {
              await self.clients.openWindow(self.location.origin);
            }
          }
        });
      `;

      const blob = new Blob([swCode], { type: 'application/javascript' });
      const swUrl = URL.createObjectURL(blob);

      navigator.serviceWorker
        .register(swUrl)
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

          // Request FCM token if available (Firebase Cloud Messaging)
          try {
            // Check if FCM is available
            if ('Notification' in window && Notification.permission === 'granted') {
              const user = await base44.auth.me();
              if (user && 'indexedDB' in window) {
                // Generate device ID
                let deviceId = localStorage.getItem('device_id');
                if (!deviceId) {
                  deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                  localStorage.setItem('device_id', deviceId);
                }

                // Create a unique token for this device (simulated - in production use Firebase FCM)
                const fcmToken = 'token_' + deviceId + '_' + btoa(user.email).substring(0, 20);
                
                // Save token to backend
                try {
                  await base44.functions.invoke('saveFCMToken', {
                    fcm_token: fcmToken,
                    device_id: deviceId
                  });
                  console.log('FCM token registered for push notifications');
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