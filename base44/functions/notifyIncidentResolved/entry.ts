import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Entity automation: triggers on Incident update.
// Sends in-app notifications + FCM push to all users on any status change.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    const incident = payload.data;
    const oldIncident = payload.old_data;

    if (!incident) return Response.json({ skipped: true, reason: 'No incident data' });

    // Notify on any field change — build a meaningful message
    const oldStatus = oldIncident?.status;
    const newStatus = incident.status;
    const statusChanged = oldStatus && oldStatus !== newStatus;

    const statusEmoji = {
      'Open': '🔴',
      'Under Review': '🟡',
      'Resolved': '✅',
      'Closed': '🔒'
    };

    const title = statusChanged
      ? `${statusEmoji[newStatus] || '📋'} Incident Update: ${incident.title}`
      : `📋 Incident Updated: ${incident.title}`;

    const body = statusChanged
      ? `Status changed from "${oldStatus}" to "${newStatus}" — ${incident.category} at ${incident.location || 'unknown location'}.`
      : `"${incident.title}" (${incident.category}) has been updated. Current status: ${newStatus || 'Unknown'}.`;

    const firebaseServerKey = Deno.env.get('FIREBASE_SERVER_KEY');
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

      // FCM push — works on Android/desktop
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

    console.log(`Incident update notifications sent to ${allUsers.length} users`);
    return Response.json({ success: true, notified: allUsers.length, statusChanged, newStatus });
  } catch (error) {
    console.error('notifyIncidentResolved error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});