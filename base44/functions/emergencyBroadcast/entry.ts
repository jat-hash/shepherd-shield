import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { isAuthorizedForChannel } from '../../shared/talkAccess.ts';

/**
 * Raises an emergency radio broadcast: notifies every authorized team member
 * (in-app + push) and hands the caller the Emergency channel so their voice
 * goes out on top of ordinary channel traffic.
 */

const TITLE_PREFIX = 'EMERGENCY BROADCAST';

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
    const note = typeof body?.message === 'string' ? body.message.trim() : '';

    const channelRes: any = await base44.asServiceRole.entities.TalkChannel.filter(
      { channel_type: 'Emergency', is_active: true },
      { limit: 1 }
    );
    const channels: any[] = Array.isArray(channelRes) ? channelRes : channelRes?.items || [];
    const emergencyChannel = channels[0] || null;

    const users: any[] = await base44.asServiceRole.entities.User.list();
    const recipients = users.filter(
      (candidate) =>
        candidate?.email &&
        candidate.email !== user.email &&
        String(candidate.role || 'user') !== 'nursery' &&
        (!emergencyChannel || isAuthorizedForChannel(candidate, emergencyChannel))
    );

    if (recipients.length === 0) {
      return Response.json({ success: true, recipients: 0, message: 'No other team members to alert' });
    }

    if (body?.dry_run) {
      return Response.json({
        success: true,
        dry_run: true,
        recipients: recipients.length,
        channel_id: emergencyChannel?.id || null,
      });
    }

    const speaker = user.full_name || user.email;
    const title = `🚨 ${TITLE_PREFIX} — ${speaker}`;
    const message = note
      ? `${speaker} has opened an emergency radio broadcast: ${note}`
      : `${speaker} has opened an emergency radio broadcast. Open Team Radio and switch to the Emergency channel.`;

    await base44.asServiceRole.entities.Notification.bulkCreate(
      recipients.map((recipient) => ({
        user_email: recipient.email,
        title,
        message,
        type: 'incident',
      }))
    );

    let pushes = 0;
    for (let i = 0; i < recipients.length; i += 5) {
      const batch = recipients.slice(i, i + 5);
      const results = await Promise.allSettled(
        batch.map((recipient) =>
          base44.functions.invoke('sendDualPush', {
            user_email: recipient.email,
            title,
            body: message,
            click_url: '/WalkieTalkie',
            priority: 'emergency',
            tag: 'emergency-broadcast',
          })
        )
      );
      pushes += results.filter((r) => r.status === 'fulfilled').length;
    }

    console.log(`Emergency broadcast by ${speaker} → ${recipients.length} recipients (${pushes} pushes)`);

    return Response.json({
      success: true,
      recipients: recipients.length,
      pushes,
      channel_id: emergencyChannel?.id || null,
      channel_name: emergencyChannel?.name || 'Emergency',
      initiated_by: speaker,
    });
  } catch (error) {
    console.error('emergencyBroadcast error:', error);
    return Response.json({ error: 'Could not send the emergency broadcast' }, { status: 500 });
  }
}