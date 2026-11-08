import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { isAuthorizedForChannel } from '../../shared/talkAccess.ts';
import { mintLivekitToken, livekitHttpOrigin } from '../../shared/livekitAuth.ts';

/**
 * Mints a short-lived LiveKit join token for one talk channel.
 * The LiveKit API secret never leaves the server — the browser only ever
 * receives a scoped, expiring token for a single room.
 */

const TOKEN_TTL_SECONDS = 60 * 60 * 4;

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

    // Every device gets its own identity. The same member signed in on a phone
    // and in a browser must be able to listen at the same time — LiveKit kicks
    // the older session out when two clients share one identity, which leaves
    // one of them flip-flopping between online and offline.
    const deviceId = String(body?.device_id || '')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 24);
    const identity = deviceId ? `${user.email}#${deviceId}` : user.email;

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

    const token = await mintLivekitToken(
      {
        exp: now + TOKEN_TTL_SECONDS,
        iss: apiKey,
        sub: identity,
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

    // Ask the LiveKit server whether it accepts this token. A rejected key/secret
    // pair is an app configuration problem, not a network problem, and the user
    // needs to see that distinction instead of "no connection".
    const httpOrigin = livekitHttpOrigin(url);
    const check = new URL(`${httpOrigin}/rtc/v1/validate`);
    check.searchParams.set('access_token', token);
    check.searchParams.set('auto_subscribe', '1');
    const verification = await fetch(check, { signal: AbortSignal.timeout(8000) }).catch(
      () => null
    );
    if (verification && (verification.status === 401 || verification.status === 403)) {
      console.error('LiveKit rejected the app key pair:', verification.status);
      return Response.json(
        {
          error:
            'The radio server rejected this app\u2019s LiveKit key and secret. Open your LiveKit project settings and copy the URL, API key and API secret from that same project.',
          code: 'credentials_rejected',
        },
        { status: 503 }
      );
    }

    return Response.json({
      url,
      token,
      room,
      identity,
      email: user.email,
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