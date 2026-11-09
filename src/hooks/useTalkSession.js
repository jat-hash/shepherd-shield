import { useCallback, useEffect, useRef, useState } from 'react';
import { ConnectionState, Room, RoomEvent } from 'livekit-client';
import { base44 } from '@/api/base44Client';
import { localLink } from '@/lib/localLink';
import { createSilentCarrier } from '@/lib/silentCarrier';

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

// This device's own radio identity suffix. Two devices signed in as the same
// member must both stay connected, so each joins under its own identity.
const DEVICE_KEY = 'shepherd-radio-device';
// Chosen speaker for the radio voice (a Bluetooth headset, a car kit, …).
const OUTPUT_KEY = 'shepherd-radio-output';
const canPickOutput = () =>
  typeof window !== 'undefined' &&
  !!window.HTMLMediaElement?.prototype &&
  'setSinkId' in window.HTMLMediaElement.prototype;
const getDeviceId = () => {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = Math.random().toString(36).slice(2, 10);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch (_) {
    return 'device';
  }
};

export const isBrowserOffline = () =>
  typeof navigator !== 'undefined' && navigator.onLine === false;

// Noise cleanup applied to the microphone itself, so everything the team hears
// is already cleaned: echo cancellation, background noise suppression, mono
// capture, and — on browsers that offer it — voice isolation, which filters
// everything that is not a voice.
const micCleanup = () => {
  const options = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  if (/Chrome|Chromium|Edg\//.test(ua)) options.voiceIsolation = true;
  return options;
};

// Opens the microphone with the cleanup filters; a device that cannot accept
// them still gets a plain microphone rather than a failed transmission.
const openMicrophone = async (room) => {
  try {
    await room.localParticipant.setMicrophoneEnabled(true, micCleanup());
  } catch (_) {
    await room.localParticipant.setMicrophoneEnabled(true);
  }
};

// A transmission addressed to one member must reach that member alone. The room
// is told only their devices may receive it, so phones whose app is asleep (and
// never see the audience message) stay silent too.
const allowOnly = async (room, audience) => {
  const wanted = String(audience || '').split('#')[0].toLowerCase();
  const identities = [];
  room.remoteParticipants.forEach((participant) => {
    const email = String(participant.identity || '').split('#')[0].toLowerCase();
    // Every device of that member may listen, not just the one that joined first.
    if (email && email === wanted) identities.push(participant.identity);
  });
  await room.localParticipant.setTrackSubscriptionPermissions(
    false,
    identities.map((participantIdentity) => ({ participantIdentity, allTracks: true }))
  );
};

const allowEveryone = async (room) => {
  await room.localParticipant.setTrackSubscriptionPermissions(true).catch(() => {});
};

// Person-only voice is published fresh for that transmission and taken back
// down afterwards, so the next transmission can be addressed differently
// without anyone else ever holding a subscription to it.
const dropMicrophone = async (room) => {
  const local = room.localParticipant;
  const publications = Array.from(local.audioTrackPublications.values());
  await Promise.all(
    publications.map((publication) =>
      publication.track ? local.unpublishTrack(publication.track) : null
    )
  );
};

const mapPeer = (peer) => ({
  id: peer?.id || peer?.name || 'peer',
  name: peer?.name || 'Team member',
  speaking: !!peer?.speaking,
});

export default function useTalkSession(channelId, options = {}) {
  const [status, setStatus] = useState(TALK_STATUS.DISCONNECTED);
  const [transport, setTransport] = useState(TALK_TRANSPORT.NONE);
  const [networkOffline, setNetworkOffline] = useState(isBrowserOffline());
  const [participants, setParticipants] = useState([]);
  const [activeSpeakerIds, setActiveSpeakerIds] = useState([]);
  // Who is holding the microphone open right now — the exact push-to-talk
  // state, which is instant on a headset button press unlike audio detection.
  const [talkerIds, setTalkerIds] = useState([]);
  const [transmitting, setTransmitting] = useState(false);
  const [nearbyPeers, setNearbyPeers] = useState([]);
  const [setupRequired, setSetupRequired] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [error, setError] = useState(null);
  const [audience, setAudienceState] = useState('everyone');
  // Bumped whenever the channel has to be reopened from scratch.
  const [sessionKey, setSessionKey] = useState(0);

  const roomRef = useRef(null);
  const volumeRef = useRef(1);
  const localRef = useRef(false);
  const directTryingRef = useRef(false);
  const transmittingRef = useRef(false);
  // True while the transmission on air is addressed to one member only.
  const targetedRef = useRef(false);
  const audioContainerRef = useRef(null);
  const upgradeToDirectRef = useRef(null);
  const audienceRef = useRef('everyone');
  const retargetRef = useRef(null);
  const selfEmailRef = useRef(null);
  const mutedRef = useRef(new Set());
  const announceRef = useRef(null);
  const lastAlertRef = useRef(0);
  const connectingRef = useRef(false);
  const configBlockedRef = useRef(false);
  // Where the radio voice is played. Kept across sessions so a paired headset
  // stays the speaker on the next shift too.
  const outputRef = useRef('');
  const [outputDeviceId, setOutputDeviceId] = useState('');
  const [audioOutputs, setAudioOutputs] = useState([]);

  const refreshOutputs = useCallback(async () => {
    if (!canPickOutput()) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAudioOutputs(devices.filter((device) => device.kind === 'audiooutput' && !!device.deviceId));
    } catch (_) {
      setAudioOutputs([]);
    }
  }, []);

  const selectOutput = useCallback(async (deviceId) => {
    const value = deviceId === 'default' ? '' : deviceId || '';
    outputRef.current = value;
    setOutputDeviceId(value);
    try {
      localStorage.setItem(OUTPUT_KEY, value);
    } catch (_) {
      /* storage may be blocked */
    }
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.switchActiveDevice('audiooutput', value || 'default');
    } catch (_) {
      /* this browser cannot choose a speaker */
    }
  }, []);

  // A headset paired (or unpaired) mid-shift has to appear in the list.
  useEffect(() => {
    if (!canPickOutput()) return undefined;
    try {
      outputRef.current = localStorage.getItem(OUTPUT_KEY) || '';
      setOutputDeviceId(outputRef.current);
    } catch (_) {
      /* storage may be blocked */
    }
    refreshOutputs();
    const onDeviceChange = () => refreshOutputs();
    navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', onDeviceChange);
  }, [refreshOutputs]);

  // Once the radio is live the microphone is allowed, so device names appear.
  useEffect(() => {
    if (status === TALK_STATUS.ONLINE) refreshOutputs();
  }, [status, refreshOutputs]);

  // A phone suspends a page that is not playing anything, which cuts the radio
  // off the moment the screen locks or another app opens. Holding a silent loop
  // open keeps the channel joined and its voice audible while backgrounded.
  useEffect(() => {
    if (transport !== TALK_TRANSPORT.INTERNET) return undefined;
    const carrier = createSilentCarrier();
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.playbackState = 'playing';
      } catch (_) {
        /* unsupported playback state */
      }
    }
    const keepAlive = () => carrier.keepAlive();
    const timer = setInterval(keepAlive, 15000);
    document.addEventListener('visibilitychange', keepAlive);
    window.addEventListener('pageshow', keepAlive);
    window.addEventListener('focus', keepAlive);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', keepAlive);
      window.removeEventListener('pageshow', keepAlive);
      window.removeEventListener('focus', keepAlive);
      carrier.dispose();
    };
  }, [transport]);

  // Anyone the current speaker is not addressing stays silenced, even though
  // the channel itself carries their voice to every joined device.
  const applyVolume = (room, value) => {
    const selfEmail = String(selfEmailRef.current || '').split('#')[0].toLowerCase();
    room?.remoteParticipants?.forEach((participant) => {
      // Another session of this same member (a second phone, a tab, the preview)
      // is never played back here — that is exactly hearing your own voice.
      const ownSession =
        !!selfEmail && String(participant.identity || '').split('#')[0].toLowerCase() === selfEmail;
      const silenced = ownSession || mutedRef.current.has(participant.identity);
      try {
        participant.setVolume(silenced ? 0 : value);
      } catch (_) {
        /* participant may already be gone */
      }
    });
  };

  useEffect(() => {
    if (!channelId) return undefined;

    let cancelled = false;
    let rebuildTimer = null;
    // A previous join attempt belongs to the room being replaced.
    connectingRef.current = false;

    // A channel that drops is reopened from scratch — a brand-new room with a
    // fresh token — instead of reviving a stale connection that can stay dead.
    const scheduleRebuild = (delay = 5000) => {
      if (rebuildTimer || cancelled) return;
      rebuildTimer = setTimeout(() => {
        rebuildTimer = null;
        if (!cancelled) setSessionKey((key) => key + 1);
      }, delay);
    };

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: micCleanup(),
    });
    roomRef.current = room;
    localRef.current = false;
    setStatus(TALK_STATUS.SEARCHING);
    setSetupRequired(false);
    configBlockedRef.current = false;
    setAudioBlocked(false);
    setError(null);
    setParticipants([]);
    setActiveSpeakerIds([]);
    setTalkerIds([]);
    setTransport(TALK_TRANSPORT.NONE);
    mutedRef.current = new Set();
    audienceRef.current = 'everyone';
    setAudienceState('everyone');

    // Remote audio only reaches the speakers once its track is attached to a
    // media element, so this hidden holder keeps every incoming voice stream.
    const audioContainer = document.createElement('div');
    audioContainer.style.display = 'none';
    document.body.appendChild(audioContainer);
    audioContainerRef.current = audioContainer;

    // Tells everyone on the channel who this transmission is for, so devices
    // that are not addressed keep the speaker silenced.
    const announceAudience = async (value) => {
      if (localRef.current) return;
      try {
        await room.localParticipant.publishData(
          new TextEncoder().encode(JSON.stringify({ audience: value })),
          { reliable: true, topic: 'radio-audience' }
        );
      } catch (_) {
        /* the room may already be gone */
      }
    };
    announceRef.current = announceAudience;

    // Moving an on-air transmission to a different audience republishes the
    // voice with that audience's permission, never leaving old subscribers
    // hearing something that is no longer meant for them.
    retargetRef.current = async (next) => {
      const onlyOne = !!next && next !== 'everyone';
      targetedRef.current = onlyOne;
      await dropMicrophone(room).catch(() => {});
      if (onlyOne) await allowOnly(room, next).catch(() => {});
      else await allowEveryone(room);
      if (transmittingRef.current) await openMicrophone(room).catch(() => {});
    };

    // A member pressing push-to-talk (headset button or on-screen) opens their
    // microphone, so the open microphone is the reliable "talking" signal.
    const micOpen = (participant) => {
      try {
        if (typeof participant.isMicrophoneEnabled === 'boolean') {
          return participant.isMicrophoneEnabled || !!participant.isSpeaking;
        }
      } catch (_) {
        /* the participant may already be gone */
      }
      return !!participant.isSpeaking;
    };

    // One row per member, never one per device: identities carry a device
    // suffix, so the same person on two devices (or a leftover session) would
    // otherwise be listed again and again.
    const syncParticipants = () => {
      if (localRef.current) return;
      const selfEmail = String(selfEmailRef.current || '').split('#')[0].toLowerCase();
      const byMember = new Map();
      room.remoteParticipants.forEach((participant) => {
        const email = String(participant.identity || '').split('#')[0].toLowerCase();
        if (!email) return;
        // This member's own other devices are not teammates — the panel already
        // shows "you" once, so they must never add another row.
        if (selfEmail && email === selfEmail) return;
        const talking = micOpen(participant);
        const existing = byMember.get(email);
        if (existing) {
          existing.speaking = existing.speaking || talking;
          return;
        }
        byMember.set(email, {
          id: email,
          name: participant.name || email,
          speaking: talking,
        });
      });
      const list = Array.from(byMember.values());
      setParticipants(list);
      setTalkerIds(list.filter((member) => member.speaking).map((member) => member.id));
    };

    room
      .on(RoomEvent.ParticipantConnected, () => {
        syncParticipants();
        // Someone who joined mid-transmission still needs to know who it is for.
        if (transmittingRef.current) announceAudience(audienceRef.current);
      })
      .on(RoomEvent.ParticipantDisconnected, syncParticipants)
      .on(RoomEvent.TrackMuted, (publication, participant) => {
        // A speaker who stopped transmitting releases any silence we held.
        if (publication?.kind === 'audio' && participant) {
          mutedRef.current.delete(participant.identity);
          applyVolume(room, volumeRef.current);
        }
        syncParticipants();
      })
      .on(RoomEvent.TrackUnmuted, syncParticipants)
      .on(RoomEvent.TrackPublished, syncParticipants)
      .on(RoomEvent.TrackUnpublished, syncParticipants)
      .on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        if (track.kind !== 'audio') return;
        const element = track.attach();
        element.autoplay = true;
        element.setAttribute('playsinline', 'true');
        audioContainer.appendChild(element);
        // A voice that arrives after the speaker was chosen still belongs on it.
        if (outputRef.current) {
          try {
            element.setSinkId?.(outputRef.current)?.catch?.(() => {});
          } catch (_) {
            /* this browser cannot choose a speaker */
          }
        }
        applyVolume(room, volumeRef.current);
      })
      .on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach().forEach((element) => element.remove());
      })
      .on(RoomEvent.AudioPlaybackStatusChanged, () => {
        setAudioBlocked(!room.canPlaybackAudio);
      })
      .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        if (localRef.current) return;
        const speaking = (speakers || []).map((speaker) => speaker.identity);
        setActiveSpeakerIds(
          speaking.map((identity) => String(identity).split('#')[0].toLowerCase())
        );
        syncParticipants();
        // A silence only covers the transmission it was announced for. The
        // moment that member stops talking the channel plays again, so a
        // targeted call never leaves anyone deaf to the rest of the team.
        let released = false;
        Array.from(mutedRef.current).forEach((identity) => {
          if (!speaking.includes(identity)) {
            mutedRef.current.delete(identity);
            released = true;
          }
        });
        if (released) applyVolume(room, volumeRef.current);
      })
      .on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
        if (topic !== 'radio-audience' || !participant || localRef.current) return;
        let message = null;
        try {
          message = JSON.parse(new TextDecoder().decode(payload));
        } catch (_) {
          return;
        }
        const target = message?.audience;
        // A target can arrive as this device's identity or as the member's email.
        const selfIdentity = String(selfEmailRef.current || '');
        const selfEmail = selfIdentity.split('#')[0];
        const meantForMe =
          !target ||
          target === 'none' ||
          target === 'everyone' ||
          target === selfIdentity ||
          target === selfEmail;
        if (meantForMe) mutedRef.current.delete(participant.identity);
        else mutedRef.current.add(participant.identity);
        applyVolume(room, volumeRef.current);
      })
      .on(RoomEvent.Reconnecting, () => setStatus(TALK_STATUS.SEARCHING))
      .on(RoomEvent.Reconnected, () => {
        if (localRef.current) return;
        setTransport(TALK_TRANSPORT.INTERNET);
        setStatus(TALK_STATUS.ONLINE);
      })
      // The room's own state is the truth: whatever else happened, a live
      // connection reads as online and never as a stale "offline".
      .on(RoomEvent.ConnectionStateChanged, (state) => {
        if (localRef.current) return;
        if (state === ConnectionState.Connected) {
          setTransport(TALK_TRANSPORT.INTERNET);
          setStatus(TALK_STATUS.ONLINE);
          setError(null);
        } else if (state === ConnectionState.Reconnecting) {
          setStatus(TALK_STATUS.SEARCHING);
        }
      })
      .on(RoomEvent.Disconnected, () => {
        if (roomRef.current === room && !localRef.current) {
          setStatus(TALK_STATUS.DISCONNECTED);
          setTransport(TALK_TRANSPORT.NONE);
          scheduleRebuild();
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
      // One attempt at a time — the retry loop and a wake-up can overlap.
      if (connectingRef.current) return false;
      connectingRef.current = true;
      try {
        const response = await base44.functions.invoke('livekitToken', {
          channel_id: channelId,
          device_id: getDeviceId(),
        });
        const data = response?.data || {};
        if (cancelled) return false;

        if (data.code === 'not_configured') {
          configBlockedRef.current = true;
          setSetupRequired(true);
          setTransport(TALK_TRANSPORT.NONE);
          setStatus(TALK_STATUS.DISCONNECTED);
          return false;
        }
        if (data.code === 'credentials_rejected' || data.error) {
          if (data.code === 'credentials_rejected') configBlockedRef.current = true;
          setError(data.error || 'The radio could not prepare this channel.');
          setTransport(TALK_TRANSPORT.NONE);
          setStatus(TALK_STATUS.DISCONNECTED);
          if (!configBlockedRef.current) scheduleRebuild();
          return false;
        }

        selfEmailRef.current = data.identity || selfEmailRef.current;
        await room.connect(data.url, data.token);
        if (cancelled) return false;

        // Return the voice to the speaker this member picked (e.g. their headset).
        if (outputRef.current) {
          await room
            .switchActiveDevice('audiooutput', outputRef.current)
            .catch(() => {});
        }

        await room.startAudio().catch(() => {});
        // Register the channel as a media session so the device keeps the radio
        // audio running when the screen locks or the app moves to the background.
        if ('mediaSession' in navigator) {
          try {
            navigator.mediaSession.metadata = new MediaMetadata({
              title: 'Team Radio',
              artist: 'Shepherd Shield',
              album: 'Live channel',
            });
            navigator.mediaSession.playbackState = 'playing';
          } catch (_) {
            /* unsupported metadata format */
          }
        }
        applyVolume(room, volumeRef.current);
        setAudioBlocked(!room.canPlaybackAudio);
        setTransport(TALK_TRANSPORT.INTERNET);
        setNetworkOffline(false);
        setStatus(TALK_STATUS.ONLINE);
        setError(null);
        syncParticipants();
        return true;
      } catch (connectError) {
        console.error('Talk session connect failed:', connectError);
        if (cancelled) return false;

        // The token service answers 503 with a specific reason when the app's
        // LiveKit credentials are refused — show that, not a network message.
        const payload = connectError?.response?.data || {};
        if (payload.code === 'credentials_rejected' || payload.code === 'not_configured') {
          configBlockedRef.current = true;
          if (payload.code === 'not_configured') setSetupRequired(true);
          setError(payload.error || null);
        } else if (connectError?.status === 401 || connectError?.response?.status === 401) {
          setError('Please sign in again to use the radio.');
        } else {
          setError('Could not reach the radio channel. Check your connection and try again.');
        }
        setTransport(TALK_TRANSPORT.NONE);
        setStatus(TALK_STATUS.DISCONNECTED);
        if (!configBlockedRef.current && !isBrowserOffline()) scheduleRebuild();
        return false;
      } finally {
        connectingRef.current = false;
      }
    };

    // Direct first, then internet. A device that only *thinks* it is offline
    // (a captive portal, a stale network flag) still gets a join attempt, so the
    // radio never sits on "offline" while the connection is really there.
    const open = async () => {
      setStatus(TALK_STATUS.SEARCHING);
      setError(null);
      if (await startDirect()) return;
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
      if (room.state === ConnectionState.Disconnected) scheduleRebuild(0);
    };

    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);

    // The radio looks after itself: if the channel drops (signal loss, the phone
    // sleeping, Wi-Fi without internet) it rejoins on its own, forever, without
    // anyone tapping anything.
    const rejoined = () => {
      const current = roomRef.current;
      if (!current || current.state !== ConnectionState.Disconnected) return;
      if (isBrowserOffline() || configBlockedRef.current) return;
      scheduleRebuild(0);
    };
    const retryId = setInterval(rejoined, 12000);

    // Coming back to the app (or the screen waking) rejoins immediately instead
    // of waiting for the next retry, and restores sound after a lock screen.
    const wake = () => {
      if (cancelled) return;
      setNetworkOffline(isBrowserOffline());
      if (localRef.current) return;
      const current = roomRef.current;
      if (!current) return;
      if (current.state === ConnectionState.Connected) {
        // Coming back to the app restores everyone who is not actually
        // speaking right now, so a missed release cannot leave the radio quiet.
        let freed = false;
        Array.from(mutedRef.current).forEach((identity) => {
          const remote = current.remoteParticipants.get(identity);
          if (!remote || !remote.isSpeaking) {
            mutedRef.current.delete(identity);
            freed = true;
          }
        });
        if (freed) applyVolume(current, volumeRef.current);
        current.startAudio().then(() => setAudioBlocked(!current.canPlaybackAudio)).catch(() => {});
        return;
      }
      rejoined();
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('pageshow', wake);
    window.addEventListener('focus', wake);

    return () => {
      cancelled = true;
      if (rebuildTimer) clearTimeout(rebuildTimer);
      transmittingRef.current = false;
      targetedRef.current = false;
      setTransmitting(false);
      upgradeToDirectRef.current = null;
      retargetRef.current = null;
      announceRef.current = null;
      clearInterval(retryId);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('pageshow', wake);
      window.removeEventListener('focus', wake);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      if (localRef.current) localLink.stop();
      room.disconnect();
      audioContainer.remove();
      if (audioContainerRef.current === audioContainer) audioContainerRef.current = null;
      if (roomRef.current === room) roomRef.current = null;
    };
  }, [channelId, sessionKey]);

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
      const target = audienceRef.current;
      const onlyOne = !!target && target !== 'everyone';
      targetedRef.current = onlyOne;
      if (onlyOne) {
        // Anything still published was addressed to the whole channel, so it is
        // taken down before this voice is sent to the one selected member.
        await dropMicrophone(room).catch(() => {});
        await allowOnly(room, target).catch(() => {});
      } else {
        await allowEveryone(room);
      }
      // Announced before the microphone opens so nobody hears the first word.
      await announceRef.current?.(audienceRef.current);
      await openMicrophone(room);

      // Everyone who is not in the channel right now gets an alert, so members
      // whose app is closed still learn that a transmission is happening.
      const now = Date.now();
      if (now - lastAlertRef.current > 90000) {
        lastAlertRef.current = now;
        const listening = Array.from(room.remoteParticipants.values()).map(
          (participant) => String(participant.identity || '').split('#')[0]
        );
        base44.functions
          .invoke('notifyRadioTransmission', { channel_id: channelId, exclude_emails: listening })
          .catch(() => {});
      }
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
      if (targetedRef.current) {
        // A person-only voice leaves nothing behind: the microphone is taken
        // back down and the channel is open to everyone again.
        await dropMicrophone(room);
        await allowEveryone(room);
        targetedRef.current = false;
      } else {
        await room.localParticipant.setMicrophoneEnabled(false);
      }
    } catch (_) {
      /* already muted, unpublished or disconnected */
    }
    // Release everyone the transmission was holding silent.
    await announceRef.current?.('none');
    // Keep the channel playing for this device: talking to one person never
    // costs the background audio of everyone else.
    room.startAudio().then(() => setAudioBlocked(!room.canPlaybackAudio)).catch(() => {});
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

  // 'everyone' or the identity of one team member on the channel.
  const setAudience = useCallback((value) => {
    const next = value || 'everyone';
    audienceRef.current = next;
    setAudienceState(next);
    if (transmittingRef.current) {
      announceRef.current?.(next);
      // Picking someone else mid-transmission moves the voice itself, not just
      // the silence, so the channel only carries it to the new selection.
      retargetRef.current?.(next).catch(() => {});
    }
  }, []);

  // If the chosen person leaves the channel, fall back to the whole channel.
  // A caller that picks a member up front keeps that choice regardless.
  useEffect(() => {
    if (options.audiencePersistent) return;
    if (audience === 'everyone') return;
    if (participants.some((participant) => participant.id === audience)) return;
    setAudience('everyone');
  }, [participants, audience, setAudience, options.audiencePersistent]);

  return {
    status,
    audience,
    transport,
    networkOffline,
    participants,
    activeSpeakerIds,
    talkerIds,
    transmitting,
    nearbyPeers,
    setupRequired,
    error,
    startTransmitting,
    stopTransmitting,
    setAudience,
    setVolume,
    audioBlocked,
    resumeAudio,
    audioOutputs,
    outputDeviceId,
    selectOutput,
    canPickOutput: canPickOutput(),
  };
}