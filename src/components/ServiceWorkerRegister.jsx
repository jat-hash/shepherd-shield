import React, { useEffect } from "react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { initFirebase, getFCMToken } from "@/components/firebase";
import { getMessaging, onMessage } from "firebase/messaging";

// Play an alarm beep sound for foreground alerts
function playAlarmSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const playBeep = (startTime, freq = 880) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'square';
      gain.gain.setValueAtTime(0.3, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.4);
      osc.start(startTime);
      osc.stop(startTime + 0.4);
    };
    playBeep(ctx.currentTime);
    playBeep(ctx.currentTime + 0.5);
    playBeep(ctx.currentTime + 1.0);
  } catch (e) {
    console.log('Audio context not available');
  }
}

export default function ServiceWorkerRegister() {
  useEffect(() => {
    // Clear old non-firebase service workers, register firebase messaging SW
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((reg) => {
          // Only unregister old non-firebase SWs
          if (!reg.scope.includes('firebase-messaging') && !reg.active?.scriptURL?.includes('firebase-messaging-sw')) {
            reg.unregister();
          }
        });
      });

      // Register the Firebase messaging service worker
      navigator.serviceWorker.register('/firebase-messaging-sw.js').catch((err) => {
        console.error('SW registration failed:', err);
      });
    }
  }, []);

  useEffect(() => {
    const initPushNotifications = async () => {
      try {
        const user = await base44.auth.me();
        if (!user) return;

        // Get FCM token (also requests notification permission)
        const token = await getFCMToken();
        if (!token) return;

        // Save token to backend
        await base44.functions.invoke('saveFCMToken', {
          fcm_token: token,
          device_id: navigator.userAgent.slice(0, 50)
        });

        console.log('FCM token saved for', user.email);

        // Listen for foreground messages and play alarm
        const { app } = initFirebase();
        const messaging = getMessaging(app);
        onMessage(messaging, (payload) => {
          console.log('Foreground message:', payload);
          const title = payload.notification?.title || 'Shepherd Shield Alert';
          const body = payload.notification?.body || 'New notification';

          // Play alarm sound
          playAlarmSound();

          // Show toast notification
          toast.error(`🚨 ${title}: ${body}`, {
            duration: 10000,
            position: 'top-center',
          });

          // Also show native browser notification if possible
          if (Notification.permission === 'granted') {
            new Notification(title, {
              body,
              icon: '/icon-192.png',
              requireInteraction: true,
              vibrate: [300, 100, 300, 100, 300]
            });
          }
        });
      } catch (error) {
        console.log('Push notification init error:', error.message);
      }
    };

    initPushNotifications();
  }, []);

  return null;
}