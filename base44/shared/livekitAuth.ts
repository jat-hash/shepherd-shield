/**
 * Shared helpers for signing LiveKit access tokens (HS256 JWT) so both the
 * join-token function and the presence function mint identical credentials.
 */

export function b64urlFromBytes(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlJson(value: unknown): string {
  return b64urlFromBytes(new TextEncoder().encode(JSON.stringify(value)));
}

export async function mintLivekitToken(
  payload: Record<string, unknown>,
  secret: string
): Promise<string> {
  const unsigned = `${b64urlJson({ alg: 'HS256', typ: 'JWT' })}.${b64urlJson(payload)}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(unsigned))
  );
  return `${unsigned}.${b64urlFromBytes(signature)}`;
}

/** ws(s):// server URL → http(s):// origin used by LiveKit's HTTP API. */
export function livekitHttpOrigin(url: string): string {
  return url.replace(/^ws/, 'http').replace(/\/$/, '');
}

/**
 * The app was migrated to a new LiveKit project, but the stored LIVEKIT_URL
 * still holds the retired project's address, which no current key can reach.
 * Both radio functions resolve the server address here so they always agree.
 */
const RETIRED_LIVEKIT_URL = 'wss://shepard-sheild-j5eps61y.livekit.cloud';
const CURRENT_LIVEKIT_URL = 'wss://shepard-shield-2-7m7j5buu.livekit.cloud';

export function resolveLivekitUrl(storedUrl?: string | null): string {
  const url = (storedUrl || '').trim();
  if (!url || url === RETIRED_LIVEKIT_URL) return CURRENT_LIVEKIT_URL;
  return url;
}