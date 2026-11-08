import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import useTalkSession from '@/hooks/useTalkSession';
import { canAccessMainApp } from '@/lib/leadership';

const RadioSessionContext = createContext(null);

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
  const [channelId, setChannelId] = useState(null);

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
      setChannelId((current) =>
        current && items.some((channel) => channel.id === current) ? current : pickMainChannel(items).id
      );
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

  const selectChannel = useCallback(
    (id) => {
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
  };

  return <RadioSessionContext.Provider value={value}>{children}</RadioSessionContext.Provider>;
}

export function useRadioSession() {
  const value = useContext(RadioSessionContext);
  if (!value) throw new Error('useRadioSession must be used inside RadioSessionProvider');
  return value;
}