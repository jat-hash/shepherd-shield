import { useEffect } from "react";
import { toast } from "sonner";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    // Request notification permission for background notifications
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then((permission) => {
        if (permission === 'granted') {
          toast.success('Background notifications enabled');
        }
      });
    }

    // Service Worker registration disabled - requires manual setup
    // To enable: Add service-worker.js and manifest.json to public folder
  }, []);

  return null;
}