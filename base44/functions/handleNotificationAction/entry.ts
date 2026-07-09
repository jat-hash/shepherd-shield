import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Handles action button taps from push notifications (app closed).
// Authenticated via FCM token (validated against UserDevice table) — same
// pattern as sendQuickReply. No shared secret needed.
// Actions: 'acknowledge' (respond to incident), 'request_help' (backup),
//          'mark_safe' / 'need_help' (emergency safety check-in)
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { action, incident_id, alert_id, fcm_token, sender_email, sender_name } = await req.json();

    // Auth: try user session first (forwarded from open tab), then FCM token
    const user = await base44.auth.me().catch(() => null);
    let userEmail = user?.email || null;
    let userName = user?.display_name || user?.full_name || null;

    if (!userEmail) {
      if (!fcm_token) {
        return Response.json({ error: 'Unauthorized — no session or token' }, { status: 401 });
      }
      const devices = await base44.asServiceRole.entities.UserDevice.filter({ fcm_token });
      if (devices.length === 0) {
        return Response.json({ error: 'Invalid device token' }, { status: 401 });
      }
      userEmail = devices[0].user_email;
      userName = sender_name || userEmail.split('@')[0];
    }

    if (!action) {
      return Response.json({ error: 'action required' }, { status: 400 });
    }

    // --- Acknowledge incident: add responder, set Under Review, notify team ---
    if (action === 'acknowledge') {
      if (incident_id) {
        const incident = await base44.asServiceRole.entities.Incident.get(incident_id).catch(() => null);
        if (incident) {
          const responders = incident.responders || [];
          if (!responders.includes(userEmail)) responders.push(userEmail);
          const updates = { responders };
          if (incident.status === 'Open') updates.status = 'Under Review';
          await base44.asServiceRole.entities.Incident.update(incident_id, updates);
        }
      }
      await base44.asServiceRole.entities.TeamMessage.create({
        channel: 'General',
        content: `✅ ${userName} acknowledged the incident${incident_id ? '' : ''} and is responding.`,
        sender_name: userName,
        sender_email: userEmail,
        message_type: 'alert',
      }).catch(() => {});
      return Response.json({ success: true, action, message: 'Incident acknowledged — team notified' });
    }

    // --- Request help: broadcast to all team members via chat + push ---
    if (action === 'request_help') {
      const incident = incident_id
        ? await base44.asServiceRole.entities.Incident.get(incident_id).catch(() => null)
        : null;
      const helpText = incident
        ? `🆘 ${userName} is requesting backup at: ${incident.title}${incident.location ? ' — ' + incident.location : ''}`
        : `🆘 ${userName} is requesting backup immediately.`;
      await base44.asServiceRole.entities.TeamMessage.create({
        channel: 'General',
        content: helpText,
        sender_name: userName,
        sender_email: userEmail,
        message_type: 'alert',
      });
      // Push the help request to all other team members
      const allUsers = await base44.asServiceRole.entities.User.list();
      await Promise.all(allUsers.filter(u => u.email !== userEmail).map(u =>
        base44.asServiceRole.functions.invoke('sendFCMNotification', {
          recipient_email: u.email,
          title: '🆘 Backup Requested',
          body: `${userName} needs help now`,
          notification_type: 'incident',
          click_url: '/Communications',
        }).catch(() => null)
      ));
      return Response.json({ success: true, action, message: 'Help request sent to all team members' });
    }

    // --- Mark safe: safety check-in during emergency ---
    if (action === 'mark_safe') {
      if (alert_id) {
        await base44.asServiceRole.entities.SafetyCheckIn.create({
          alert_id,
          user_email: userEmail,
          user_name: userName,
          status: 'safe',
        }).catch(() => {});
      }
      return Response.json({ success: true, action, message: 'Marked as safe' });
    }

    // --- Need help: safety check-in + broadcast during emergency ---
    if (action === 'need_help') {
      if (alert_id) {
        await base44.asServiceRole.entities.SafetyCheckIn.create({
          alert_id,
          user_email: userEmail,
          user_name: userName,
          status: 'need_help',
        }).catch(() => {});
      }
      await base44.asServiceRole.entities.TeamMessage.create({
        channel: 'General',
        content: `🆘 ${userName} needs help immediately (emergency alert response)`,
        sender_name: userName,
        sender_email: userEmail,
        message_type: 'alert',
      }).catch(() => {});
      return Response.json({ success: true, action, message: 'Help request sent' });
    }

    return Response.json({ error: 'Unknown action: ' + action }, { status: 400 });
  } catch (error) {
    console.error('Error in handleNotificationAction:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});