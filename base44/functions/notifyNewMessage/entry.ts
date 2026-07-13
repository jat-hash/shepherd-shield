import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Nursery channel notifications go ONLY to these three leads
const NURSERY_LEADS = [
  'wilbert.ryan@gmail.com',
  'pachecosmailbox@gmail.com',
  'wintersjamesg@hotmail.com',
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event, data } = await req.json();

    if (event.type !== 'create' || !data) {
      return Response.json({ success: true });
    }

    const isDM = data.channel?.startsWith('DM: ');
    let notifications = [];

    if (isDM) {
      // For DM, only notify the recipient (the other participant)
      const withoutPrefix = data.channel.replace('DM: ', '');
      // Channel format: "email1-email2" sorted — remove the sender, leaving the recipient
      const recipientEmail = withoutPrefix.replace(data.sender_email, '').replace(/^-|-$/g, '').trim();

      if (recipientEmail) {
        notifications = [{
          user_email: recipientEmail,
          title: `Message from ${data.sender_name}`,
          message: data.content.substring(0, 100) + (data.content.length > 100 ? '...' : ''),
          type: 'general',
          dm_channel: data.channel
        }];
      }
    } else {
      // For group channels, notify all users except the sender — fetch once
      const users = await base44.asServiceRole.entities.User.list(undefined, 1000);
      // Nursery channel: restrict to the three designated leads only
      const recipientFilter = data.channel === 'Nursery'
        ? (u => NURSERY_LEADS.includes(u.email) && u.email !== data.sender_email)
        : (u => u.email !== data.sender_email);
      notifications = users
        .filter(recipientFilter)
        .map(u => ({
          user_email: u.email,
          title: `New message in ${data.channel}`,
          message: `${data.sender_name}: ${data.content.substring(0, 100)}${data.content.length > 100 ? '...' : ''}`,
          type: 'general'
        }));
    }

    if (notifications.length === 0) {
      return Response.json({ success: true, notified: 0 });
    }

    // Create in-app notifications
    await base44.asServiceRole.entities.Notification.bulkCreate(notifications);

    const pushTitle = isDM
      ? `💬 ${data.sender_name}`
      : `💬 ${data.sender_name} in ${data.channel}`;
    const pushBody = data.content.substring(0, 120) + (data.content.length > 120 ? '...' : '');

    // Fire dual push (FCM + Web Push) — skip for Nursery channel to avoid
    // duplicate notifications (the in-app Notification already triggers a
    // browser notification via BrowserNotificationDispatcher).
    if (data.channel !== 'Nursery') {
      await Promise.all(notifications.map(notif =>
        base44.asServiceRole.functions.invoke('sendDualPush', {
          recipient_email: notif.user_email,
          title: pushTitle,
          body: pushBody,
          dm_channel: isDM ? data.channel : undefined,
          notification_type: isDM ? 'dm' : 'group_message',
          allow_quick_reply: true,
        }).catch(err => console.log('Push failed for', notif.user_email, err.message))
      ));
    }

    return Response.json({ success: true, notified: notifications.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});