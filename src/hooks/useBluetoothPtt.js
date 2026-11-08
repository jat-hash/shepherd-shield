import { useCallback, useEffect, useRef, useState } from 'react';

// Bluetooth buttons reach a web app in one of two ways: as a keyboard key
// (most clip-on remotes and "shutter" buttons) or as the play/pause button of
// a paired headset. Both are picked up here so one switch arms either kind.
const STORAGE_KEY = 'shepherd-bluetooth-ptt';

const HOLD_KEYS = new Set(['Enter', ' ', 'Spacebar']);

const readArmed = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'on';
  } catch (_) {
    return false;
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

const dialogOpen = () => !!document.querySelector('[role="dialog"], [role="alertdialog"]');

/**
 * Hardware push-to-talk. A keyboard-style button works as hold-to-talk;
 * a headset button toggles transmission on each press.
 */
export default function useBluetoothPtt({ enabled, transmitting, onStart, onEnd }) {
  const [armed, setArmed] = useState(readArmed);
  const heldRef = useRef(false);

  const toggleArmed = useCallback(() => {
    setArmed((current) => {
      const next = !current;
      saveArmed(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!armed || !enabled) return undefined;

    const down = (event) => {
      if (event.repeat || !HOLD_KEYS.has(event.key)) return;
      if (isTypingTarget(event.target) || dialogOpen()) return;
      event.preventDefault();
      if (heldRef.current) return;
      heldRef.current = true;
      onStart();
    };

    const up = (event) => {
      if (!HOLD_KEYS.has(event.key) || !heldRef.current) return;
      heldRef.current = false;
      onEnd();
    };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      if (heldRef.current) {
        heldRef.current = false;
        onEnd();
      }
    };
  }, [armed, enabled, onStart, onEnd]);

  // A headset's multifunction button arrives as a play/pause command on the
  // media session the radio already publishes, so each press toggles the mic.
  useEffect(() => {
    if (!armed || !enabled || !('mediaSession' in navigator)) return undefined;

    const press = () => {
      if (transmitting) onEnd();
      else onStart();
    };

    const media = navigator.mediaSession;
    try {
      media.setActionHandler('play', press);
      media.setActionHandler('pause', press);
    } catch (_) {
      return undefined;
    }

    return () => {
      try {
        media.setActionHandler('play', null);
        media.setActionHandler('pause', null);
      } catch (_) {
        /* handler already gone */
      }
    };
  }, [armed, enabled, transmitting, onStart, onEnd]);

  return { armed, toggleArmed };
}