import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Scheduled monitor: reminds members assigned to the Marathon or Bonco posts
// to complete the Marathon Property Checklist before their shift begins.
// Fires once per matching assignment (~15 min before the shift starts) and is
// deduped by notification title + assignment_id. Runs every 5 minutes in
// the America/Los_Angeles timezone so it lines up with the service schedule.

const TZ = 'America/Los_Angeles';
const START_LEAD_MINUTES = 15;    // fire this far before the shift starts
const START_WINDOW_MINUTES = 30;  // don't fire more than this late after the start
const REMINDER_TITLE = '📋 Complete the Marathon Property Checklist';

function pacificNowMinutes(): number {
  const now = new Date();
  const pacificStr = now.toLocaleString('en-US', { timeZone: TZ });
  const pd = new Date(pacificStr);
  return pd.getHours() * 60 + pd.getMinutes();
}

function timeToMinutes(t: string | undefined | null): number | null {
  if (!t) return null;
  const parts = t.split(':').map(Number);
  if (parts.length < 1 || isNaN(parts[0])) return null;
  return parts[0] * 60 + (parts[1] || 0);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
    const currentMinutes = pacificNowMinutes();

    const assignments = await base44.asServiceRole.entities.Assignment.filter({
      service_date: todayStr,
    });

    const results: any[] = [];

    for (const assignment of assignments) {
      if (assignment.status === 'Declined') continue;
      if (!assignment.assigned_to_email) continue;
      // The Marathon Property Checklist widget is visible to members assigned
      // to the Marathon or Bonco posts — remind both before their shift.
      if (!/marathon|bonco/i.test(assignment.position_name || '')) continue;

      const startMinutes = timeToMinutes(assignment.start_time);
      if (startMinutes == null) continue;

      const due =
        currentMinutes >= startMinutes - START_LEAD_MINUTES &&
        currentMinutes <= startMinutes + START_WINDOW_MINUTES;
      if (!due) continue;

      // Dedupe — already reminded for this assignment?
      let existing: any[] = [];
      try {
        existing = await base44.asServiceRole.entities.Notification.filter({
          assignment_id: assignment.id,
        });
      } catch (e) {
        console.log(`Marathon dedupe lookup failed for ${assignment.id}:`, (e as Error).message);
        continue;
      }
      if (existing.some((n: any) => n.title === REMINDER_TITLE)) continue;

      const startTimeStr = assignment.start_time || 'your shift start';
      const positionName = assignment.position_name || 'your post';
      const body = `Your ${positionName} shift starts at ${startTimeStr}. Please complete the Marathon Property Checklist (secure all property posts).`;

      await sendMarathonAlert(base44, assignment.assigned_to_email, REMINDER_TITLE, body, assignment.id);
      results.push({ assignment_id: assignment.id, position: assignment.position_name });
    }

    console.log(`Marathon checklist reminders: ${results.length} sent for ${todayStr}`, results);
    return Response.json({
      success: true,
      assignments_checked: assignments.length,
      reminders_sent: results.length,
      results,
    });
  } catch (error) {
    console.error('checkMarathonChecklistReminder error:', error);
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});

async function sendMarathonAlert(base44: any, email: string, title: string, body: string, assignmentId: string) {
  await base44.asServiceRole.entities.Notification.create({
    user_email: email,
    title,
    message: body,
    type: 'assignment_reminder',
    assignment_id: assignmentId,
    read: false,
  }).catch(() => {});

  await base44.asServiceRole.functions.invoke('sendFCMNotification', {
    recipient_email: email,
    title,
    body,
    notification_type: 'assignment',
    click_url: '/PropertySecurity',
  }).catch((err: Error) => console.log(`FCM skipped for ${email}:`, err.message));

  await base44.asServiceRole.functions.invoke('sendWebPushService', {
    recipient_email: email,
    title,
    body,
    notification_type: 'assignment',
    click_url: '/PropertySecurity',
  }).catch((err: Error) => console.log(`WebPush skipped for ${email}:`, err.message));
}