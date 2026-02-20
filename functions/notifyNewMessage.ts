import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event, data } = await req.json();

    if (event.type !== 'create' || !data) {
      return Response.json({ success: true });
    }

    // Get all users
    const users = await base44.asServiceRole.entities.User.list();
    
    // Create notifications for all users except the sender
    const notifications = users
      .filter(u => u.email !== data.sender_email)
      .map(u => ({
        user_email: u.email,
        title: `New message in ${data.channel}`,
        message: `${data.sender_name}: ${data.content.substring(0, 100)}${data.content.length > 100 ? '...' : ''}`,
        type: 'general'
      }));

    if (notifications.length > 0) {
      await base44.asServiceRole.entities.Notification.bulkCreate(notifications);
    }

    return Response.json({ success: true, notified: notifications.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});