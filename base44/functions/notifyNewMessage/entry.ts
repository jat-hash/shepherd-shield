import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event, data } = await req.json();

    if (event.type !== 'create' || !data) {
      return Response.json({ success: true });
    }

    // Check if this is a direct message
    const isDM = data.channel?.startsWith('DM: ');
    let notifications = [];

    if (isDM) {
      // For DM, only notify the recipient
      const withoutPrefix = data.channel.replace('DM: ', '');
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
      // For group channels, notify all users except the sender
      const users = await base44.asServiceRole.entities.User.list();
      notifications = users
        .filter(u => u.email !== data.sender_email)
        .map(u => ({
          user_email: u.email,
          title: `New message in ${data.channel}`,
          message: `${data.sender_name}: ${data.content.substring(0, 100)}${data.content.length > 100 ? '...' : ''}`,
          type: 'general'
        }));
    }

    if (notifications.length > 0) {
      await base44.asServiceRole.entities.Notification.bulkCreate(notifications);

      const pushTitle = isDM
        ? `💬 ${data.sender_name}`
        : `💬 ${data.sender_name} in ${data.channel}`;
      const pushBody = data.content.substring(0, 120) + (data.content.length > 120 ? '...' : '');

      // Fetch all users once for phone lookups
      const allUsers = await base44.asServiceRole.entities.User.list();

      for (const notif of notifications) {
        // FCM push
        base44.functions.invoke('sendFCMNotification', {
          recipient_email: notif.user_email,
          title: pushTitle,
          body: pushBody,
          dm_channel: isDM ? data.channel : undefined,
          notification_type: isDM ? 'dm' : 'group_message',
        }).catch(err => console.log('FCM push failed for', notif.user_email, err.message));

        // WhatsApp for all messages (DM and group)
        const recipientUser = allUsers.find(u => u.email === notif.user_email);
        const phone = recipientUser?.phone_number || recipientUser?.data?.phone_number;
        if (phone) {
          base44.functions.invoke('sendWhatsApp', {
            to: phone,
            message: `${pushTitle}\n\n${pushBody}`
          }).catch(err => console.log('WhatsApp notification failed for', notif.user_email, err.message));
        } else {
          console.log(`WhatsApp skipped for ${notif.user_email}: no phone on file`);
        }
      }
    }

    return Response.json({ success: true, notified: notifications.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});