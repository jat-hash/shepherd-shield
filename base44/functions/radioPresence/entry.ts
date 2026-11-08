import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { mintLivekitToken, livekitHttpOrigin } from '../../shared/livekitAuth.ts';

/**
 * Authoritative "who is on the radio right now" lookup.
 *
 * The browser only sees the other people in the one room it happens to be
 * connected to, which never includes yourself and misses anyone on another
 * channel. Asking the LiveKit server directly gives the real picture for every
 * talk channel at once.
 */

const CACHE_MS = 4000;

let cache: { at: number; payload: Record<string, unknown> } | null = null;

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

    if (cache && Date.now() - cache.at < CACHE_MS) {
      return Response.json(cache.payload);
    }

    const url = Deno.env.get('LIVEKIT_URL');
    const apiKey = Deno.env.get('LIVEKIT_API_KEY');
    const apiSecret = Deno.env.get('LIVEKIT_API_SECRET');
    if (!url || !apiKey || !apiSecret) {
      return Response.json({ presence: [], configured: false });
    }

    const now = Math.floor(Date.now() / 1000);
    const origin = livekitHttpOrigin(url);

    // Room listing and per-room administration are separate grants, so each
    // request carries a token scoped to exactly what it asks for.
    const tokenFor = (video: Record<string, unknown>) =>
      mintLivekitToken(
        { exp: now + 120, iss: apiKey, sub: apiKey, nbf: now - 10, video },
        apiSecret
      );

    const call = async (
      method: string,
      body: Record<string, unknown>,
      video: Record<string, unknown>
    ) => {
      const response = await fetch(`${origin}/twirp/livekit.RoomService/${method}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await tokenFor(video)}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`${method} failed: ${response.status}`);
      return response.json();
    };

    const roomsResponse = await call('ListRooms', {}, { roomList: true });
    const rooms: any[] = (roomsResponse?.rooms || []).filter(
      (room: any) => typeof room?.name === 'string' && room.name.startsWith('shepherd-')
    );

    const channels = await base44.asServiceRole.entities.TalkChannel.list();
    const byId = new Map<string, any>((channels || []).map((channel: any) => [channel.id, channel]));

    const presence: any[] = [];
    for (const room of rooms) {
      let participants: any[] = [];
      try {
        const participantsResponse = await call(
          'ListParticipants',
          { room: room.name },
          { room: room.name, roomAdmin: true }
        );
        participants = participantsResponse?.participants || [];
      } catch (error) {
        console.error('Could not list participants for', room.name, error);
        continue;
      }

      const channel =
        room.name === 'shepherd-emergency'
          ? (channels || []).find((item: any) => item.channel_type === 'Emergency')
          : byId.get(String(room.name).replace(/^shepherd-/, ''));

      for (const participant of participants) {
        // Identities carry a per-device suffix (email#device) so one member can
        // listen on several devices; presence is reported per member.
        const email = String(participant?.identity || '').split('#')[0].toLowerCase();
        if (!email) continue;
        presence.push({
          email,
          name: participant?.name || participant?.identity,
          channel_id: channel?.id || null,
          channel_name: channel?.name || null,
        });
      }
    }

    const payload = { presence, configured: true };
    cache = { at: Date.now(), payload };
    return Response.json(payload);
  } catch (error) {
    console.error('radioPresence error:', error);
    return Response.json({ presence: [], configured: false, error: 'Could not read radio presence' });
  }
}