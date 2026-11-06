import { useCallback, useEffect, useRef, useState } from 'react';
import { Room, RoomEvent } from 'livekit-client';
import { base44 } from '@/api/base44Client';
import { localLink } from '@/lib/localLink';

/**
 * Talk session engine.
 *
 * One transport publishes audio at a time. If a native local-link bridge is
 * available and finds nearby devices, that direct link is used; otherwise the
 * session joins the channel over the internet through LiveKit, which handles
 * reconnects on its own. `transmittingRef` is the single guard that stops a
 * press from being published twice while the transport is switching.
 */

export const TALK_STATUS = {
  ONLINE: 'online',
  OFFLINE: 'offline',
  SEARCHING: 'searching',
  DISCONNECTED: 'disconnected',
};

const mapPeer = (peer) => ({
  id: peer?.id || peer?.name || 'peer',
  name: peer?.name || 'Team member',
  speaking: !!peer?.speaking,
});

export default function useTalkSession(channelId) {
  const [status, setStatus] = useState(TALK_STATUS.DISCONNECTED);
  const [participants, setParticipants] = useState([]);
  const [activeSpeakerIds, setActiveSpeakerIds] = useState([]);
  const [transmitting, setTransmitting] = useState(false);
  const [nearbyPeers, setNearbyPeers] = useState([]);
  const [setupRequired, setSetupRequired] = useState(false);
  const [error, setError] = useState(null);

  const roomRef = useRef(null);
  const volumeRef = useRef(1);
  const localRef = useRef(false);
  const transmittingRef = useRef(false);

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
    setStatus(TALK_STATUS.SEARCHING);
    setSetupRequired(false);
    setError(null);
    setParticipants([]);
    setActiveSpeakerIds([]);

    const syncParticipants = () => {
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
      .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        setActiveSpeakerIds((speakers || []).map((speaker) => speaker.identity));
        syncParticipants();
      })
      .on(RoomEvent.Reconnecting, () => setStatus(TALK_STATUS.SEARCHING))
      .on(RoomEvent.Reconnected, () => setStatus(TALK_STATUS.ONLINE))
      .on(RoomEvent.Disconnected, () => {
        if (roomRef.current === room) setStatus(TALK_STATUS.DISCONNECTED);
      });

    (async () => {
      // Direct device-to-device link takes priority when the native bridge
      // reports one for this channel.
      if (localLink.isAvailable()) {
        const started = await localLink.start(`channel:${channelId}`);
        if (started && !cancelled) {
          localRef.current = true;
          const peers = await localLink.peers();
          setNearbyPeers(peers);
          setParticipants(peers.map(mapPeer));
          setStatus(TALK_STATUS.OFFLINE);
          return;
        }
      }
      localRef.current = false;

      try {
        const response = await base44.functions.invoke('livekitToken', { channel_id: channelId });
        const data = response?.data || {};
        if (cancelled) return;

        if (data.code === 'not_configured') {
          setSetupRequired(true);
          setStatus(TALK_STATUS.DISCONNECTED);
          return;
        }
        if (data.code === 'credentials_rejected') {
          setError(data.error);
          setStatus(TALK_STATUS.DISCONNECTED);
          return;
        }
        if (data.error) {
          setError(data.error);
          setStatus(TALK_STATUS.DISCONNECTED);
          return;
        }

        await room.connect(data.url, data.token);
        if (cancelled) return;

        await room.startAudio().catch(() => {});
        applyVolume(room, volumeRef.current);
        setStatus(TALK_STATUS.ONLINE);
        syncParticipants();
      } catch (connectError) {
        console.error('Talk session connect failed:', connectError);
        if (cancelled) return;

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
        setStatus(TALK_STATUS.DISCONNECTED);
      }
    })();

    return () => {
      cancelled = true;
      transmittingRef.current = false;
      setTransmitting(false);
      if (localRef.current) localLink.stop();
      room.disconnect();
      if (roomRef.current === room) roomRef.current = null;
    };
  }, [channelId]);

  // Keeps nearby-device awareness fresh when a native bridge is present.
  useEffect(() => {
    if (!localLink.isAvailable()) return undefined;
    const id = setInterval(async () => {
      const peers = await localLink.peers();
      setNearbyPeers(peers);
      if (localRef.current) {
        setParticipants(peers.map(mapPeer));
        setStatus(peers.length ? TALK_STATUS.OFFLINE : TALK_STATUS.SEARCHING);
      }
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
    if (!room) {
      setError('Radio is not connected yet.');
      return;
    }

    transmittingRef.current = true;
    setTransmitting(true);
    try {
      await room.startAudio();
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

  const setVolume = useCallback((value) => {
    volumeRef.current = value;
    applyVolume(roomRef.current, value);
  }, []);

  return {
    status,
    participants,
    activeSpeakerIds,
    transmitting,
    nearbyPeers,
    setupRequired,
    error,
    startTransmitting,
    stopTransmitting,
    setVolume,
  };
}