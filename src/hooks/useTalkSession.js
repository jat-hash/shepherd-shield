import { useCallback, useEffect, useRef, useState } from 'react';
import { ConnectionState, Room, RoomEvent, Track } from 'livekit-client';
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
    // A headset mic is always one channel; asking for the same keeps Bluetooth
    // hands-free audio from arriving as a hollow, doubled voice.
    channelCount: 1,
  };
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  if (/Chrome|Chromium|Edg\//.test(ua)) options.voiceIsolation = true;
  return options;
};

// How hard this device drives its microphone. A radio sits in a pocket or on a
// belt, often far from the mouth, so the transmit level has to be adjustable
// well above what the device's own automatic gain settles on.
const BOOST_KEY = 'shepherd-radio-mic-boost';
const MIC_BOOST_MAX = 3;

// Clarity chain for the outgoing voice, which matters most on a Bluetooth
// headset mic in a noisy room: rumble and hiss either side of speech are cut,
// the presence band that carries consonants is lifted, the level is driven up,
// and a compressor then holds it steady so a quiet talker still comes through
// and a loud room never swamps the words.
const buildVoiceChain = (ctx, source, boost, destination) => {
  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 110;
  highpass.Q.value = 0.7;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 9500;

  const presence = ctx.createBiquadFilter();
  presence.type = 'peaking';
  presence.frequency.value = 2600;
  presence.Q.value = 1;
  presence.gain.value = 4;

  const gainNode = ctx.createGain();
  gainNode.gain.value = boost;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -22;
  compressor.knee.value = 12;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.2;

  source
    .connect(highpass)
    .connect(lowpass)
    .connect(presence)
    .connect(gainNode)
    .connect(compressor)
    .connect(destination);
  return gainNode;
};
const readBoost = () => {
  try {
    const value = parseFloat(localStorage.getItem(BOOST_KEY));
    if (Number.isFinite(value) && value >= 1) return Math.min(MIC_BOOST_MAX, value);
  } catch (_) {
    /* storage may be blocked */
  }
  return 1;
};

// The voice the team hears: the cleaned capture runs through a gain stage, so
// the level can go far past the device's own limit, and it is published at a
// speech bitrate high enough to keep words crisp instead of choppy.
const openMicrophone = async (room, boost) => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: micCleanup() });
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) throw new Error('Audio processing is unavailable');
  const ctx = new AudioCtx();
  try {
    await ctx.resume();
  } catch (_) {
    /* the next tap resumes it */
  }
  const destination = ctx.createMediaStreamDestination();
  const gainNode = buildVoiceChain(ctx, ctx.createMediaStreamSource(stream), boost, destination);
  const track = destination.stream.getAudioTracks()[0];

  // Anything still published as the microphone would be a second, unboosted
  // voice on the channel.
  const existing = room.localParticipant.getTrackPublication?.(Track.Source.Microphone);
  if (existing?.track) {
    try {
      await room.localParticipant.unpublishTrack(existing.track);
    } catch (_) {
      /* already gone */
    }
  }
  await room.localParticipant.publishTrack(track, {
    name: 'microphone',
    source: Track.Source.Microphone,
    audioPreset: { maxBitrate: 64000, dtx: false, red: true },
  });
  return { ctx, stream, track, gainNode };
};

// A device that cannot run the gain stage still gets a working microphone
// rather than a failed transmission.
const startMicrophone = async (room, boost) => {
  try {
    return await openMicrophone(room, boost);
  } catch (error) {
    console.error('Boosted microphone unavailable:', error);
    try {
      await room.localParticipant.setMicrophoneEnabled(true, micCleanup());
    } catch (_) {
      await room.localParticipant.setMicrophoneEnabled(true);
    }
    return null;
  }
};

const closeMicrophone = async (room, mic) => {
  if (!mic) {
    try {
      await room.localParticipant.setMicrophoneEnabled(false);
    } catch (_) {
      /* already muted or disconnected */
    }
    return;
  }
  try {
    await room.localParticipant.unpublishTrack(mic.track);
  } catch (_) {
    /* already unpublished */
  }
  try {
    mic.track.stop();
  } catch (_) {}
  mic.stream.getTracks().forEach((item) => {
    try {
      item.stop();
    } catch (_) {}
  });
  try {
    await mic.ctx.close();
  } catch (_) {}
};

