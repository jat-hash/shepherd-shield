import { useCallback, useEffect, useRef, useState } from 'react';
import { ConnectionState, Room, RoomEvent } from 'livekit-client';
import { base44 } from '@/api/base44Client';
import { localLink } from '@/lib/localLink';

/**
 * Talk session engine.
 *
 * The radio chooses its transport automatically: when a native local-link
 * bridge reports nearby devices, voice goes direct device-to-device; otherwise
 * it travels over the internet through LiveKit. If data drops, the session
 * stops relying on the internet, keeps looking for a direct link, and rejoins
 * the internet channel by itself as soon as a connection returns.
 */

export const TALK_STATUS = {
  ONLINE: 'online',
  OFFLINE: 'offline',
  SEARCHING: 'searching',
  DISCONNECTED: 'disconnected',
};

export const TALK_TRANSPORT = {
  DIRECT: 'direct',
  INTERNET: 'internet',
  NONE: 'none',
};

export const isBrowserOffline = () =>
  typeof navigator !== 'undefined' && navigator.onLine === false;

const mapPeer = (peer) => ({
  id: peer?.id || peer?.name || 'peer',
  name: peer?.name || 'Team member',
  speaking: !!peer?.speaking,
});

export default function useTalkSession(channelId) {
  const [status, setStatus] = useState(TALK_STATUS.DISCONNECTED);
  const [transport, setTransport] = useState(TALK_TRANSPORT.NONE);
  const [networkOffline, setNetworkOffline] = useState(isBrowserOffline());
  const [participants, setParticipants] = useState([]);
  const [activeSpeakerIds, setActiveSpeakerIds] = useState([]);
  const [transmitting, setTransmitting] = useState(false);
  const [nearbyPeers, setNearbyPeers] = useState([]);
  const [setupRequired, setSetupRequired] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [error, setError] = useState(null);

  const roomRef = useRef(null);
  const volumeRef = useRef(1);
  const localRef = useRef(false);
  const directTryingRef = useRef(false);
  const transmittingRef = useRef(false);
  const audioContainerRef = useRef(null);
  const upgradeToDirectRef = useRef(null);

  const applyVolume = (room, value) => {
    room?.remoteParticipants?.forEach((participant) => {
      try {
        participant.setVolume(value);
      } catch (_) {
        /* participant may already be gone */
      }
    });
  };

  useEffect(() => {
    if (!channelId) return undefined;

    let cancelled = false;
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    roomRef.current = room;
    localRef.current = false;
    setStatus(TALK_STATUS.SEARCHING);
    setSetupRequired(false);
    setAudioBlocked(false);
    setError(null);
    setParticipants([]);
    setActiveSpeakerIds([]);
    setTransport(TALK_TRANSPORT.NONE);

    // Remote audio only reaches the speakers once its track is attached to a
    // media element, so this hidden holder keeps every incoming voice stream.
    const audioContainer = document.createElement('div');
    audioContainer.style.display = 'none';
    document.body.appendChild(audioContainer);
    audioContainerRef.current = audioContainer;

    const syncParticipants = () => {
      if (localRef.current) return;
      const list = [];
      room.remoteParticipants.forEach((participant) => {
        list.push({
          id: participant.identity,
          name: participant.name || participant.identity,
          speaking: !!participant.isSpeaking,
        });
      });
      setParticipants(list);
    };

    room
      .on(RoomEvent.ParticipantConnected, syncParticipants)
      .on(RoomEvent.ParticipantDisconnected, syncParticipants)
      .on(RoomEvent.TrackMuted, syncParticipants)
      .on(RoomEvent.TrackUnmuted, syncParticipants)
      .on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        if (track.kind !== 'audio') return;
        const element = track.attach();
        element.autoplay = true;
        element.setAttribute('playsinline', 'true');
        audioContainer.appendChild(element);
        try {
          participant.setVolume(volumeRef.current);
        } catch (_) {
          /* participant may already be gone */
        }
      })
      .on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach().forEach((element) => element.remove());
      })
      .on(RoomEvent.AudioPlaybackStatusChanged, () => {
        setAudioBlocked(!room.canPlaybackAudio);
      })
      .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        if (localRef.current) return;
        setActiveSpeakerIds((speakers || []).map((speaker) => speaker.identity));
        syncParticipants();
      })
      .on(RoomEvent.Reconnecting, () => setStatus(TALK_STATUS.SEARCHING))
      .on(RoomEvent.Reconnected, () => {
        if (localRef.current) return;
        setTransport(TALK_TRANSPORT.INTERNET);
        setStatus(TALK_STATUS.ONLINE);
      })
      .on(RoomEvent.Disconnected, () => {
        if (roomRef.current === room && !localRef.current) {
          setStatus(TALK_STATUS.DISCONNECTED);
          setTransport(TALK_TRANSPORT.NONE);
        }
      });

    /**
     * Direct device-to-device. Only a native build can provide the bridge, so
     * without one this reports "not available" and the internet transport runs.
     */
    const startDirect = async () => {
      if (localRef.current || directTryingRef.current) return localRef.current;
      if (!localLink.isAvailable()) return false;

      directTryingRef.current = true;
      try {
        const started = await localLink.start(`channel:${channelId}`);
        if (!started || cancelled) return false;
        localRef.current = true;
        setTransport(TALK_TRANSPORT.DIRECT);
        setStatus(TALK_STATUS.ONLINE);
        const peers = await localLink.peers();
        setNearbyPeers(peers);
        setParticipants(peers.map(mapPeer));
        return true;
      } catch (_) {
        return false;
      } finally {
        directTryingRef.current = false;
      }
    };

    const connectInternet = async () => {
      try {
        const response = await base44.functions.invoke('livekitToken', { channel_id: channelId });
        const data = response?.data || {};
        if (cancelled) return false;

        if (data.code === 'not_configured') {
          setSetupRequired(true);
          setTransport(TALK_TRANSPORT.NONE);
          setStatus(TALK_STATUS.DISCONNECTED);
          return false;
        }
        if (data.code === 'credentials_rejected' || data.error) {
          setError(data.error || 'The radio could not prepare this channel.');
          setTransport(TALK_TRANSPORT.NONE);
          setStatus(TALK_STATUS.DISCONNECTED);
          return false;
        }

        await room.connect(data.url, data.token);
        if (cancelled) return false;

        await room.startAudio().catch(() => {});
        applyVolume(room, volumeRef.current);
        setAudioBlocked(!room.canPlaybackAudio);
        setTransport(TALK_TRANSPORT.INTERNET);
        setStatus(TALK_STATUS.ONLINE);
        syncParticipants();
        return true;
      } catch (connectError) {
        console.error('Talk session connect failed:', connectError);
        if (cancelled) return false;

        // The token service answers 503 with a specific reason when the app's
        // LiveKit credentials are refused — show that, not a network message.
        const payload = connectError?.response?.data || {};
        if (payload.code === 'credentials_rejected' || payload.code === 'not_configured') {
          if (payload.code === 'not_configured') setSetupRequired(true);
          setError(payload.error || null);
        } else if (connectError?.status === 401 || connectError?.response?.status === 401) {
          setError('Please sign in again to use the radio.');
        } else {
          setError('Could not reach the radio channel. Check your connection and try again.');
        }
        setTransport(TALK_TRANSPORT.NONE);
        setStatus(TALK_STATUS.DISCONNECTED);
        return false;
      }
    };

    // Direct first, then internet — and no internet attempt at all while the
    // device reports no data connection.
    const open = async () => {
      setStatus(TALK_STATUS.SEARCHING);
      setError(null);
      if (await startDirect()) return;
      if (isBrowserOffline()) {
        setTransport(TALK_TRANSPORT.NONE);
        setStatus(TALK_STATUS.DISCONNECTED);
        return;
      }
      await connectInternet();
    };
    open();

    // Used by the nearby-device poll to promote a session to a direct link.
    upgradeToDirectRef.current = async () => {
      if (localRef.current || !roomRef.current) return;
      const switched = await startDirect();
      if (switched && room.state !== ConnectionState.Disconnected) {
        room.disconnect();
      }
    };

    const onOffline = () => {
      setNetworkOffline(true);
      // Losing data is exactly when a direct link matters most.
      if (!localRef.current) startDirect();
    };
    const onOnline = () => {
      setNetworkOffline(false);
      if (localRef.current) return;
      if (room.state === ConnectionState.Disconnected) connectInternet();
    };

    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);

    return () => {
      cancelled = true;
      transmittingRef.current = false;
      setTransmitting(false);
      upgradeToDirectRef.current = null;
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      if (localRef.current) localLink.stop();
      room.disconnect();
      audioContainer.remove();
      if (audioContainerRef.current === audioContainer) audioContainerRef.current = null;
      if (roomRef.current === room) roomRef.current = null;
    };
  }, [channelId]);

  // Nearby-device awareness, and a chance to move onto a direct link the
  // moment one becomes reachable.
  useEffect(() => {
    if (!channelId) return undefined;
    const id = setInterval(async () => {
      if (!localLink.isAvailable()) return;
      await upgradeToDirectRef.current?.();
      if (!localRef.current) return;
      const peers = await localLink.peers();
      setNearbyPeers(peers);
      setParticipants(peers.map(mapPeer));
      setStatus(peers.length ? TALK_STATUS.ONLINE : TALK_STATUS.SEARCHING);
    }, 8000);
    return () => clearInterval(id);
  }, [channelId]);

  const startTransmitting = useCallback(async () => {
    if (transmittingRef.current) return;
    if (!channelId) return;

    if (localRef.current) {
      transmittingRef.current = true;
      setTransmitting(true);
      const ok = await localLink.transmit(true);
      if (!ok) {
        transmittingRef.current = false;
        setTransmitting(false);
      }
      return;
    }

    const room = roomRef.current;
    if (!room || room.state === ConnectionState.Disconnected) {
      setError('The radio is offline. Try again when a connection is back.');
      return;
    }

    transmittingRef.current = true;
    setTransmitting(true);
    try {
      await room.startAudio();
      setAudioBlocked(!room.canPlaybackAudio);
      await room.localParticipant.setMicrophoneEnabled(true);
    } catch (micError) {
      console.error('Could not open the microphone:', micError);
      transmittingRef.current = false;
      setTransmitting(false);
      setError('Microphone access is required to talk. Allow the microphone and try again.');
    }
  }, [channelId]);

  const stopTransmitting = useCallback(async () => {
    if (!transmittingRef.current) return;
    transmittingRef.current = false;
    setTransmitting(false);
    if (localRef.current) {
      await localLink.transmit(false);
      return;
    }
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.localParticipant.setMicrophoneEnabled(false);
    } catch (_) {
      /* already muted or disconnected */
    }
  }, []);

  // Safety net: the microphone never stays open if the finger lifts outside the
  // button or the app loses focus mid-transmission.
  useEffect(() => {
    if (!transmitting) return undefined;
    const stop = () => stopTransmitting();
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    window.addEventListener('blur', stop);
    return () => {
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      window.removeEventListener('blur', stop);
    };
  }, [transmitting, stopTransmitting]);

  // Browsers hold audio back until a tap; this releases it on the user's gesture.
  const resumeAudio = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.startAudio();
    } catch (_) {
      /* the browser refused; the prompt stays visible */
    }
    setAudioBlocked(!room.canPlaybackAudio);
  }, []);

  const setVolume = useCallback((value) => {
    volumeRef.current = value;
    applyVolume(roomRef.current, value);
  }, []);

  return {
    status,
    transport,
    networkOffline,
    participants,
    activeSpeakerIds,
    transmitting,
    nearbyPeers,
    setupRequired,
    error,
    startTransmitting,
    stopTransmitting,
    setVolume,
    audioBlocked,
    resumeAudio,
  };
}