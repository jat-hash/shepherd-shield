import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

// Lazy initialization to ensure React is ready
let base44Instance = null;

function getBase44() {
  if (!base44Instance) {
    base44Instance = createClient({
      appId,
      token,
      functionsVersion,
      serverUrl: '',
      requiresAuth: false,
      appBaseUrl
    });
  }
  return base44Instance;
}

export { getBase44 };

// Create a proxy to lazy-load on first access
export const base44 = new Proxy({}, {
  get(target, prop) {
    return getBase44()[prop];
  },
  has(target, prop) {
    return prop in getBase44();
  },
  ownKeys(target) {
    return Reflect.ownKeys(getBase44());
  },
  getOwnPropertyDescriptor(target, prop) {
    return Object.getOwnPropertyDescriptor(getBase44(), prop);
  }
});