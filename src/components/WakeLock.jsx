import { useEffect } from "react";

export default function WakeLock() {
  useEffect(() => {
    let wakeLock = null;

    const requestWakeLock = async () => {
      if (!("wakeLock" in navigator)) return;
      try {
        wakeLock = await navigator.wakeLock.request("screen");
      } catch (e) {
        // silently ignore (e.g. low battery policy)
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") requestWakeLock();
    };

    requestWakeLock();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (wakeLock) wakeLock.release().catch(() => {});
    };
  }, []);

  return null;
}