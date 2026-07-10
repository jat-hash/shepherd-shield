import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    // Support both entity automation format {data, event} and direct format
    const alert = payload.data || payload.alert || payload;

    if (!alert?.is_active) {
      return Response.json({ success: false, message: 'Not an active alert' });
    }

    const allUsers = await base44.asServiceRole.entities.User.list();

    if (!allUsers || allUsers.length === 0) {
      return Response.json({ success: false, message: 'No users to notify' });
    }

    const title = `🚨 EMERGENCY: ${alert.alert_type}`;
    const body = alert.message;

    let fcmSuccessCount = 0;

    for (const user of allUsers) {
      // Always create in-app notification (works on all platforms including iOS)
      await base44.asServiceRole.entities.Notification.create({
        user_email: user.email,
        title,
        message: body,
        type: 'general',
        read: false
      }).catch(() => {});

      // Dual push (FCM + Web Push) — delivers background alert when app is closed
      const pushRes = await base44.asServiceRole.functions.invoke('sendDualPush', {
        recipient_email: user.email,
        title,
        body,
        alert_id: alert.id || '',
        notification_type: 'emergency',
        click_url: '/',
      }).catch(() => null);
      if (pushRes?.data?.success) fcmSuccessCount++;
    }

    console.log(`Emergency push broadcast: ${allUsers.length} in-app notifications, ${fcmSuccessCount} dual pushes (FCM+WebPush)`);

    return Response.json({
      success: true,
      total_users: allUsers.length,
      fcm_sent: fcmSuccessCount
    });
  } catch (error) {
    console.error('Error in broadcastEmergencyPush:', error);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});