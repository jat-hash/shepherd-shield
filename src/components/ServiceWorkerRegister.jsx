import React, { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

// FCM is only supported on non-iOS browsers with service worker + push support
const isFCMSupported = () => {
  try {
    const ua = navigator.userAgent;
    const isIOS = /iphone|ipad|ipod/i.test(ua);
    // Block only iOS Safari — desktop Safari on macOS supports FCM
    if (isIOS) return false;
    return 'serviceWorker' in navigator && 'Notification' in window && 'PushManager' in window;
  } catch (_) { return false; }
};

export default function ServiceWorkerRegister() {
  const { user } = useAuth();
  const [debugLogs, setDebugLogs] = useState([]);
  const [showDebug, setShowDebug] = useState(false);
  const initializedRef = useRef(false);

  const addLog = (msg) => {
    const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
    console.log(line);
    setDebugLogs(prev => [...prev.slice(-30), line]);
  };

  // Debug panel is hidden by default on mobile — no longer auto-showing

  useEffect(() => {
    if (!user) return;
    const initPushNotifications = async () => {
      try {
        if (!user) { addLog('No user logged in'); return; }
        if (!isFCMSupported()) { addLog('FCM not supported on this browser (iOS/Safari) — skipping'); return; }
        addLog('User: ' + user.email);

        if (!('serviceWorker' in navigator)) { addLog('SW not supported'); return; }
        addLog('SW supported');

        if (!('Notification' in window)) { addLog('Notifications not supported on this browser'); return; }

        addLog('Permission: ' + window.Notification.permission);
        if (window.Notification.permission === 'denied') {
          addLog('⚠️ Notifications blocked in browser settings - alerts may not work');
          // Continue anyway - don't block the app
        } else if (window.Notification.permission !== 'granted') {
          addLog('Requesting permission...');
          try {
            const result = await window.Notification.requestPermission();
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
        if (window.Notification.permission === 'denied') {
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
        let token;
        try {
          const { getFCMToken } = await import('@/components/firebase');
          token = await getFCMToken(swRegistration);
        } catch (tokenErr) {
          addLog('ERROR getting token: ' + tokenErr.message);
          return;
        }
        if (!token) { addLog('ERROR: No FCM token obtained'); return; }
        addLog('Token: ' + token.substring(0, 20) + '...');

        // Save token to backend
        await base44.functions.invoke('saveFCMToken', {
          fcm_token: token,
          device_id: navigator.userAgent.slice(0, 50)
        });
        initializedRef.current = true;
        addLog('Token saved! ✅');

        // Register periodic background sync (poll every 5 min when app is closed)
        if ('periodicSync' in swRegistration) {
          try {
            const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
            if (status.state === 'granted') {
              await swRegistration.periodicSync.register('shepherd-poll', { minInterval: 5 * 60 * 1000 });
              addLog('Periodic background sync registered ✅');
            } else {
              addLog('Periodic sync permission: ' + status.state);
            }
          } catch (e) {
            addLog('Periodic sync not supported: ' + e.message);
          }
        }

        // Listen for foreground messages and play alarm
        try {
          const { initFirebase } = await import('@/components/firebase');
          const { getMessaging, onMessage } = await import('firebase/messaging');
          const { app } = initFirebase();
          const messaging = getMessaging(app);
          onMessage(messaging, (payload) => {
            addLog('Foreground msg: ' + (payload.notification?.title || 'no title'));
            const title = payload.notification?.title || 'Shepherd Shield Alert';
            const body = payload.notification?.body || 'New notification';
            if (navigator.vibrate) navigator.vibrate([300, 100, 300, 100, 300]);
            toast.error(`🚨 ${title}: ${body}`, { duration: 10000, position: 'top-center' });
            if ('Notification' in window && window.Notification.permission === 'granted') {
              try { new window.Notification(title, { body, icon: '/icon-192.png', requireInteraction: true }); } catch (_) {}
            }
          });
        } catch (msgErr) {
          addLog('Messaging listener error: ' + msgErr.message);
        }
      } catch (error) {
        addLog('ERROR: ' + (error.code ? error.code + ' - ' : '') + error.message);
        addLog('STACK: ' + (error.stack || '').split('\n')[1]);
      }
    };

    initPushNotifications();

    // Re-run when user returns to the app only if not already initialized
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && 'Notification' in window && window.Notification.permission === 'granted' && !initializedRef.current) {
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
            if ('Notification' in window && window.Notification.permission === 'granted') {
              navigator.serviceWorker.register('/firebase-messaging-sw.js').then(async () => {
                const swReg = await navigator.serviceWorker.ready;
                const { getFCMToken } = await import('@/components/firebase');
                const token = await getFCMToken(swReg);
                if (token) {
                  await base44.functions.invoke('saveFCMToken', { fcm_token: token, device_id: navigator.userAgent.slice(0, 50) });
                  addLog('Token saved! ✅');
                } else { addLog('No token returned'); }
              }).catch(e => addLog('Retry error: ' + e.message));
            } else {
              addLog('Permission still: ' + ('Notification' in window ? window.Notification.permission : 'unsupported'));
            }
          }} style={{ color: '#0ff', background: 'none', border: '1px solid #0ff', borderRadius: 3, padding: '0 6px', cursor: 'pointer', fontSize: 11 }}>Retry</button>
          <button onClick={() => setShowDebug(false)} style={{ color: '#f00', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>✕</button>
        </div>
      </div>
      {debugLogs.length === 0 ? <div>Waiting for logs...</div> : debugLogs.map((l, i) => <div key={i}>{l}</div>)}
    </div>
  );
}