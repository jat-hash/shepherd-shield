import { useEffect } from 'react';

/**
 * Makes sure the device keeps a copy of the app so it still opens with no
 * internet. Push workers (firebase-messaging-sw.js / web-push-sw.js) already
 * cache the shell themselves, so this only registers the plain worker on
 * devices that have no worker yet — registering over a push worker would
 * replace it and stop notifications.
 */
export default function OfflineShell() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    let cancelled = false;

    const register = async () => {
      try {
        if (window.self !== window.top) return; // builder preview iframe
        const existing = await navigator.serviceWorker.getRegistrations();
        if (cancelled || existing.length > 0) return;
        await navigator.serviceWorker.register('/sw.js');
      } catch (_) {
        /* offline copy is best effort */
      }
    };

    register();
    return () => { cancelled = true; };
  }, []);

  return null;
}