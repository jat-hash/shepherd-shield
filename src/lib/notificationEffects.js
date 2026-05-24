/**
 * Cross-platform notification effects.
 * iOS Safari does NOT support navigator.vibrate — we use Web Audio API tones instead.
 * Screen flash works on all platforms via a DOM overlay.
 */

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

// Named vibration patterns (ms: on, off, on, off...)
const NAMED_PATTERNS = {
  off:      null,
  single:   [200],
  double:   [200, 100, 200],
  triple:   [150, 80, 150, 80, 150],
  long:     [600],
  sos:      [100,80,100,80,100,200,300,200,300,200,300,200,100,80,100,80,100],
  escalate: [100, 100, 200, 100, 400],
  // legacy keys
  short:    [200],
  emergency:[1000, 200, 1000, 200, 1000, 200, 1000, 200, 1000],
};

// Map notification type → user pref key → default pattern
const TYPE_TO_PREF = {
  dm:         { pref: 'vib_dm',        default: 'double'   },
  general:    { pref: 'vib_team_msg',  default: 'single'   },
  alert:      { pref: 'vib_incident',  default: 'escalate' },
  emergency:  { pref: 'vib_emergency', default: 'sos'      },
  assignment: { pref: 'vib_assignment',default: 'single'   },
};

// Cached user prefs (updated by cacheUserVibrationPrefs)
let _userVibPrefs = {};

/** Call this once after auth to cache the user's saved vibration prefs */
export function cacheUserVibrationPrefs(userObj) {
  if (!userObj) return;
  _userVibPrefs = userObj;
}

/**
 * Vibrate on Android; play a short audio pulse on iOS as a substitute.
 * @param {string} patternKey  Named pattern key or legacy key
 */
export function vibrateOrBeep(patternKey = 'single') {
  const vibration = NAMED_PATTERNS[patternKey] ?? NAMED_PATTERNS.single;
  if (!vibration) return; // 'off'

  if (isIOS()) {
    _playAudioTone(patternKey);
  } else if (navigator.vibrate) {
    navigator.vibrate(vibration);
  } else {
    _playAudioTone(patternKey);
  }
}

// Shared AudioContext — reuse to avoid iOS "too many contexts" limit
let _sharedAudioCtx = null;

/** Call this on any user gesture (click/touch) to pre-unlock the AudioContext */
export function primeAudioContext() {
  try {
    if (!_sharedAudioCtx || _sharedAudioCtx.state === 'closed') {
      _sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (_sharedAudioCtx.state === 'suspended') {
      _sharedAudioCtx.resume().catch(() => {});
    }
  } catch (_) {}
}

function _getAudioCtx() {
  try {
    if (!_sharedAudioCtx || _sharedAudioCtx.state === 'closed') {
      _sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return _sharedAudioCtx;
  } catch (_) {
    return null;
  }
}

function _playAudioTone(pattern) {
  try {
    const ctx = _getAudioCtx();
    if (!ctx) return;

    const pulseCount = pattern === 'emergency' ? 5 : pattern === 'sos' ? 3 : pattern === 'double' || pattern === 'triple' ? 2 : 1;
    const freq = pattern === 'emergency' || pattern === 'sos' ? 880 : pattern === 'escalate' || pattern === 'alert' ? 760 : 660;

    const play = () => {
      for (let i = 0; i < pulseCount; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        const startAt = ctx.currentTime + i * 0.35;
        const duration = pattern === 'emergency' || pattern === 'sos' ? 0.25 : 0.15;
        gain.gain.setValueAtTime(0.4, startAt);
        gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
        osc.start(startAt);
        osc.stop(startAt + duration);
      }
    };

    if (ctx.state === 'suspended') {
      ctx.resume().then(play).catch(() => {});
    } else {
      play();
    }
  } catch (_) {}
}

/**
 * Flash the screen briefly — works on all platforms including iOS.
 * @param {'white'|'red'} color
 * @param {number} times  How many flashes
 */
export function flashScreen(color = 'white', times = 2) {
  const existing = document.getElementById('__screen-flash__');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = '__screen-flash__';
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 99999;
    pointer-events: none;
    background: ${color === 'red' ? 'rgba(220,38,38,0.8)' : 'rgba(255,255,255,0.92)'};
    opacity: 0;
    transition: opacity 80ms ease-in-out;
  `;
  document.body.appendChild(overlay);

  // Force a reflow so the initial opacity:0 is painted before we animate
  void overlay.offsetHeight;

  let count = 0;
  const flashOnce = () => {
    overlay.style.opacity = '1';
    setTimeout(() => {
      overlay.style.opacity = '0';
      count++;
      if (count < times) {
        setTimeout(flashOnce, 200);
      } else {
        setTimeout(() => overlay.remove(), 300);
      }
    }, 180);
  };
  flashOnce();
}

/**
 * Combined alert effect: vibrate/beep + screen flash.
 * Respects user's saved vibration pattern preferences.
 * @param {'dm'|'alert'|'emergency'|'assignment'|'general'} type
 */
export function triggerNotificationEffect(type = 'dm') {
  const prefConfig = TYPE_TO_PREF[type] || TYPE_TO_PREF.general;
  const patternKey = _userVibPrefs?.[prefConfig.pref] ?? prefConfig.default;

  // Only vibrate if not set to 'off'
  if (patternKey !== 'off') {
    vibrateOrBeep(patternKey);
  }

  // Flash color/count by urgency
  switch (type) {
    case 'emergency':
      flashScreen('red', 6);
      break;
    case 'alert':
      flashScreen('red', 4);
      break;
    case 'dm':
      flashScreen('white', 4);
      break;
    case 'assignment':
      flashScreen('white', 2);
      break;
    default:
      flashScreen('white', 2);
      break;
  }
}