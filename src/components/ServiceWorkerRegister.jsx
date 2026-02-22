import { useEffect } from "react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/service-worker.js')
        .then(async (registration) => {
          console.log('Service Worker registered');

          // Request notification permission
          if (Notification.permission === 'default') {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
              toast.success('Background notifications enabled');
            }
          }

          // Subscribe to push notifications
          if (Notification.permission === 'granted') {
            try {
              const user = await base44.auth.me();
              if (user) {
                // Store user email in localStorage for service worker access
                localStorage.setItem('user_email', user.email);
              }
            } catch (error) {
              console.log('User not authenticated');
            }
          }

          // Check for updates
          setInterval(() => {
            registration.update();
          }, 60000);
        })
        .catch((error) => {
          console.log('Service Worker not available - add service-worker.js to public folder');
        });
    }
  }, []);

  return null;
}