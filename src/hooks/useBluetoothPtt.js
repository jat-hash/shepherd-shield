import { useCallback, useEffect, useRef, useState } from 'react';
import { createSilentCarrier } from '@/lib/silentCarrier';

// Hardware buttons reach a web app as a keyboard key (clip-on remotes and
// "shutter" buttons), as a media key, or as the play/pause command of a paired
// Bluetooth headset. All three are picked up here so one switch arms any of them.
const STORAGE_KEY = 'shepherd-bluetooth-ptt';

const HOLD_KEYS = new Set(['Enter', ' ', 'Spacebar']);
const MEDIA_KEYS = new Set(['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'HeadsetHook']);
const MEDIA_KEY_CODES = new Set([179, 178, 79]);

// One headset press can arrive twice — as a media key and as a media session
// command — so a repeat inside this window is treated as the same press.
const PRESS_GAP = 700;

// A paired headset works out of the box; the switch is there to turn it off.
const readArmed = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch (_) {
    return true;
  }
};

const saveArmed = (value) => {
  try {
    localStorage.setItem(STORAGE_KEY, value ? 'on' : 'off');
  } catch (_) {
    /* private mode */
  }
};

const isTypingTarget = (target) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

// Enter and Space still belong to the focused control (a button, a link) while
// headset talk is armed, so a remote button never triggers the UI by accident.
const isControlTarget = (target) =>
  target instanceof HTMLElement && !!target.closest('button, a, [role="button"], [role="tab"]');

const dialogOpen = () => !!document.querySelector('[role="dialog"], [role="alertdialog"]');

/**
 * Hardware push-to-talk. A key-style button works as hold-to-talk; a headset's
 * call button toggles transmission on each press.
 */
export default function useBluetoothPtt({ enabled, transmitting, onStart, onEnd }) {
  const [armed, setArmed] = useState(readArmed);
  const heldRef = useRef(false);
  const pressAtRef = useRef(0);
  const liveRef = useRef({ transmitting, onStart, onEnd });

  useEffect(() => {
    liveRef.current = { transmitting, onStart, onEnd };
  }, [transmitting, onStart, onEnd]);

  const toggleArmed = useCallback(() => {
    setArmed((current) => {
      const next = !current;
      saveArmed(next);
      return next;
    });
  }, []);

  const press = useCallback(() => {
    const now = Date.now();
    if (now - pressAtRef.current < PRESS_GAP) return;
    pressAtRef.current = now;
    const live = liveRef.current;
    if (live.transmitting) live.onEnd();
    else live.onStart();
  }, []);

  // Key-style remotes: hold to talk.
  useEffect(() => {
    if (!armed || !enabled) return undefined;

    const down = (event) => {
      if (event.repeat || !HOLD_KEYS.has(event.key)) return;
      if (isTypingTarget(event.target) || isControlTarget(event.target) || dialogOpen()) return;
      event.preventDefault();
      if (heldRef.current) return;
      heldRef.current = true;
      liveRef.current.onStart();
    };

    const up = (event) => {
      if (!HOLD_KEYS.has(event.key) || !heldRef.current) return;
      heldRef.current = false;
      liveRef.current.onEnd();
    };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      if (heldRef.current) {
        heldRef.current = false;
        liveRef.current.onEnd();
      }
    };
  }, [armed, enabled]);

  // Desktops and Android deliver a headset button as a media key.
  useEffect(() => {
    if (!armed || !enabled) return undefined;

    const onMediaKey = (event) => {
      if (event.repeat) return;
      if (!MEDIA_KEYS.has(event.key) && !MEDIA_KEY_CODES.has(event.keyCode)) return;
      if (isTypingTarget(event.target) || dialogOpen()) return;
      event.preventDefault();
      press();
    };

    window.addEventListener('keydown', onMediaKey);
    return () => window.removeEventListener('keydown', onMediaKey);
  }, [armed, enabled, press]);

  // Phones hand the headset button to the browser through the media session,
  // which only exists while something is playing. The silent carrier holds that
  // session open, and the play/pause commands become talk start and stop.
  useEffect(() => {
    if (!armed || !enabled) return undefined;

    const carrier = createSilentCarrier();
    const media = 'mediaSession' in navigator ? navigator.mediaSession : null;

    const claimSession = () => {
      if (!media) return;
      try {
        if (!media.metadata) {
          media.metadata = new MediaMetadata({
            title: 'Team Radio',
            artist: 'Shepherd Shield',
            album: 'Push to talk',
          });
        }
        media.playbackState = 'playing';
      } catch (_) {
        /* browser without media metadata */
      }
    };

    // Bringing our own silence back is reported to the page as a play command,
    // which is not the member touching the button. A pause or stop can only come
    // from the button itself, so those always count.
    const onHeadsetPress = (action) => {
      if (action === 'play' && carrier.isResuming()) return;
      press();
      claimSession();
      carrier.keepAlive();
    };

    claimSession();

    // A browser only lets audio start after a tap of its own, and the headset
    // button is not one of those. Every touch, click or key on the app starts
    // the session the button belongs to, and coming back to the app restarts it
    // if the phone stopped it.
    const resume = () => carrier.keepAlive();
    const resumeEvents = ['pointerdown', 'touchstart', 'click', 'keydown'];
    resumeEvents.forEach((name) =>
      document.addEventListener(name, resume, { passive: true, capture: true })
    );
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('focus', resume);
    window.addEventListener('pageshow', resume);
    resume();

    if (media) {
      try {
        media.setActionHandler('play', () => onHeadsetPress('play'));
        media.setActionHandler('pause', () => onHeadsetPress('pause'));
        media.setActionHandler('stop', () => onHeadsetPress('stop'));
      } catch (_) {
        /* no media button support */
      }
    }

    // A headset paired mid-shift needs the silent session running again.
    const onDeviceChange = () => {
      claimSession();
      carrier.keepAlive();
    };
    navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange);

    return () => {
      carrier.dispose();
      navigator.mediaDevices?.removeEventListener?.('devicechange', onDeviceChange);
      resumeEvents.forEach((name) =>
        document.removeEventListener(name, resume, { capture: true })
      );
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('focus', resume);
      window.removeEventListener('pageshow', resume);
      if (media) {
        try {
          media.setActionHandler('play', null);
          media.setActionHandler('pause', null);
          media.setActionHandler('stop', null);
        } catch (_) {
          /* handler already gone */
        }
      }
    };
  }, [armed, enabled, press]);

  return { armed, toggleArmed };
}