// Who hears this device's transmissions: an empty list is the whole channel,
// a list of member emails is a temporary private contact.
const normalizeAudience = (value) => {
  if (!value || value === 'everyone' || value === 'none') return [];
  const list = Array.isArray(value) ? value : [value];
  return Array.from(
    new Set(
      list
        .map((entry) => String(entry || '').split('#')[0].toLowerCase())
        .filter(Boolean)
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
  const [audience, setAudienceState] = useState([]);
  // A member who is calling this device privately, so the reply can go back to
  // them and the panel can say whose call is being answered.
  const [privateFrom, setPrivateFrom] = useState(null);
  // Bumped whenever the channel has to be reopened from scratch.
  const [sessionKey, setSessionKey] = useState(0);
  // How loudly the team hears this device, remembered between shifts.
  const [micBoost, setMicBoostState] = useState(readBoost);
  const micBoostRef = useRef(micBoost);
  const micHandleRef = useRef(null);

  const roomRef = useRef(null);
  const volumeRef = useRef(1);
  const localRef = useRef(false);
  const directTryingRef = useRef(false);
  const transmittingRef = useRef(false);
  const audioContainerRef = useRef(null);
  const upgradeToDirectRef = useRef(null);
  const audienceRef = useRef([]);
  const selfEmailRef = useRef(null);
  const mutedRef = useRef(new Set());
  const announceRef = useRef(null);
  // A private contact is temporary: it drops back to the whole channel on its own.
  const privateTimerRef = useRef(null);
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

  // The transmit level can be pushed up on the spot, even mid-transmission.
  const setMicBoost = useCallback((value) => {
    const next = Math.min(MIC_BOOST_MAX, Math.max(1, Number(value) || 1));
    micBoostRef.current = next;
    setMicBoostState(next);
    try {
      localStorage.setItem(BOOST_KEY, String(next));
    } catch (_) {
      /* storage may be blocked */
    }
    const mic = micHandleRef.current;
    if (mic?.gainNode) {
      try {
        mic.gainNode.gain.value = next;
      } catch (_) {
        /* the gain stage is already closed */
      }
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
    audienceRef.current = [];
    setAudienceState([]);
    setPrivateFrom(null);

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
      const targets = normalizeAudience(value);
      try {
        await room.localParticipant.publishData(
          new TextEncoder().encode(
            JSON.stringify({ targets, audience: targets[0] || 'everyone' })
          ),
          { reliable: true, topic: 'radio-audience' }
        );
      } catch (_) {
        /* the room may already be gone */
      }
    };
    announceRef.current = announceAudience;

    // A private contact only lasts while it is being used: after a couple of
    // quiet minutes the radio returns to the whole channel by itself.
    const armPrivateExpiry = (email) => {
      if (privateTimerRef.current) clearTimeout(privateTimerRef.current);
      privateTimerRef.current = setTimeout(() => {
        privateTimerRef.current = null;
        if (transmittingRef.current) {
          armPrivateExpiry(email);
          return;
        }
        const current = normalizeAudience(audienceRef.current);
        // The member changed the selection themselves — leave it alone.
        if (current.length !== 1 || current[0] !== email) return;
        audienceRef.current = [];
        setAudienceState([]);
        setPrivateFrom(null);
      }, 120000);
    };

    // A private call is answered privately: the reply goes back to whoever
    // called, so the team never hears it. The channel itself stays on, so the
    // rest of the team can still reach this device and everyone else is heard.
    const answerPrivateCall = (email, name) => {
      if (!email) return;
      setPrivateFrom({ email, name: name || email });
      const current = normalizeAudience(audienceRef.current);
      // Already talking to this member: just keep the contact alive.
      if (current.length > 0) {
        if (current.length === 1 && current[0] === email) armPrivateExpiry(email);
        return;
      }
      audienceRef.current = [email];
      setAudienceState([email]);
      armPrivateExpiry(email);
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
        // No target (or 'everyone') is the whole channel; otherwise the member
        // addressed this transmission at one or more specific people.
        const rawTargets = message?.targets ?? message?.audience;
        const targets = normalizeAudience(rawTargets);
        const selfEmail = String(selfEmailRef.current || '').split('#')[0].toLowerCase();
        const meantForMe = targets.length === 0 || targets.includes(selfEmail);
        if (meantForMe) {
          mutedRef.current.delete(participant.identity);
          if (targets.length > 0) {
            const senderEmail = String(participant.identity || '').split('#')[0].toLowerCase();
            answerPrivateCall(senderEmail, participant.name);
          }
        } else {
          mutedRef.current.add(participant.identity);
        }
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
      if (privateTimerRef.current) clearTimeout(privateTimerRef.current);
      privateTimerRef.current = null;
      transmittingRef.current = false;
      setTransmitting(false);
      upgradeToDirectRef.current = null;
      announceRef.current = null;
      clearInterval(retryId);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('pageshow', wake);
      window.removeEventListener('focus', wake);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      const open = micHandleRef.current;
      micHandleRef.current = null;
      if (open) {
        try {
          open.track.stop();
        } catch (_) {}
        open.stream.getTracks().forEach((item) => {
          try {
            item.stop();
          } catch (_) {}
        });
        try {
          open.ctx.close();
        } catch (_) {}
      }
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
      // Announced before the microphone opens so nobody hears the first word.
      await announceRef.current?.(audienceRef.current);
      micHandleRef.current = await startMicrophone(room, micBoostRef.current);

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
    const mic = micHandleRef.current;
    micHandleRef.current = null;
    await closeMicrophone(room, mic);
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

  // Who hears this device: nothing picked (or 'everyone') is the whole channel,
  // a member email or a list of them is a temporary private contact.
  const setAudience = useCallback((value) => {
    const next = normalizeAudience(value);
    audienceRef.current = next;
    setAudienceState(next);
    setPrivateFrom(null);
    if (transmittingRef.current) announceRef.current?.(next);
  }, []);

  // If everyone picked leaves the channel, fall back to the whole channel.
  // A caller that picks a member up front keeps that choice regardless.
  useEffect(() => {
    if (options.audiencePersistent) return;
    if (audience.length === 0) return;
    const live = new Set(participants.map((participant) => String(participant.id).toLowerCase()));
    if (audience.some((email) => live.has(email))) return;
    setAudience('everyone');
  }, [participants, audience, setAudience, options.audiencePersistent]);

  return {
    status,
    audience,
    privateFrom,
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
    micBoost,
    setMicBoost,
    micBoostMax: MIC_BOOST_MAX,
    audioBlocked,
    resumeAudio,
    audioOutputs,
    outputDeviceId,
    selectOutput,
    canPickOutput: canPickOutput(),
  };
}