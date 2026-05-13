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

    const firebaseServerKey = Deno.env.get('FIREBASE_SERVER_KEY');
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

      // Send FCM push if we have a server key (works on Android/desktop, skipped on iOS)
      if (firebaseServerKey) {
        const devices = await base44.asServiceRole.entities.UserDevice.filter({ user_email: user.email }).catch(() => []);
        const tokens = (devices || []).map(d => d.fcm_token).filter(Boolean);

        if (tokens.length > 0) {
          const fcmRes = await fetch('https://fcm.googleapis.com/fcm/send', {
            method: 'POST',
            headers: {
              'Authorization': `key=${firebaseServerKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              registration_ids: tokens,
              notification: { title, body, sound: 'default' },
              data: { alertId: alert.id || '' },
              priority: 'high'
            })
          }).catch(() => null);

          if (fcmRes?.ok) fcmSuccessCount++;
        }
      }
    }

    console.log(`Emergency push broadcast: ${allUsers.length} in-app notifications, ${fcmSuccessCount} FCM pushes`);

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