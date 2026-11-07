import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { isAuthorizedForChannel } from '../../shared/talkAccess.ts';

/**
 * Alerts channel members who are not currently listening, so someone whose app
 * is closed still finds out that a transmission is happening and can tap in.
 */
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const channelId = body?.channel_id;
    if (!channelId) return Response.json({ error: 'channel_id is required' }, { status: 400 });

    const channel = await base44.asServiceRole.entities.TalkChannel.get(channelId)
      .catch((e) => (e.status === 404 ? null : Promise.reject(e)));
    if (!channel) return Response.json({ error: 'Channel not found' }, { status: 404 });
    if (!isAuthorizedForChannel(user, channel)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const listening = new Set(
      (Array.isArray(body?.exclude_emails) ? body.exclude_emails : [])
        .map((email) => String(email).trim().toLowerCase())
        .filter(Boolean)
    );
    listening.add(String(user.email || '').toLowerCase());

    const users = await base44.asServiceRole.entities.User.list();
    const recipients = (users || [])
      .filter((candidate) => candidate?.email)
      .filter((candidate) => !listening.has(String(candidate.email).toLowerCase()))
      .filter((candidate) => isAuthorizedForChannel(candidate, channel))
      .map((candidate) => candidate.email);

    if (recipients.length === 0) {
      return Response.json({ success: true, sent: 0 });
    }

    const speaker = user.full_name || user.email;
    const title = `📻 ${speaker} is on ${channel.name}`;
    const message = 'Tap to listen and talk back on the team radio.';

    let sent = 0;
    for (let i = 0; i < recipients.length; i += 6) {
      const batch = recipients.slice(i, i + 6);
      const results = await Promise.allSettled(
        batch.map((email) =>
          base44.asServiceRole.functions.invoke('sendDualPush', {
            recipient_email: email,
            title,
            body: message,
            notification_type: 'general',
            click_url: '/WalkieTalkie',
          })
        )
      );
      sent += results.filter((result) => result.status === 'fulfilled').length;
    }

    console.log(`Radio alert for ${channel.name} sent by ${user.email} to ${sent} member(s)`);
    return Response.json({ success: true, sent });
  } catch (error) {
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
}