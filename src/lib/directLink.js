/**
 * Direct phone-to-phone link.
 *
 * Two phones on the same Wi-Fi pair by swapping a short code (shown as a QR),
 * and from then on voice flows straight between them: no server is involved in
 * the call and no internet or cell service is needed to keep it open.
 *
 * Browsers cannot open Bluetooth or Wi-Fi Direct connections between phones, so
 * the local network is the transport available to a web app. Only local
 * candidates are gathered (no STUN/TURN), which keeps the pairing code small.
 */

const CODE_PREFIX = 'SS';

const toBase64Url = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64Url = (text) => {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '==='.slice((padded.length + 3) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

async function packCode(description) {
  const raw = new TextEncoder().encode(JSON.stringify({ t: description.type, s: description.sdp }));
  if (typeof CompressionStream === 'function') {
    const gzipped = new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'));
    return `${CODE_PREFIX}G${toBase64Url(await new Response(gzipped).arrayBuffer())}`;
  }
  return `${CODE_PREFIX}${toBase64Url(raw)}`;
}

async function unpackCode(code) {
  const clean = String(code || '').replace(/\s+/g, '');
  if (clean.slice(0, 2) !== CODE_PREFIX) {
    throw new Error('That is not a Shepherd Shield link code.');
  }
  const compressed = clean[2] === 'G';
  const bytes = fromBase64Url(clean.slice(compressed ? 3 : 2));
  let text;
  if (compressed) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    text = await new Response(stream).text();
  } else {
    text = new TextDecoder().decode(bytes);
  }
  const data = JSON.parse(text);
  return { type: data.t, sdp: data.s };
}

// Local candidates show up within a moment; wait for them so the code carries
// every address the other phone might reach this one on.
function waitForLocalCandidates(pc, timeout = 5000) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      pc.removeEventListener('icegatheringstatechange', onChange);
      resolve();
    };
    const onChange = () => {
      if (pc.iceGatheringState === 'complete') finish();
    };
    pc.addEventListener('icegatheringstatechange', onChange);
    setTimeout(finish, timeout);
  });
}

export class DirectLink {
  constructor({ onConnectionState, onRemoteStream } = {}) {
    this.handlers = { onConnectionState, onRemoteStream };
    this.pc = null;
    this.localStream = null;
    this.closed = false;
  }

  async open() {
    if (typeof RTCPeerConnection !== 'function' || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('This phone cannot open a direct link in this browser.');
    }
    this.pc = new RTCPeerConnection({ iceServers: [] });
    this.pc.onconnectionstatechange = () => {
      if (!this.closed) this.handlers.onConnectionState?.(this.pc.connectionState);
    };
    this.pc.ontrack = (event) => {
      const [stream] = event.streams;
      this.handlers.onRemoteStream?.(stream || new MediaStream([event.track]));
    };
    this.pc.onicecandidateerror = () => {};

    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    const track = this.localStream.getAudioTracks()[0];
    track.enabled = false; // push-to-talk: silent until the button is held
    this.pc.addTrack(track, this.localStream);
    return this;
  }

  /** This phone's opening code, to be shown to the other phone. */
  async hostCode() {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    await waitForLocalCandidates(this.pc);
    return packCode(this.pc.localDescription);
  }

  /** Reads the other phone's opening code and returns the reply code. */
  async joinCode(code) {
    const remote = await unpackCode(code);
    if (remote.type !== 'offer') throw new Error('That code is a reply, not a start code.');
    await this.pc.setRemoteDescription({ type: 'offer', sdp: remote.sdp });
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    await waitForLocalCandidates(this.pc);
    return packCode(this.pc.localDescription);
  }

  /** Reads the other phone's reply code and completes the link. */
  async acceptAnswer(code) {
    const remote = await unpackCode(code);
    if (remote.type !== 'answer') throw new Error('That code is a start code, not a reply.');
    await this.pc.setRemoteDescription({ type: 'answer', sdp: remote.sdp });
  }

  setTalking(talking) {
    const track = this.localStream?.getAudioTracks()?.[0];
    if (track) track.enabled = !!talking;
  }

  close() {
    this.closed = true;
    try {
      this.pc?.close();
    } catch (_) {
      /* already closed */
    }
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.pc = null;
    this.localStream = null;
  }
}