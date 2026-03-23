import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

let _base44 = null;

function ensureBase44() {
  if (!_base44) {
    const { appId, token, functionsVersion, appBaseUrl } = appParams;
    _base44 = createClient({
      appId,
      token,
      functionsVersion,
      serverUrl: '',
      requiresAuth: false,
      appBaseUrl
    });
  }
  return _base44;
}

Object.defineProperty(window, '__base44__', {
  get: ensureBase44,
  configurable: true
});

export const base44 = new Proxy({}, {
  get(target, prop) {
    return ensureBase44()[prop];
  }
});