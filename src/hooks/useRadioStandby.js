import { useEffect } from 'react';
import { base44 } from '@/api/base44Client';

const BEAT_MS = 45000;

/**
 * Records the channel this member is on while the radio is connected. The
 * record is deliberately left behind when the app is closed, so the team still
 * sees them on their channel and their device rejoins it on the next open.
 */
export default function useRadioStandby({ user, channelId, channelName, connected }) {
  useEffect(() => {
    const email = String(user?.email || '').toLowerCase();
    if (!email || !channelId || !connected) return;

    let cancelled = false;

    const beat = async () => {
      const page = await base44.entities.RadioStandby.filter(
        { user_email: email },
        { limit: 20 }
      );
      if (cancelled) return;
      const records = page?.items || [];
      // Only one channel per member: leaving the others behind would keep them
      // listed on a channel they already left.
      const stale = records.filter((record) => record.channel_id !== channelId);
      if (stale.length) {
        await Promise.all(
          stale.map((record) =>
            base44.entities.RadioStandby.delete(record.id).catch(() => {})
          )
        );
      }
      const data = {
        user_email: email,
        user_name: user.full_name || user.email || email,
        channel_id: channelId,
        channel_name: channelName || null,
        last_seen: new Date().toISOString(),
      };
      const current = records.find((record) => record.channel_id === channelId);
      if (current) await base44.entities.RadioStandby.update(current.id, data);
      else await base44.entities.RadioStandby.create(data);
    };

    beat().catch(() => {});
    const id = setInterval(() => beat().catch(() => {}), BEAT_MS);

    // Coming back to the foreground refreshes the heartbeat straight away, since
    // timers are throttled or paused while the app was in the background.
    const onVisible = () => {
      if (document.visibilityState === 'visible') beat().catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user?.email, user?.full_name, channelId, channelName, connected]);
}