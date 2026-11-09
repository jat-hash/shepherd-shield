/**
 * Clean microphone processor.
 *
 * The microphone's own noise suppression removes steady hiss, but a radio
 * channel still carries room rumble, air handling and background chatter
 * between words. This shapes the outgoing voice before it is published:
 *
 *  - a high-pass filter drops rumble and low drone (HVAC, traffic, handling)
 *  - a small presence lift keeps speech intelligible on a small speaker
 *  - a gate opens instantly on a voice and settles between words, so the
 *    channel falls quiet instead of passing room noise
 *  - a compressor keeps a loud voice from clipping and lifts a quiet one
 *
 * It plugs into the LiveKit audio capture as a track processor, so every
 * transmission carries the cleaned voice and nothing else.
 */

const OPEN_LEVEL = 0.028; // RMS at which the gate opens for a voice
const CLOSE_LEVEL = 0.016; // RMS below which it settles back down
const HOLD_MS = 320; // how long it stays open after speech stops
const FLOOR_GAIN = 0.1; // what it settles to (never dead silence)

export function createCleanMicProcessor() {
  let ctx = null;
  let timer = null;
  let gainNode = null;
  let analyser = null;
  let samples = null;
  let holdUntil = 0;

  const teardown = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    try {
      gainNode?.disconnect();
      analyser?.disconnect();
    } catch (_) {
      /* nodes may already be gone */
    }
    if (ctx) {
      ctx.close().catch(() => {});
      ctx = null;
    }
    gainNode = null;
    analyser = null;
    samples = null;
  };

  const build = (inputTrack) => {
    teardown();
    if (!inputTrack) return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return inputTrack;

    ctx = new AudioCtx({ sampleRate: 48000 });
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    const source = ctx.createMediaStreamSource(new MediaStream([inputTrack]));

    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 110;
    highpass.Q.value = 0.7;

    // A gentle lift around 2.6 kHz keeps words clear on a phone speaker.
    const presence = ctx.createBiquadFilter();
    presence.type = 'peaking';
    presence.frequency.value = 2600;
    presence.Q.value = 0.9;
    presence.gain.value = 3;

    gainNode = ctx.createGain();
    gainNode.gain.value = FLOOR_GAIN;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -28;
    compressor.knee.value = 18;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;

    const destination = ctx.createMediaStreamDestination();

    source.connect(highpass);
    highpass.connect(presence);
    presence.connect(gainNode);
    gainNode.connect(compressor);
    compressor.connect(destination);

    // The gate follows how loud the raw voice is, not the processed result.
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.6;
    source.connect(analyser);
    samples = new Float32Array(analyser.fftSize);

    timer = setInterval(() => {
      if (!ctx || !gainNode || !analyser) return;
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];
      const level = Math.sqrt(sum / samples.length);

      if (level > OPEN_LEVEL) {
        holdUntil = performance.now() + HOLD_MS;
        gainNode.gain.setTargetAtTime(1, ctx.currentTime, 0.008);
      } else if (level < CLOSE_LEVEL && performance.now() > holdUntil) {
        gainNode.gain.setTargetAtTime(FLOOR_GAIN, ctx.currentTime, 0.06);
      }
    }, 20);

    return destination.stream.getAudioTracks()[0] || inputTrack;
  };

  return {
    name: 'shepherd-clean-mic',
    processedTrack: undefined,
    async init(options) {
      this.processedTrack = build(options?.track);
    },
    async restart(options) {
      this.processedTrack = build(options?.track);
    },
    async destroy() {
      teardown();
      this.processedTrack = undefined;
    },
  };
}

// One processor for the whole app: it is bound to the microphone track, and the
// same instance is handed back on every transmission.
let sharedProcessor = null;
export function getCleanMicProcessor() {
  if (!sharedProcessor) sharedProcessor = createCleanMicProcessor();
  return sharedProcessor;
}