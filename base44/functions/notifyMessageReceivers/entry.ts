import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { message_id, channel, sender_name, content, sender_email } = await req.json();

    if (!message_id || !channel || !sender_name) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get all team members except sender
    const users = await base44.asServiceRole.entities.User.list();
    const recipients = users.filter(u => u.email !== sender_email && u.role);

    if (!recipients.length) {
      return Response.json({ success: true, notified: 0 });
    }

    // Send push (FCM + Web Push) to each recipient
    const promises = recipients.map(recipient =>
      base44.asServiceRole.functions.invoke('sendDualPush', {
        recipient_email: recipient.email,
        title: `New message in ${channel} from ${sender_name}`,
        body: content?.substring(0, 100) || 'Sent a file',
        notification_type: 'group_message',
        dm_channel: channel,
      }).catch(() => {})
    );

    await Promise.all(promises);

    return Response.json({ success: true, notified: recipients.length });
  } catch (error) {
    console.error('Error in notifyMessageReceivers:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});