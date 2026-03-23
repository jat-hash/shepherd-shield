import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

let base44 = null;

function initializeBase44() {
  if (!base44) {
    const { appId, token, functionsVersion, appBaseUrl } = appParams;
    base44 = createClient({
      appId,
      token,
      functionsVersion,
      serverUrl: '',
      requiresAuth: false,
      appBaseUrl
    });
  }
  return base44;
}

export { initializeBase44 };

Object.defineProperty(exports, 'base44', {
  get: () => initializeBase44(),
  enumerable: true
});