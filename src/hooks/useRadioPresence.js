import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

// How long a member stays listed on the channel after their app closed.
const STANDBY_MS = 12 * 60 * 60 * 1000;

/**
 * Live radio presence for every talk channel, refreshed on an interval so the
 * member list reflects who is really connected (including yourself). Members
 * whose app has been closed are kept in the list as standby on the channel they
 * were last on, so the team never loses sight of who is assigned to it.
 */
export default function useRadioPresence(intervalMs = 15000) {
  const [presence, setPresence] = useState([]);
  const [configured, setConfigured] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [response, standbyPage] = await Promise.all([
          base44.functions.invoke('radioPresence', {}),
          base44.entities.RadioStandby
            .filter({}, { sort: '-last_seen', limit: 100 })
            .catch(() => null),
        ]);
        const data = response?.data || {};
        if (cancelled) return;
        const live = Array.isArray(data.presence) ? data.presence : [];
        const liveEmails = new Set(
          live.map((entry) => String(entry.email || '').toLowerCase())
        );
        const cutoff = Date.now() - STANDBY_MS;
        const standby = [];
        const seen = new Set();
        (standbyPage?.items || []).forEach((record) => {
          const email = String(record?.user_email || '').toLowerCase();
          if (!email || !record?.channel_id || seen.has(email)) return;
          if (liveEmails.has(email)) return;
          if (new Date(record.last_seen).getTime() < cutoff) return;
          seen.add(email);
          standby.push({
            email,
            name: record.user_name || email,
            channel_id: record.channel_id,
            channel_name: record.channel_name || null,
            last_seen: record.last_seen,
            standby: true,
          });
        });
        setPresence([...live, ...standby]);
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