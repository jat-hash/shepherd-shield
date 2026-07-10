import React, { useEffect, useRef } from "react";
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
    const hasPush = 'PushManager' in window;
    if (!hasSW) return { ok: false, reason: 'serviceWorker API missing (likely an iframe/preview sandbox)' };
    if (!hasPush) return { ok: false, reason: 'PushManager API missing' };
    // Note: window.Notification is NOT required — the service worker's own
    // showNotification() API handles display. We check permission via the
    // Permissions API as a fallback for browsers that lack window.Notification.
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
  const initializedRef = useRef(false);
  const runningRef = useRef(false);

  const addLog = (msg) => {
    console.log(`[FCM] ${msg}`);
  };

  // Visible feedback so the user can see exactly where registration fails
  // (previously every step was console-only — failures were invisible)
  const notify = (msg, type = 'info') => {
    addLog(msg);
    if (type === 'error') toast.error(msg, { duration: 8000 });
    else if (type === 'success') toast.success(msg, { duration: 4000 });
    else toast(msg, { duration: 5000 });
  };

  // Debug panel is hidden by default on mobile — no longer auto-showing

  useEffect(() => {
    if (!user) return;
    const initPushNotifications = async () => {
      try {
        if (initializedRef.current) { addLog('Already initialized — skipping'); return; }
        if (runningRef.current) { addLog('Registration already in progress — skipping'); return; }
        runningRef.current = true;
        if (!user) { addLog('No user logged in'); return; }
        addLog('UA: ' + navigator.userAgent.slice(0, 80));
        addLog('APIs → SW:' + ('serviceWorker' in navigator) + ' Notif:' + ('Notification' in window) + ' Push:' + ('PushManager' in window));
        if (isInAppBrowser()) {
          notify('❌ In-app browser detected — open in Chrome/Safari directly to enable push', 'error');
          return;
        }
        const support = isFCMSupported();
        if (!support.ok) {
          notify('❌ Push not supported: ' + support.reason, 'error');
          return;
        }

        if (!('serviceWorker' in navigator)) {
          notify('❌ Service Worker not supported in this browser', 'error');
          return;
        }

        if (!('Notification' in window)) { notify('❌ Notification API missing', 'error'); return; }

        // Check notification permission — use Permissions API as fallback when
        // window.Notification is undefined (some Android browsers/embedded webviews).
        let permission = 'default';
        if ('Notification' in window) {
          permission = window.Notification.permission;
        } else if ('permissions' in navigator) {
          try {
            const result = await navigator.permissions.query({ name: 'notifications' });
            permission = result.state; // 'granted', 'denied', or 'prompt'
          } catch (_) { addLog('Permissions API query failed'); }
        }
        addLog('Permission: ' + permission + (typeof Notification === 'undefined' ? ' (Notification API absent)' : ''));
        // Never auto-request permission here — that re-triggers the native prompt
        // on every refresh. The Dashboard banner's "Enable Notifications" button
        // (explicit gesture) grants permission then dispatches 'push:register'.
        if (permission !== 'granted') {
          notify('⚠️ Notification permission not granted — tap "Enable Now" on the Dashboard to allow', 'info');
          return;
        }

        // Register the Firebase messaging SW
        await navigator.serviceWorker.register('/firebase-messaging-sw.js');

        // Wait for SW to be fully active before getting token
        const swRegistration = await navigator.serviceWorker.ready;

        // Get FCM token using the active SW registration
        let token;
        try {
          const { getFCMToken } = await import('@/components/firebase');
          token = await getFCMToken(swRegistration);
        } catch (tokenErr) {
          notify('❌ Failed to get push token: ' + tokenErr.message, 'error');
          return;
        }
        if (!token) { notify('❌ No push token obtained from Firebase', 'error'); return; }

        // Save token to backend — check response status (invoke resolves even on 500)
        const saveRes = await base44.functions.invoke('saveFCMToken', {
          fcm_token: token,
          device_id: navigator.userAgent.slice(0, 50)
        });
        if (saveRes?.status >= 400 || saveRes?.data?.error) {
          notify('❌ Failed to save push token: ' + (saveRes?.data?.error || 'status ' + saveRes?.status), 'error');
          return;
        }
        initializedRef.current = true;
        // Only show the "enabled!" toast the first time — on subsequent app
        // opens the cached token is re-saved silently. Without this guard the
        // success toast pops on every launch, which looks like the banner is
        // nagging the user even though push is already working.
        const alreadyEnabled = localStorage.getItem('pushRegistered') === 'true';
        if (!alreadyEnabled) {
          notify('✅ Push notifications enabled!', 'success');
        }
        // Store user identity in the service worker's IndexedDB so quick-reply
        // works when the app is fully closed (SW sends the reply directly using
        // the FCM token as the device credential — no shared secret needed).
        try {
          const swReg = await navigator.serviceWorker.ready;
          const { appParams } = await import('@/lib/app-params');
          swReg.active?.postMessage({
            type: 'store-identity',
            user_email: user.email,
            user_name: user.display_name || user.full_name || user.email,
            fcm_token: token,
            app_id: appParams.appId,
          });
        } catch (_) {}
        // Notify the Dashboard to re-check pushRegistered status. We use a
        // separate 'push:registered' event (NOT 'push:register') because this
        // component's own handlePushRegister listener listens for 'push:register'
        // — dispatching that here would reset the refs and re-run registration,
        // creating an infinite loop of success toasts.
        window.dispatchEvent(new CustomEvent('push:registered'));

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
        notify('❌ Push setup error: ' + (error.code ? error.code + ' - ' : '') + error.message, 'error');
      } finally {
        runningRef.current = false;
      }
    };

    initPushNotifications();

    // Background pushes: the service worker forwards a message to open tabs so
    // we play the loud alarm audio + vibrate even while the page is backgrounded.
    const handleSWMessage = async (event) => {
      if (event.data?.type === 'shepherd-force-refresh') {
        window.location.reload();
        return;
      }
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
      // Action button (acknowledge/request help/mark safe/need help) forwarded
      // from the SW when an app tab was open at tap time.
      if (event.data?.type === 'shepherd-notification-action' && user) {
        try {
          await base44.functions.invoke('handleNotificationAction', {
            action: event.data.action,
            incident_id: event.data.incident_id || '',
            alert_id: event.data.alert_id || '',
          });
          toast.success('Action sent', { duration: 2000 });
        } catch (err) {
          toast.error('Action failed', { duration: 3000 });
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
      if (document.visibilityState === 'visible' && !initializedRef.current && !runningRef.current) {
        addLog('Page visible, retrying registration...');
        initPushNotifications();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Re-run when the dashboard "Enable"/"Retry" button dispatches push:register.
    // Reset the initialized flag so Retry actually re-attempts even if a previous
    // account's registration set it (stale ref after account switch).
    const handlePushRegister = () => {
      initializedRef.current = false;
      runningRef.current = false;
      notify('Registering for push notifications...', 'info');
      initPushNotifications();
    };
    window.addEventListener('push:register', handlePushRegister);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('push:register', handlePushRegister);
      navigator.serviceWorker.removeEventListener('message', handleSWMessage);
      // Reset refs on user change so a new user re-registers their device token
      initializedRef.current = false;
      runningRef.current = false;
    };
  }, [user]);

  return null;
}