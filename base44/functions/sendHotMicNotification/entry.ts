import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { message, triggered_by } = body;

    if (!message || !message.trim()) {
      return Response.json({ error: 'message is required' }, { status: 400 });
    }

    // Find all currently checked-in users via LiveLocation (is_active = true)
    const checkedIn = await base44.asServiceRole.entities.LiveLocation.filter({ is_active: true });

    if (!checkedIn || checkedIn.length === 0) {
      return Response.json({ success: true, sent: 0, message: 'No checked-in users found' });
    }

    const sender = triggered_by || user.full_name || user.email || 'Leader';
    const title = '🎙️ Hot Mic';
    const body_text = `${sender}: ${message.trim()}`;

    let notifCreated = 0;
    let pushSent = 0;

    for (const loc of checkedIn) {
      // In-app notification
      await base44.asServiceRole.entities.Notification.create({
        user_email: loc.user_email,
        title,
        message: body_text,
        type: 'general',
        read: false,
      }).catch(() => {});
      notifCreated++;

      // Dual push (FCM + Web Push) for background delivery
      const pushRes = await base44.asServiceRole.functions.invoke('sendDualPush', {
        recipient_email: loc.user_email,
        title,
        body: body_text,
        notification_type: 'general',
        click_url: '/Communications',
      }).catch(() => null);
      if (pushRes?.data?.success) pushSent++;
    }

    console.log(`Hot Mic sent by ${user.email} to ${checkedIn.length} checked-in users (${notifCreated} in-app, ${pushSent} push)`);

    return Response.json({
      success: true,
      sent: checkedIn.length,
      in_app: notifCreated,
      push_delivered: pushSent,
      recipients: checkedIn.map(l => l.user_name || l.user_email),
    });
  } catch (error) {
    console.error('Error in sendHotMicNotification:', error);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});