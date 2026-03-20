import { useState, useEffect, useCallback } from "react";
import { cacheData, getCachedData } from "@/components/notifications/offlineStorage";

/**
 * Hook that fetches data online and falls back to IndexedDB cache when offline.
 * @param {string} storeName - IndexedDB store name (e.g. 'assignments')
 * @param {Function} fetchFn - async function that fetches fresh data
 * @param {Array} deps - dependency array to re-fetch
 */
export default function useOfflineData(storeName, fetchFn, deps = []) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  const load = useCallback(async () => {
    setLoading(true);
    if (navigator.onLine) {
      try {
        const result = await fetchFn();
        setData(result);
        setIsOffline(false);
        // Cache fresh data
        await cacheData(storeName, result).catch(() => {});
      } catch {
        // Fallback to cache on error
        const cached = await getCachedData(storeName);
        setData(cached || []);
        setIsOffline(true);
      }
    } else {
      const cached = await getCachedData(storeName);
      setData(cached || []);
      setIsOffline(true);
    }
    setLoading(false);
  }, [storeName, fetchFn]);

  useEffect(() => {
    load();
  }, deps);

  useEffect(() => {
    const handleOnline = () => { setIsOffline(false); load(); };
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [load]);

  return { data, loading, isOffline, reload: load };
}