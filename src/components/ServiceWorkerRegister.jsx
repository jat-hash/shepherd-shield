import React, { useEffect, useState } from "react";
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
  const [debugLogs, setDebugLogs] = useState([]);
  const [showDebug, setShowDebug] = useState(false);

  const addLog = (msg) => {
    const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
    console.log(line);
    setDebugLogs(prev => [...prev.slice(-30), line]);
  };

  // Debug panel is hidden by default on mobile — no longer auto-showing

  useEffect(() => {
    const initPushNotifications = async () => {
      try {
        const user = await base44.auth.me();
        if (!user) { addLog('No user logged in'); return; }
        addLog('User: ' + user.email);

        if (!('serviceWorker' in navigator)) { addLog('SW not supported'); return; }
        addLog('SW supported');

        addLog('Permission: ' + Notification.permission);
        if (Notification.permission === 'denied') {
          addLog('⚠️ Notifications blocked in browser settings - alerts may not work');
          // Continue anyway - don't block the app
        } else if (Notification.permission !== 'granted') {
          addLog('Requesting permission...');
          try {
            const result = await Notification.requestPermission();
            addLog('Permission result: ' + result);
            if (result !== 'granted') {
              addLog('⚠️ User denied notifications - alerts may not work');
              // Continue anyway - don't block the app
            }
          } catch (e) {
            addLog('⚠️ Permission request failed: ' + e.message);
            // Continue anyway
          }
        }

        // If permission is denied, skip SW registration but let user use the app
        if (Notification.permission === 'denied') {
          addLog('Cannot register SW - notifications permanently denied');
          return;
        }

        // Register the Firebase messaging SW
        await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        addLog('Firebase SW registered');

        // Wait for SW to be fully active before getting token
        const swRegistration = await navigator.serviceWorker.ready;
        addLog('SW ready, scope: ' + swRegistration.scope);

        // Get FCM token using the active SW registration
        const token = await getFCMToken(swRegistration);
        if (!token) {
          addLog('ERROR: No FCM token obtained');
          return;
        }
        addLog('Token: ' + token.substring(0, 20) + '...');

        // Save token to backend
        await base44.functions.invoke('saveFCMToken', {
          fcm_token: token,
          device_id: navigator.userAgent.slice(0, 50)
        });
        addLog('Token saved! ✅');

        // Listen for foreground messages and play alarm
        const { app } = initFirebase();
        const messaging = getMessaging(app);
        onMessage(messaging, (payload) => {
          addLog('Foreground msg: ' + (payload.notification?.title || 'no title'));
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
        addLog('ERROR: ' + (error.code ? error.code + ' - ' : '') + error.message);
        addLog('STACK: ' + (error.stack || '').split('\n')[1]);
      }
    };

    initPushNotifications();

    // Re-run when user returns to the app (e.g. after enabling permissions in settings)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && Notification.permission === 'granted') {
        addLog('Page visible, retrying registration...');
        initPushNotifications();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Re-run when the dashboard "Enable" button grants permission
    const handlePushRegister = () => {
      addLog('push:register event received, registering...');
      initPushNotifications();
    };
    window.addEventListener('push:register', handlePushRegister);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('push:register', handlePushRegister);
    };
  }, []);

  if (!showDebug) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: 'rgba(0,0,0,0.85)', color: '#0f0', fontFamily: 'monospace',
      fontSize: '11px', maxHeight: '40vh', overflowY: 'auto',
      zIndex: 99999, padding: '8px', borderTop: '2px solid #0f0'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <strong style={{ color: '#ff0' }}>FCM Debug Log</strong>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => {
            addLog('Manual retry...');
            if (Notification.permission === 'granted') {
              navigator.serviceWorker.register('/firebase-messaging-sw.js').then(async () => {
                const swReg = await navigator.serviceWorker.ready;
                const token = await getFCMToken(swReg);
                if (token) {
                  await base44.functions.invoke('saveFCMToken', { fcm_token: token, device_id: navigator.userAgent.slice(0, 50) });
                  addLog('Token saved! ✅');
                } else { addLog('No token returned'); }
              }).catch(e => addLog('Retry error: ' + e.message));
            } else {
              addLog('Permission still: ' + Notification.permission);
            }
          }} style={{ color: '#0ff', background: 'none', border: '1px solid #0ff', borderRadius: 3, padding: '0 6px', cursor: 'pointer', fontSize: 11 }}>Retry</button>
          <button onClick={() => setShowDebug(false)} style={{ color: '#f00', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>✕</button>
        </div>
      </div>
      {debugLogs.length === 0 ? <div>Waiting for logs...</div> : debugLogs.map((l, i) => <div key={i}>{l}</div>)}
    </div>
  );
}