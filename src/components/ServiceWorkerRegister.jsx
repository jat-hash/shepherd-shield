import React, { useEffect } from "react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { initFirebase, getFCMToken } from "@/components/firebase";
import { getMessaging, onMessage } from "firebase/messaging";

// Play an alarm beep sound for foreground alerts
async function playAlarmSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    // Resume context - required after user gesture policy
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    const playBeep = (startTime, freq = 880) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'square';
      gain.gain.setValueAtTime(0.5, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.5);
      osc.start(startTime);
      osc.stop(startTime + 0.5);
    };
    playBeep(ctx.currentTime);
    playBeep(ctx.currentTime + 0.6);
    playBeep(ctx.currentTime + 1.2);
  } catch (e) {
    console.log('Audio context error:', e);
  }
}

export default function ServiceWorkerRegister() {
  useEffect(() => {
    const initPushNotifications = async () => {
      try {
        const user = await base44.auth.me();
        if (!user) return;

        if (!('serviceWorker' in navigator)) return;

        // Unregister any old non-firebase SWs
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          if (!reg.active?.scriptURL?.includes('firebase-messaging-sw')) {
            await reg.unregister();
          }
        }

        // Register (or reuse) the Firebase messaging SW
        const swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        console.log('Firebase SW registered:', swRegistration.scope);

        // Get FCM token using the specific SW registration
        const token = await getFCMToken(swRegistration);
        if (!token) {
          console.log('No FCM token obtained');
          return;
        }

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

          playAlarmSound();

          toast.error(`🚨 ${title}: ${body}`, {
            duration: 10000,
            position: 'top-center',
          });

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