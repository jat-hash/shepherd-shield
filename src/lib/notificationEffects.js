/**
 * Cross-platform notification effects.
 * iOS Safari does NOT support navigator.vibrate — we use Web Audio API tones instead.
 * Screen flash works on all platforms via a DOM overlay.
 */

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

/**
 * Vibrate on Android; play a short audio pulse on iOS as a substitute.
 * @param {'short'|'double'|'long'|'emergency'} pattern
 */
export function vibrateOrBeep(pattern = 'short') {
  const patterns = {
    short:     [200],
    double:    [200, 100, 200, 100, 200],
    long:      [400, 100, 400, 100, 400],
    emergency: [1000, 200, 1000, 200, 1000, 200, 1000, 200, 1000],
  };

  const vibration = patterns[pattern] || patterns.short;

  if (isIOS()) {
    // iOS: play audio tones instead
    _playAudioTone(pattern);
  } else if (navigator.vibrate) {
    navigator.vibrate(vibration);
  } else {
    // Fallback for any other platform without vibration
    _playAudioTone(pattern);
  }
}

// Shared AudioContext — reuse to avoid iOS "too many contexts" limit
let _sharedAudioCtx = null;
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

    const resume = ctx.state === 'suspended' ? ctx.resume() : Promise.resolve();
    resume.then(() => {
      const pulseCount = pattern === 'emergency' ? 5 : pattern === 'double' ? 2 : 1;
      const freq = pattern === 'emergency' ? 880 : 660;

      for (let i = 0; i < pulseCount; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        const startAt = ctx.currentTime + i * 0.35;
        const duration = pattern === 'emergency' ? 0.25 : 0.12;
        gain.gain.setValueAtTime(0.3, startAt);
        gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
        osc.start(startAt);
        osc.stop(startAt + duration);
      }
    }).catch(() => {});
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
    background: ${color === 'red' ? 'rgba(220,38,38,0.75)' : 'rgba(255,255,255,0.9)'};
    opacity: 0;
    transition: none;
  `;
  document.body.appendChild(overlay);

  let count = 0;
  const flashOnce = () => {
    overlay.style.opacity = '1';
    setTimeout(() => {
      overlay.style.opacity = '0';
      count++;
      if (count < times) {
        setTimeout(flashOnce, 150);
      } else {
        setTimeout(() => overlay.remove(), 300);
      }
    }, 150);
  };
  flashOnce();
}

/**
 * Combined alert effect: vibrate/beep + screen flash.
 * @param {'dm'|'alert'|'emergency'|'assignment'} type
 */
export function triggerNotificationEffect(type = 'dm') {
  switch (type) {
    case 'emergency':
      vibrateOrBeep('emergency');
      flashScreen('red', 6);
      break;
    case 'alert':
      vibrateOrBeep('long');
      flashScreen('red', 4);
      break;
    case 'dm':
      vibrateOrBeep('double');
      flashScreen('white', 4);
      break;
    case 'assignment':
      vibrateOrBeep('double');
      flashScreen('white', 2);
      break;
    default:
      vibrateOrBeep('double');
      flashScreen('white', 2);
      break;
  }
}