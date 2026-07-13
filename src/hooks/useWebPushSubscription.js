import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";

const isFCMSupported = () => {
  try {
    const ua = navigator.userAgent;
    // iOS is excluded from FCM — only there do we register the native Web Push SW.
    if (/iphone|ipad|ipod/i.test(ua)) return false;
    return "serviceWorker" in navigator && "Notification" in window && "PushManager" in window;
  } catch (_) { return false; }
};

const isWebPushSupported = () => {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
};

function urlBase64ToUint8Array(base64Url) {
  const base64 = String(base64Url).replace(/-/g, "+").replace(/_/g, "/");
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const bin = atob(base64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function arrayBufferToBase64Url(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Bumped whenever the VAPID key the server signs with changes. When the stored
// version doesn't match, the hook unsubscribes the existing browser subscription
// (created with a stale/wrong key) and creates a fresh one with the current key.
const VAPID_KEY_VERSION = "2";

/**
 * Subscribes the browser to native Web Push (VAPID) and persists the
 * subscription so the backend can deliver true closed-app push via the Web Push
 * API. Only runs on browsers NOT covered by FCM (e.g. iOS Safari installed
 * PWA). On Chrome/Android/desktop, FCM owns the single push subscription per
 * service worker, so we skip here to avoid replacing the FCM subscription.
 */
export function useWebPushSubscription(user) {
  const subbedRef = useRef(false);

  useEffect(() => {
    if (!user?.email) return;
    if (isFCMSupported()) return;
    if (!isWebPushSupported()) return;

    let cancelled = false;

    const subscribe = async () => {
      try {
        if (window.Notification?.permission !== "granted") {
          toast.info('Tap "Enable Now" first to allow notifications.', { duration: 5000 });
          return;
        }
        await navigator.serviceWorker.register("/web-push-sw.js");
        const reg = await navigator.serviceWorker.ready;

        // Fetch the NATIVE VAPID public key (not Firebase's web push cert).
        // Subscribing with the wrong key makes sendWebPush fail with 400
        // BadWebPushRequest because the server signs with VAPID_PRIVATE_KEY.
        const res = await base44.functions.invoke("getVapidPublicKey", { usage: "native" });
        const publicKey = res?.data?.public_key;
        if (!publicKey) {
          toast.error('Could not fetch push key. Try again or contact support.', { duration: 6000 });
          return;
        }

        // Migration: if the VAPID key version changed, the existing browser
        // subscription was created with a different key and pushes to it will
        // fail. Unsubscribe it so a fresh one is created below with the current key.
        const storedVersion = localStorage.getItem("webpush_vapid_version");
        let sub = await reg.pushManager.getSubscription();
        if (storedVersion !== VAPID_KEY_VERSION && sub) {
          try { await sub.unsubscribe(); } catch (_) {}
          sub = null;
        }

        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey),
          });
        }
        if (cancelled || !sub) return;

        const endpoint = sub.endpoint;
        // Dedupe against existing stored subscriptions for this endpoint
        const existing = await base44.entities.PushSubscription.filter({ endpoint });
        if (existing.length === 0) {
          await base44.entities.PushSubscription.create({
            user_email: user.email,
            endpoint,
            p256dh: arrayBufferToBase64Url(sub.getKey("p256dh")),
            auth: arrayBufferToBase64Url(sub.getKey("auth")),
            device_id: navigator.userAgent.slice(0, 80),
          });
        }
        localStorage.setItem("webpush_vapid_version", VAPID_KEY_VERSION);
        subbedRef.current = true;
        // Notify the Dashboard that registration completed so the "incomplete"
        // banner disappears immediately (mirrors the FCM flow in ServiceWorkerRegister).
        window.dispatchEvent(new CustomEvent("push:registered"));
        const alreadyEnabled = localStorage.getItem('pushRegistered') === 'true';
        if (!alreadyEnabled) {
          toast.success('✅ Push notifications enabled!', { duration: 4000 });
        }
      } catch (err) {
        console.warn("Web Push subscription failed:", err.message);
        toast.error('Push setup failed: ' + err.message, { duration: 8000 });
      }
    };

    subscribe();

    const onVisible = () => {
      if (document.visibilityState === "visible" && !subbedRef.current) subscribe();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("push:register", subscribe);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("push:register", subscribe);
    };
  }, [user?.email]);
}