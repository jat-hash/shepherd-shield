import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

/**
 * Live radio presence for every talk channel, refreshed on an interval so the
 * member list reflects who is really connected (including yourself).
 */
export default function useRadioPresence(intervalMs = 15000) {
  const [presence, setPresence] = useState([]);
  const [configured, setConfigured] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await base44.functions.invoke('radioPresence', {});
        const data = response?.data || {};
        if (cancelled) return;
        setPresence(Array.isArray(data.presence) ? data.presence : []);
        setConfigured(data.configured !== false);
      } catch (_) {
        if (!cancelled) setConfigured(false);
      }
    };

    load();
    const id = setInterval(load, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [intervalMs]);

  return { presence, configured };
}