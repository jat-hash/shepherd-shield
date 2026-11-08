import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import useTalkSession, { TALK_STATUS } from '@/hooks/useTalkSession';
import useBluetoothPtt from '@/hooks/useBluetoothPtt';
import { canAccessMainApp } from '@/lib/leadership';

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

  // Nursery-only members never use the radio.
  const blocked = !!user && !canAccessMainApp(user);

  const loadChannels = useCallback(async () => {
    try {
      const result = await base44.entities.TalkChannel.filter(
        { is_active: true },
        { sort: 'order', limit: 50 }
      );
      const items = result?.items || (Array.isArray(result) ? result : []);
      setChannels(items);
      if (!items.length) return;
      setChannelId((current) => {
        if (current && items.some((channel) => channel.id === current)) return current;
        const fallback = pickMainChannel(items).id;
        saveChannel(fallback);
        return fallback;
      });
    } catch (_) {
      setChannels([]);
    }
  }, []);

  useEffect(() => {
    if (blocked) {
      setChannels([]);
      setChannelId(null);
      return;
    }
    loadChannels();
  }, [blocked, loadChannels]);

  const session = useTalkSession(channelId, { audiencePersistent: true });

  // The radio is usable as soon as it holds a channel, online or holding on a
  // direct link. Patrols move between screens, so the headset button is armed
  // here for the whole app rather than on the radio pages only.
  const radioReady =
    !!channelId && (session.status === TALK_STATUS.ONLINE || session.status === TALK_STATUS.OFFLINE);
  const headset = useBluetoothPtt({
    enabled: radioReady,
    transmitting: session.transmitting,
    onStart: session.startTransmitting,
    onEnd: session.stopTransmitting,
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