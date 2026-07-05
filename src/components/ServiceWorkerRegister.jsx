import React, { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { triggerNotificationEffect } from "@/lib/notificationEffects";

// FCM is only supported on non-iOS browsers with service worker + push support
const isFCMSupported = () => {
  try {
    const ua = navigator.userAgent;
    const isIOS = /iphone|ipad|ipod/i.test(ua);
    // Block only iOS Safari — desktop Safari on macOS supports FCM
    if (isIOS) return { ok: false, reason: 'iOS device — uses Web Push instead' };
    const hasSW = 'serviceWorker' in navigator;
    const hasNotif = 'Notification' in window;
    const hasPush = 'PushManager' in window;
    if (!hasSW) return { ok: false, reason: 'serviceWorker API missing (likely an iframe/preview sandbox)' };
    if (!hasNotif) return { ok: false, reason: 'Notification API missing' };
    if (!hasPush) return { ok: false, reason: 'PushManager API missing' };
    return { ok: true };
  } catch (e) { return { ok: false, reason: 'check threw: ' + e.message }; }
};

// Detect in-app browsers (Facebook, Instagram, TikTok, email clients) which
// disable the service worker API — push notifications can't work there.
const isInAppBrowser = () => {
  const ua = (navigator.userAgent || '').toLowerCase();
  const patterns = ['fbav', 'fban', 'instagram', 'tiktok', 'snapchat', 'linkedin', 'twitter', 'whatsapp', 'gmail', 'outlook', 'yahoo', 'samsungbrowser'];
  if (patterns.some(p => ua.includes(p))) return true;
  // iOS in-app browsers all lack serviceWorker support
  if (/iphone|ipad|ipod/i.test(ua) && !(/safari/i.test(ua) && !/crios|fxios/i.test(ua))) return true;
  return false;
};

export default function ServiceWorkerRegister() {
  const { user } = useAuth();
  const [debugLogs, setDebugLogs] = useState([]);
  const [showDebug, setShowDebug] = useState(true);
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
        addLog('UA: ' + navigator.userAgent.slice(0, 80));
        addLog('APIs → SW:' + ('serviceWorker' in navigator) + ' Notif:' + ('Notification' in window) + ' Push:' + ('PushManager' in window));
        if (isInAppBrowser()) {
          addLog('❌ In-app browser detected — push notifications cannot work here.');
          addLog('👉 Open this app in Chrome (Android) or Safari (iPhone) directly:');
          addLog('   Tap the ••• menu → "Open in Chrome" / "Open in Browser"');
          return;
        }
        const support = isFCMSupported();
        if (!support.ok) { addLog('❌ FCM not supported: ' + support.reason); return; }
        addLog('User: ' + user.email);

        if (!('serviceWorker' in navigator)) { addLog('SW not supported'); return; }
        addLog('SW supported');

        if (!('Notification' in window)) { addLog('Notifications not supported on this browser'); return; }

        addLog('Permission: ' + window.Notification.permission);
        // Never auto-request permission here — that re-triggers the native prompt
        // on every refresh. The Dashboard banner's "Enable Notifications" button
        // (explicit gesture) grants permission then dispatches 'push:register'.
        if (window.Notification.permission !== 'granted') {
          addLog('⚠️ Notifications not granted yet — granting via the Dashboard banner will auto-trigger registration');
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
            const d = payload.data || {};
            const title = d.title || payload.notification?.title || 'Shepherd Shield Alert';
            const body = d.body || payload.notification?.body || 'New notification';
            const nType = d.notification_type || '';
            addLog('Foreground msg: ' + title);
            // Comms (DM/group) aren't alarmed by the in-app alert system, so play
            // the audible+vibration effect here. Non-comms types are already
            // alarmed via the Notification entity subscription.
            if (nType === 'dm' || nType === 'group_message' || nType === 'general' || nType === '') {
              triggerNotificationEffect(nType === 'dm' ? 'dm' : 'general');
            }
            toast.error(`🚨 ${title}: ${body}`, { duration: 10000, position: 'top-center' });
            // The service worker already shows a system notification for each push
            // (for when this tab is backgrounded / the user is in another app), so we
            // don't show one from the page — that would duplicate the push notification.
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

    // Background pushes: the service worker forwards a message to open tabs so
    // we play the loud alarm audio + vibrate even while the page is backgrounded.
    const handleSWMessage = async (event) => {
      if (event.data?.type === 'shepherd-push') {
        const typeMap = { emergency: 'emergency', incident: 'alert', dm: 'dm', group_message: 'general', assignment: 'assignment' };
        triggerNotificationEffect(typeMap[event.data.notification_type] || 'general');
        // Foreground DM/group push: switch the open Communications tab to that DM
        const channel = event.data?.dm_channel;
        if (channel && (event.data.notification_type === 'dm' || event.data.notification_type === 'group_message')) {
          window.dispatchEvent(new CustomEvent('shepherd:openDM', { detail: { channel } }));
        }
      }
      // Deep-link from a tapped background notification: switch into that DM
      if (event.data?.type === 'shepherd-deeplink') {
        const channel = event.data?.dm_channel;
        if (channel) {
          window.dispatchEvent(new CustomEvent('shepherd:openDM', { detail: { channel } }));
        }
      }
      // Quick-reply forwarded from the SW when no app tab was open at tap time.
      if (event.data?.type === 'shepherd-quick-reply' && user) {
        try {
          await base44.functions.invoke('sendQuickReply', {
            channel: event.data.channel,
            content: event.data.content,
            sender_email: user.email,
            sender_name: user.display_name || user.full_name,
            reply_secret: 'SW_FORWARDED'
          });
          toast.success('Reply sent', { duration: 2000 });
        } catch (err) {
          toast.error('Reply failed to send', { duration: 3000 });
        }
      }
    };
    navigator.serviceWorker.addEventListener('message', handleSWMessage);

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
      navigator.serviceWorker.removeEventListener('message', handleSWMessage);
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