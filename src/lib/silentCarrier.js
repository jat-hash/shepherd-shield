// A media session only owns the headset's call/multifunction button while the
// page is actually playing something. This keeps a silent one-second loop
// running so the button keeps reaching Shepherd Shield instead of opening the
// phone assistant or redialling the last call.
const SAMPLE_RATE = 8000;
const SILENCE_SECONDS = 1;

function silentWavUrl() {
  const dataBytes = SAMPLE_RATE * SILENCE_SECONDS * 2; // 16-bit mono
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const write = (offset, text) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };

  write(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // uncompressed PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // 16 bits per sample
  write(36, 'data');
  view.setUint32(40, dataBytes, true);
  // All sample bytes stay zero, which is silence for 16-bit PCM.

  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

export function createSilentCarrier() {
  const url = silentWavUrl();
  const element = new Audio(url);
  element.loop = true;
  element.preload = 'auto';
  element.setAttribute('playsinline', '');
  element.style.display = 'none';
  document.body.appendChild(element);

  // When the button pause reaches us we bring playback straight back; the
  // browser reports that resume as a "play" command of its own, which must not
  // be mistaken for a second press of the button.
  let resumedAt = 0;
  let lastAttempt = 0;

  const keepAlive = () => {
    if (!element.paused) return;
    const now = Date.now();
    // A headset that keeps refusing playback must not turn into a rapid
    // start/stop loop, which is heard as a stutter in the radio audio.
    if (now - lastAttempt < 1200) return;
    lastAttempt = now;
    resumedAt = now;
    element.play().catch(() => {});
  };

  // The browser or the headset itself can pause playback; bring it straight back
  // so the media session never falls out of "playing".
  element.addEventListener('pause', keepAlive);
  keepAlive();

  return {
    keepAlive,
    isResuming: () => Date.now() - resumedAt < 900,
    dispose() {
      element.removeEventListener('pause', keepAlive);
      element.pause();
      element.remove();
      URL.revokeObjectURL(url);
    },
  };
}