import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Entity automation: triggers on Incident create OR update.
// Notifies team members assigned to today's service + the incident reporter.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    const incident = payload.data;
    const oldIncident = payload.old_data;
    const eventType = payload.event?.type || 'update';

    if (!incident) return Response.json({ skipped: true, reason: 'No incident data' });

    // Determine what changed
    const oldStatus = oldIncident?.status;
    const newStatus = incident.status;
    const statusChanged = oldStatus && oldStatus !== newStatus;
    const oldAttachments = oldIncident?.attachments || [];
    const newAttachments = incident.attachments || [];
    const attachmentAdded = newAttachments.length > oldAttachments.length;

    // Build notification message
    const statusEmoji = { 'Open': '🔴', 'Under Review': '🟡', 'Resolved': '✅', 'Closed': '🔒' };

    let title, body;

    if (eventType === 'create') {
      title = `🔴 New Incident Report: ${incident.title}`;
      body = `${incident.category} reported at ${incident.location || 'unknown location'}. Severity: ${incident.severity || 'Unknown'}.`;
    } else if (attachmentAdded && !statusChanged) {
      title = `📎 Document Added: ${incident.title}`;
      body = `A new attachment was added to the incident "${incident.title}" (${incident.category} at ${incident.location || 'unknown location'}).`;
    } else if (statusChanged) {
      title = `${statusEmoji[newStatus] || '📋'} Incident Update: ${incident.title}`;
      body = `Status changed from "${oldStatus}" to "${newStatus}" — ${incident.category} at ${incident.location || 'unknown location'}.`;
    } else {
      title = `📋 Incident Updated: ${incident.title}`;
      body = `"${incident.title}" (${incident.category}) has been updated. Status: ${newStatus || 'Unknown'}.`;
    }

    // Find team members assigned to today's service date
    const today = new Date().toISOString().split('T')[0];
    const incidentDate = incident.incident_date || today;

    const [assignmentsToday, allUsers] = await Promise.all([
      base44.asServiceRole.entities.Assignment.filter({ service_date: incidentDate }),
      base44.asServiceRole.entities.User.list()
    ]);

    // Build set of emails to notify: assigned members + reporter
    const emailsToNotify = new Set();

    // Add all members assigned on the incident date
    for (const assignment of assignmentsToday) {
      if (assignment.assigned_to_email) emailsToNotify.add(assignment.assigned_to_email);
    }

    // Add the reporter if we can match them
    if (incident.reported_by) {
      const reporter = allUsers.find(u =>
        u.email === incident.reported_by ||
        u.full_name === incident.reported_by ||
        (u.display_name && u.display_name === incident.reported_by)
      );
      if (reporter) emailsToNotify.add(reporter.email);
    }

    // Also add responders
    for (const responder of (incident.responders || [])) {
      const match = allUsers.find(u => u.email === responder || u.full_name === responder);
      if (match) emailsToNotify.add(match.email);
    }

    // Fallback: if no assignments found, notify all users
    const targetUsers = emailsToNotify.size > 0
      ? allUsers.filter(u => emailsToNotify.has(u.email))
      : allUsers;

    const firebaseServerKey = Deno.env.get('FIREBASE_SERVER_KEY');

    await Promise.all(targetUsers.map(async (user) => {
      // In-app notification (works on all platforms including iOS)
      await base44.asServiceRole.entities.Notification.create({
        user_email: user.email,
        title,
        message: body,
        type: 'general',
        read: false
      }).catch(() => {});

      // FCM push (Android/desktop)
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

    console.log(`Incident notification sent to ${targetUsers.length} members (${emailsToNotify.size} targeted, ${assignmentsToday.length} assignments found for ${incidentDate})`);
    return Response.json({ success: true, notified: targetUsers.length, event: eventType });
  } catch (error) {
    console.error('notifyIncidentResolved error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});