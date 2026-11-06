/**
 * Local peer-to-peer seam for the walkie-talkie.
 *
 * Browsers cannot access Wi-Fi Direct (Android) or Multipeer Connectivity
 * (iOS). Those APIs only exist inside a native build, which registers a bridge
 * on `window.ShepherdLocalLink`:
 *
 *   isSupported()            -> boolean
 *   start({ channel })       -> boolean   (advertise + browse for the channel)
 *   stop()                   -> void
 *   transmit({ transmitting }) -> boolean (open/close the local voice stream)
 *   getPeers()               -> [{ id, name, speaking }]
 *   onPeersChanged(cb)       -> void
 *
 * When no bridge is present every call reports "not available" and the talk
 * session stays on the internet transport. Nothing here fakes a local link.
 */

const bridge = () => (typeof window !== 'undefined' ? window.ShepherdLocalLink : null);

export const localLink = {
  isAvailable() {
    const api = bridge();
    if (!api) return false;
    try {
      return typeof api.isSupported === 'function' ? !!api.isSupported() : false;
    } catch (_) {
      return false;
    }
  },

  async start(channelKey) {
    const api = bridge();
    if (!api?.start) return false;
    try {
      return !!(await api.start({ channel: channelKey }));
    } catch (_) {
      return false;
    }
  },

  async stop() {
    const api = bridge();
    if (!api?.stop) return;
    try {
      await api.stop();
    } catch (_) {
      /* ignore teardown errors */
    }
  },

  async transmit(transmitting) {
    const api = bridge();
    if (!api?.transmit) return false;
    try {
      return !!(await api.transmit({ transmitting }));
    } catch (_) {
      return false;
    }
  },

  async peers() {
    const api = bridge();
    if (!api?.getPeers) return [];
    try {
      const result = await api.getPeers();
      return Array.isArray(result) ? result : result?.peers || [];
    } catch (_) {
      return [];
    }
  },
};