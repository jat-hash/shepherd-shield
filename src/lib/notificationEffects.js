/**
 * Cross-platform notification effects.
 * iOS Safari does NOT support navigator.vibrate — we use Web Audio API tones instead.
 * Screen flashes are coordinated with vibration pulses so they fire in sync.
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
  dm:         { pref: 'vib_dm',        default: 'double',   color: 'white' },
  general:    { pref: 'vib_team_msg',  default: 'single',   color: 'white' },
  alert:      { pref: 'vib_incident',  default: 'escalate', color: 'red'   },
  emergency:  { pref: 'vib_emergency', default: 'sos',      color: 'red'   },
  assignment: { pref: 'vib_assignment',default: 'single',   color: 'white' },
};

// Cached user prefs (updated by cacheUserVibrationPrefs)
let _userVibPrefs = {};
// Vibration strength: 1 = normal, 2 = strong, 3 = max
let _vibStrength = 1;

/** Call this once after auth to cache the user's saved vibration prefs */
export function cacheUserVibrationPrefs(userObj) {
  if (!userObj) return;
  _userVibPrefs = userObj;
  _vibStrength = Math.max(1, Math.min(3, Number(userObj.vib_strength) || 1));
}

/**
 * Scale a vibration pattern by strength (only "on" pulses at even indices).
 */
function _scalePattern(vibration, strength) {
  const multipliers = [1, 1, 1.6, 2.5];
  const mult = multipliers[Math.max(1, Math.min(3, strength))];
  return vibration.map((ms, i) => i % 2 === 0 ? Math.round(ms * mult) : ms);
}

/**
 * Extract the start times (ms from now) of each "on" pulse in a pattern.
 * Returns array of { start, duration } objects.
 */
function _getPulseTimes(scaledPattern) {
  const pulses = [];
  let t = 0;
  for (let i = 0; i < scaledPattern.length; i++) {
    if (i % 2 === 0) {
      pulses.push({ start: t, duration: scaledPattern[i] });
    }
    t += scaledPattern[i];
  }
  return pulses;
}

/**
 * Flash the screen in sync with vibration pulse timings.
 * @param {'white'|'red'} color
 * @param {{ start: number, duration: number }[]} pulses  Array of pulse timings
 */
function _flashCoordinated(color, pulses) {
  const existing = document.getElementById('__screen-flash__');
  if (existing) existing.remove();

  const bg = color === 'red' ? 'rgba(220,38,38,0.85)' : 'rgba(255,255,255,0.92)';

  const overlay = document.createElement('div');
  overlay.id = '__screen-flash__';
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 99999;
    pointer-events: none;
    background: ${bg};
    opacity: 0;
  `;
  document.body.appendChild(overlay);

  pulses.forEach(({ start, duration }, idx) => {
    const isLast = idx === pulses.length - 1;
    const visibleMs = Math.max(duration, 60);

    // Snap ON instantly at pulse start
    setTimeout(() => {
      overlay.style.transition = 'none';
      overlay.style.opacity = '1';

      // Fade off over 80ms after the pulse duration
      setTimeout(() => {
        overlay.style.transition = 'opacity 80ms ease-out';
        overlay.style.opacity = '0';
        if (isLast) {
          setTimeout(() => overlay.remove(), 150);
        }
      }, visibleMs);
    }, start);
  });
}

/**
 * Vibrate on Android; play a short audio pulse on iOS as a substitute.
 * Returns the scaled pattern so callers can use it for coordinated flashing.
 */
export function vibrateOrBeep(patternKey = 'single', strengthOverride = null) {
  const vibration = NAMED_PATTERNS[patternKey] ?? NAMED_PATTERNS.single;
  if (!vibration) return null; // 'off'

  const strength = strengthOverride ?? _vibStrength;
  const scaled = _scalePattern(vibration, strength);

  if (isIOS()) {
    _playAudioTone(patternKey, strength);
  } else if (navigator.vibrate) {
    navigator.vibrate(scaled);
  } else {
    _playAudioTone(patternKey, strength);
  }

  return scaled;
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

function _playAudioTone(pattern, strength = 1) {
  try {
    const ctx = _getAudioCtx();
    if (!ctx) return;

    const pulseCount = pattern === 'emergency' ? 5 : pattern === 'sos' ? 3 : pattern === 'double' || pattern === 'triple' ? 2 : 1;
    const freq = pattern === 'emergency' || pattern === 'sos' ? 880 : pattern === 'escalate' || pattern === 'alert' ? 760 : 660;
    // Scale audio gain: strength 1=0.4, 2=0.7, 3=1.0
    const gainValues = [0.4, 0.4, 0.7, 1.0];
    const gainVal = gainValues[Math.max(1, Math.min(3, strength))];

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
        gain.gain.setValueAtTime(gainVal, startAt);
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
 * Legacy standalone flash (kept for external callers like VibrationSettings preview).
 */
export function flashScreen(color = 'white', times = 2) {
  // Build a simple equal-interval pulse list
  const pulses = Array.from({ length: times }, (_, i) => ({ start: i * 380, duration: 180 }));
  _flashCoordinated(color, pulses);
}

/**
 * Combined alert effect: vibrate/beep + coordinated screen flash.
 * Flashes fire in exact sync with each vibration pulse.
 * @param {'dm'|'alert'|'emergency'|'assignment'|'general'} type
 */
export function triggerNotificationEffect(type = 'dm') {
  const prefConfig = TYPE_TO_PREF[type] || TYPE_TO_PREF.general;
  const patternKey = _userVibPrefs?.[prefConfig.pref] ?? prefConfig.default;
  const color = prefConfig.color || 'white';

  if (patternKey === 'off') return;

  const vibration = NAMED_PATTERNS[patternKey] ?? NAMED_PATTERNS.single;
  if (!vibration) return;

  const scaled = _scalePattern(vibration, _vibStrength);

  // Trigger vibration/audio
  if (isIOS()) {
    _playAudioTone(patternKey, _vibStrength);
  } else if (navigator.vibrate) {
    navigator.vibrate(scaled);
  } else {
    _playAudioTone(patternKey, _vibStrength);
  }

  // Flash in sync with each vibration "on" pulse
  const pulses = _getPulseTimes(scaled);
  _flashCoordinated(color, pulses);
}