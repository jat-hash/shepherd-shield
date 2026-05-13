import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Entity automation: triggers on Incident update.
// Sends in-app notifications + FCM push (Android/desktop) to all users.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    const incident = payload.data;
    if (!incident) return Response.json({ skipped: true, reason: 'No incident data' });

    const status = incident.status;
    if (status !== 'Resolved' && status !== 'Closed') {
      return Response.json({ skipped: true, reason: `Status is ${status}, not Resolved/Closed` });
    }

    // Only notify if status actually changed
    const oldStatus = payload.old_data?.status;
    if (oldStatus === status) {
      return Response.json({ skipped: true, reason: 'Status did not change' });
    }

    const firebaseServerKey = Deno.env.get('FIREBASE_SERVER_KEY');

    const title = status === 'Resolved'
      ? `✅ Incident Resolved: ${incident.title}`
      : `🔒 Incident Closed: ${incident.title}`;

    const body = `${incident.category} at ${incident.location || 'unknown location'} has been marked ${status}.`;

    const allUsers = await base44.asServiceRole.entities.User.list();

    await Promise.all(allUsers.map(async (user) => {
      // In-app notification — works on ALL platforms including iOS
      await base44.asServiceRole.entities.Notification.create({
        user_email: user.email,
        title,
        message: body,
        type: 'general',
        read: false
      }).catch(() => {});

      // FCM push — works on Android/desktop (iOS does not support FCM)
      if (firebaseServerKey) {
        const devices = await base44.asServiceRole.entities.UserDevice.filter({ user_email: user.email }).catch(() => []);
        const tokens = (devices || []).map(d => d.fcm_token).filter(Boolean);
        if (tokens.length > 0) {
          await fetch('https://fcm.googleapis.com/fcm/send', {
            method: 'POST',
            headers: {
              'Authorization': `key=${firebaseServerKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              registration_ids: tokens,
              notification: { title, body, sound: 'default' },
              data: { incidentId: incident.id || '' },
              priority: 'high'
            })
          }).catch(err => console.log(`FCM error for ${user.email}:`, err.message));
        }
      }
    }));

    console.log(`Incident ${status} notifications sent to ${allUsers.length} users`);
    return Response.json({ success: true, notified: allUsers.length, status });
  } catch (error) {
    console.error('notifyIncidentResolved error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});