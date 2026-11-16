import { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

const todayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
};

/**
 * Whether this member is on site right now, i.e. holds an open check-in for
 * today. The radio is only allowed while that is true.
 */
export default function useCheckInStatus(userEmail) {
  const [checkedIn, setCheckedIn] = useState(false);
  const [loading, setLoading] = useState(!!userEmail);

  const load = useCallback(async () => {
    if (!userEmail) {
      setCheckedIn(false);
      setLoading(false);
      return;
    }
    try {
      const page = await base44.entities.PersonalCheckIn.filter(
        { user_email: userEmail, check_in_date: todayKey() },
        { sort: '-check_in_time', limit: 20 }
      );
      const records = page?.items || (Array.isArray(page) ? page : []);
      setCheckedIn(records.some((record) => !record.check_out_time));
    } catch (_) {
      setCheckedIn(false);
    } finally {
      setLoading(false);
    }
  }, [userEmail]);

  useEffect(() => {
    load();
    const unsubscribe = base44.entities.PersonalCheckIn.subscribe(() => load());
    const onRefresh = () => load();
    window.addEventListener('app:refresh', onRefresh);
    return () => {
      unsubscribe?.();
      window.removeEventListener('app:refresh', onRefresh);
    };
  }, [load]);

  return { checkedIn, loading };
}