import React, { useEffect } from "react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";

// This component handles service worker and OneSignal registration

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  useEffect(() => {
    // Initialize OneSignal for push notifications
    const initOneSignal = async () => {
      if (typeof window !== 'undefined' && 'OneSignal' in window) {
        try {
          const user = await base44.auth.me();
          if (!user) return;

          // Set external ID for user tracking
          window.OneSignal.setExternalUserId(user.email);

          // Request notification permission
          const permission = await window.OneSignal.Notifications.requestPermission();
          
          if (permission) {
            toast.success('✓ Notifications enabled - you\'ll receive emergency alerts');
          }

          console.log('OneSignal initialized for push notifications');
        } catch (error) {
          console.log('OneSignal initialization skipped:', error.message);
        }
      }
    };

    // Load OneSignal SDK
    const script = document.createElement('script');
    script.src = 'https://cdn.onesignal.com/sdks/web/push/OneSignalSDK.js';
    script.async = true;
    script.onload = () => {
      window.OneSignal = window.OneSignal || [];
      window.OneSignal.push(function () {
        window.OneSignal.init({
          appId: "5f95f58a-5fce-4ca0-bfc0-8ae3bc0ae0da"
        });
      });
      initOneSignal();
    };
    document.head.appendChild(script);

    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, []);

  return null;
}