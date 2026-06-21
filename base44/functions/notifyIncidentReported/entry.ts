import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { incident } = await req.json();
    if (!incident) {
      return Response.json({ error: 'incident data required' }, { status: 400 });
    }

    const title = `🚨 New Incident: ${incident.severity || 'Report'}`;
    const body = `${incident.title}${incident.location ? ' — ' + incident.location : ''}`;

    const firebaseServerKey = Deno.env.get('FIREBASE_SERVER_KEY');
    const allUsers = await base44.asServiceRole.entities.User.list();

    let fcmSent = 0;
    let notifCreated = 0;

    for (const u of allUsers) {
      // In-app notification (works on all platforms including iOS)
      await base44.asServiceRole.entities.Notification.create({
        user_email: u.email,
        title,
        message: body,
        type: 'general',
        read: false,
      }).catch(() => {});
      notifCreated++;

      // FCM push (Android/desktop — skipped on iOS)
      if (firebaseServerKey) {
        const devices = await base44.asServiceRole.entities.UserDevice.filter({ user_email: u.email }).catch(() => []);
        const tokens = (devices || []).map(d => d.fcm_token).filter(Boolean);
        if (tokens.length > 0) {
          const fcmRes = await fetch('https://fcm.googleapis.com/fcm/send', {
            method: 'POST',
            headers: {
              'Authorization': `key=${firebaseServerKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              registration_ids: tokens,
              notification: { title, body, sound: 'default' },
              data: { incident_id: incident.id || '', click_url: '/Incidents' },
              priority: 'high',
            }),
          }).catch(() => null);
          if (fcmRes?.ok) fcmSent++;
        }
      }
    }

    console.log(`Incident reported by ${user.email}: ${notifCreated} in-app notifications, ${fcmSent} FCM pushes`);

    return Response.json({ success: true, notif_created: notifCreated, fcm_sent: fcmSent });
  } catch (error) {
    console.error('Error in notifyIncidentReported:', error);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});