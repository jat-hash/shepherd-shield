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

    const allUsers = await base44.asServiceRole.entities.User.list();

    let fcmSent = 0;
    let notifCreated = 0;

    for (const u of allUsers) {
      // In-app notification (works on all platforms including iOS)
      await base44.asServiceRole.entities.Notification.create({
        user_email: u.email,
        title,
        message: body,
        type: 'incident',
        read: false,
      }).catch(() => {});
      notifCreated++;

      // FCM v1 push — delivers background alert when app is closed
      const fcmRes = await base44.asServiceRole.functions.invoke('sendFCMNotification', {
        recipient_email: u.email,
        title,
        body,
        notification_type: 'incident',
        incident_id: incident.id,
        click_url: '/Incidents',
      }).catch(() => null);
      if (fcmRes?.data?.success) fcmSent++;
    }

    console.log(`Incident reported by ${user.email}: ${notifCreated} in-app notifications, ${fcmSent} FCM pushes`);

    return Response.json({ success: true, notif_created: notifCreated, fcm_sent: fcmSent });
  } catch (error) {
    console.error('Error in notifyIncidentReported:', error);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});