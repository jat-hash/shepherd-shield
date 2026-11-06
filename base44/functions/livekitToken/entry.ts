import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { isAuthorizedForChannel } from '../../shared/talkAccess.ts';

/**
 * Mints a short-lived LiveKit join token for one talk channel.
 * The LiveKit API secret never leaves the server — the browser only ever
 * receives a scoped, expiring token for a single room.
 */

const TOKEN_TTL_SECONDS = 60 * 60 * 4;

function b64urlFromBytes(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlJson(value: unknown): string {
  return b64urlFromBytes(new TextEncoder().encode(JSON.stringify(value)));
}

async function mintToken(payload: Record<string, unknown>, secret: string): Promise<string> {
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

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((error: any) => {
      if (error?.status === 401) return null;
      throw error;
    });
    if (!user?.email) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const channelId = body?.channel_id;
    if (!channelId) {
      return Response.json({ error: 'channel_id is required' }, { status: 400 });
    }

    const url = Deno.env.get('LIVEKIT_URL');
    const apiKey = Deno.env.get('LIVEKIT_API_KEY');
    const apiSecret = Deno.env.get('LIVEKIT_API_SECRET');
    if (!url || !apiKey || !apiSecret) {
      return Response.json(
        { error: 'Internet radio is not configured yet.', code: 'not_configured' },
        { status: 503 }
      );
    }

    const channel = await base44.asServiceRole.entities.TalkChannel.get(channelId).catch(() => null);
    if (!channel) {
      return Response.json({ error: 'Channel not found' }, { status: 404 });
    }
    if (channel.is_active === false) {
      return Response.json({ error: 'That channel is inactive' }, { status: 403 });
    }
    if (!isAuthorizedForChannel(user, channel)) {
      return Response.json({ error: 'You are not assigned to this channel' }, { status: 403 });
    }

    const isEmergency = channel.channel_type === 'Emergency';
    const room = isEmergency ? 'shepherd-emergency' : `shepherd-${channel.id}`;
    const now = Math.floor(Date.now() / 1000);

    const token = await mintToken(
      {
        exp: now + TOKEN_TTL_SECONDS,
        iss: apiKey,
        sub: user.email,
        name: user.full_name || user.email,
        nbf: now - 10,
        video: {
          room,
          roomJoin: true,
          canPublish: true,
          canSubscribe: true,
          canPublishData: true,
        },
        metadata: JSON.stringify({
          role: user.role || 'user',
          channel: channel.name || '',
          channelType: channel.channel_type || 'Standard',
        }),
      },
      apiSecret
    );

    return Response.json({
      url,
      token,
      room,
      identity: user.email,
      channel: {
        id: channel.id,
        name: channel.name,
        channel_type: channel.channel_type || 'Standard',
      },
    });
  } catch (error) {
    console.error('livekitToken error:', error);
    return Response.json({ error: 'Could not prepare the radio channel' }, { status: 500 });
  }
}