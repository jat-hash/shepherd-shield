import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

// How long a member stays listed on the channel after their app closed.
const STANDBY_MS = 12 * 60 * 60 * 1000;

const todayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
};

/**
 * Live radio presence for every talk channel, refreshed on an interval so the
 * member list reflects who is really connected (including yourself). A member
 * whose app has been closed is only kept on the channel while they are still
 * checked in on site: anyone who has checked out is off the channel.
 */
export default function useRadioPresence(intervalMs = 15000) {
  const [presence, setPresence] = useState([]);
  const [configured, setConfigured] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [response, standbyPage, checkInPage] = await Promise.all([
          base44.functions.invoke('radioPresence', {}),
          base44.entities.RadioStandby
            .filter({}, { sort: '-last_seen', limit: 100 })
            .catch(() => null),
          base44.entities.PersonalCheckIn
            .filter({ check_in_date: todayKey() }, { limit: 500 })
            .catch(() => null),
        ]);
        const data = response?.data || {};
        if (cancelled) return;
        const live = Array.isArray(data.presence) ? data.presence : [];
        const liveEmails = new Set(
          live.map((entry) => String(entry.email || '').toLowerCase())
        );
        // Members still checked in today — everyone else is off duty.
        const activeEmails = new Set(
          (checkInPage?.items || [])
            .filter((record) => !record.check_out_time && record.user_email)
            .map((record) => String(record.user_email).toLowerCase())
        );
        const activeKnown = !!checkInPage;
        const cutoff = Date.now() - STANDBY_MS;
        const standby = [];
        const seen = new Set();
        (standbyPage?.items || []).forEach((record) => {
          const email = String(record?.user_email || '').toLowerCase();
          if (!email || !record?.channel_id || seen.has(email)) return;
          if (liveEmails.has(email)) return;
          if (new Date(record.last_seen).getTime() < cutoff) return;
          if (activeKnown && !activeEmails.has(email)) return;
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