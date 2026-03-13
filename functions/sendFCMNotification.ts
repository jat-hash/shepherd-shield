import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const { recipient_email, title, body, alert_id } = await req.json();

    if (!recipient_email || !title || !body) {
      return Response.json({ error: 'recipient_email, title, and body required' }, { status: 400 });
    }

    const firebaseServerKey = Deno.env.get('FIREBASE_SERVER_KEY');
    if (!firebaseServerKey) {
      return Response.json({ error: 'FIREBASE_SERVER_KEY not configured' }, { status: 500 });
    }

    // Look up FCM tokens for this user
    const devices = await base44.asServiceRole.entities.UserDevice.filter({ user_email: recipient_email });

    if (!devices || devices.length === 0) {
      console.log(`No FCM tokens found for ${recipient_email}`);
      return Response.json({ success: false, error: 'No device tokens for user' });
    }

    const tokens = devices.map(d => d.fcm_token).filter(Boolean);
    if (tokens.length === 0) {
      return Response.json({ success: false, error: 'No valid tokens' });
    }

    // Send via Firebase Legacy HTTP API
    const fcmRes = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Authorization': `key=${firebaseServerKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        registration_ids: tokens,
        notification: {
          title,
          body,
          sound: 'default'
        },
        data: {
          alertId: alert_id || ''
        },
        priority: 'high'
      })
    });

    const fcmData = await fcmRes.json();

    if (!fcmRes.ok) {
      console.error(`FCM error for ${recipient_email}:`, JSON.stringify(fcmData));
      return Response.json({ success: false, error: fcmData.error || 'FCM send failed' }, { status: 500 });
    }

    console.log(`FCM sent to ${recipient_email} (${tokens.length} device(s)), success: ${fcmData.success}, failure: ${fcmData.failure}`);

    return Response.json({ success: true, recipient: recipient_email, result: fcmData });
  } catch (error) {
    console.error('Error in sendFCMNotification:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});