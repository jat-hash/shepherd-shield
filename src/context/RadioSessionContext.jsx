import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import useTalkSession, { TALK_STATUS } from '@/hooks/useTalkSession';
import useBluetoothPtt from '@/hooks/useBluetoothPtt';
import useRadioStandby from '@/hooks/useRadioStandby';
import useCheckInStatus from '@/hooks/useCheckInStatus';

const RadioSessionContext = createContext(null);

// Remembers the channel this member was on, so reopening the app (or coming
// back after being closed) puts them straight back on it.
const CHANNEL_KEY = 'shepherd-radio-channel';

const readSavedChannel = () => {
  try {
    return localStorage.getItem(CHANNEL_KEY) || null;
  } catch (_) {
    return null;
  }
};

const saveChannel = (id) => {
  try {
    if (id) localStorage.setItem(CHANNEL_KEY, id);
  } catch (_) {
    /* private mode */
  }
};

// Mirrors the server rule: empty allow-lists mean the channel is open to every
// signed-in member.
function canJoinChannel(channel, user) {
  const roles = (channel?.allowed_roles || []).map((role) => String(role).trim().toLowerCase());
  const emails = (channel?.allowed_emails || []).map((email) => String(email).trim().toLowerCase());
  const roleOk = roles.length === 0 || roles.includes(String(user?.role || '').toLowerCase());
  const emailOk = emails.length === 0 || emails.includes(String(user?.email || '').toLowerCase());
  return roleOk && emailOk;
}

// The channel every member lands on when the app opens: Main Team when it
// exists, otherwise the first ordinary channel in the configured order.
function pickMainChannel(channels) {
  const named = channels.find((channel) => /main\s*team/i.test(channel.name || ''));
  if (named) return named;
  return channels.find((channel) => channel.channel_type !== 'Emergency') || channels[0];
}

/**
 * One radio connection for the whole app. It joins the main team channel as
 * soon as a signed-in member opens the app and stays joined across pages, so
 * the team is always present on the channel without anyone pressing anything.
 */
export function RadioSessionProvider({ children }) {
  const { user } = useAuth();
  const [channels, setChannels] = useState([]);
  const [channelId, setChannelId] = useState(readSavedChannel);

  // The radio is only live while the member is checked in on site.
  // Nursery members share the main team channel with security, so every
  // signed-in member is on the radio.
  const { checkedIn } = useCheckInStatus(user?.email);
  // Nursery staff are on duty in the nursery, not on a security post, so the
  // security check-in does not gate their radio.
  const nurseryStaff = String(user?.role || '').trim().toLowerCase() === 'nursery';
  const checkInRequired = !!user && !checkedIn && !nurseryStaff;
  const radioAllowed = !!user && (checkedIn || nurseryStaff);

  const loadChannels = useCallback(async () => {
    try {
      const result = await base44.entities.TalkChannel.filter(
        { is_active: true },
        { sort: 'order', limit: 50 }
      );
      const items = result?.items || (Array.isArray(result) ? result : []);
      // A member is only shown the channels they are allowed on, so nobody is
      // parked on a channel they cannot join.
      const allowed = items.filter((channel) => canJoinChannel(channel, user));
      // Nursery staff work on the main team channel with security. They keep the
      // Emergency channel alongside it so an alert can still pull them across.
      const visible = nurseryStaff
        ? allowed.filter(
            (channel) =>
              channel.id === pickMainChannel(allowed).id || channel.channel_type === 'Emergency'
          )
        : allowed;
      setChannels(visible);
      if (!visible.length) return;
      setChannelId((current) => {
        if (!nurseryStaff && current && visible.some((channel) => channel.id === current)) {
          return current;
        }
        const fallback = pickMainChannel(visible).id;
        saveChannel(fallback);
        return fallback;
      });
    } catch (_) {
      setChannels([]);
    }
  }, [user, nurseryStaff]);

  useEffect(() => {
    if (!user) {
      setChannels([]);
      setChannelId(null);
      return;
    }
    loadChannels();
  }, [user, loadChannels]);

  const session = useTalkSession(radioAllowed ? channelId : null, { audiencePersistent: true });

  // The radio is usable as soon as it holds a channel. Patrols move between
  // screens, so the headset button is armed here for the whole app rather than
  // on the radio pages only — and it stays armed while the channel is still
  // joining or reconnecting, so a tap is never silently ignored.
  const radioReady =
    radioAllowed &&
    !!channelId &&
    (session.status === TALK_STATUS.ONLINE || session.status === TALK_STATUS.OFFLINE);
  const headset = useBluetoothPtt({
    enabled: radioAllowed && !!channelId,
    transmitting: session.transmitting,
    onStart: session.startTransmitting,
    onEnd: session.stopTransmitting,
  });

  // Keeps this member listed on their channel after the app is closed, so the
  // team still sees them and their device rejoins the same channel on reopen.
  useRadioStandby({
    user,
    channelId: radioAllowed ? channelId : null,
    channelName: channels.find((channel) => channel.id === channelId)?.name || null,
    connected: radioReady,
  });

  // Emails of everyone talking right now, this device included.
  const speakingEmails = useMemo(() => {
    const list = new Set(
      (session.talkerIds || []).map((id) => String(id).split('#')[0].toLowerCase())
    );
    if (session.transmitting && user?.email) list.add(String(user.email).toLowerCase());
    return Array.from(list);
  }, [session.talkerIds, session.transmitting, user?.email]);

  const selectChannel = useCallback(
    (id) => {
      saveChannel(id);
      setChannelId(id);
      session.resumeAudio();
    },
    [session.resumeAudio]
  );

  const value = {
    channels,
    channelId,
    activeChannel: channels.find((channel) => channel.id === channelId) || null,
    selectChannel,
    refreshChannels: loadChannels,
    session,
    radioReady,
    checkInRequired,
    headset,
    speakingEmails,
  };

  return <RadioSessionContext.Provider value={value}>{children}</RadioSessionContext.Provider>;
}

export function useRadioSession() {
  const value = useContext(RadioSessionContext);
  if (!value) throw new Error('useRadioSession must be used inside RadioSessionProvider');
  return value;
}