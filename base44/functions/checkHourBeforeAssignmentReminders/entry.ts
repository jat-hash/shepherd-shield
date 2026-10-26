import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

// Scheduled monitor: reminds members about a service assignment roughly one hour
// before their shift starts. Runs every 5 minutes in Pacific time so it lines up
// with the local wall-clock service schedule, and is deduped per assignment
// (notification title + assignment_id) so each member is reminded exactly once.

const TZ = 'America/Los_Angeles';
const LEAD_MINUTES = 60;   // target: one hour before the shift starts
const WINDOW_EARLY = 5;    // may fire this many minutes before the one-hour mark
const WINDOW_LATE = 15;    // ...and this many minutes after, so a missed run still catches it
const REMINDER_TITLE = '⏰ Your assignment starts in 1 hour';

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

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
    const currentMinutes = pacificNowMinutes();

    const assignments = await base44.asServiceRole.entities.Assignment.filter({
      service_date: todayStr,
    });

    const results: any[] = [];

    for (const assignment of assignments) {
      if (assignment.status === 'Declined') continue;
      if (assignment.checked_in) continue;
      if (!assignment.assigned_to_email) continue;

      const startMinutes = timeToMinutes(assignment.start_time);
      if (startMinutes == null) continue;

      const due =
        currentMinutes >= startMinutes - LEAD_MINUTES - WINDOW_EARLY &&
        currentMinutes <= startMinutes - LEAD_MINUTES + WINDOW_LATE;
      if (!due) continue;

      // Dedupe — already reminded for this assignment?
      let existing: any[] = [];
      try {
        existing = await base44.asServiceRole.entities.Notification.filter({
          assignment_id: assignment.id,
        });
      } catch (e) {
        // If the lookup fails, skip rather than risk duplicate reminders.
        console.log(`Assignment reminder dedupe lookup failed for ${assignment.id}:`, (e as Error).message);
        continue;
      }
      if (existing.some((n: any) => n.title === REMINDER_TITLE)) continue;

      const positionName = assignment.position_name || 'your post';
      const startTimeStr = assignment.start_time || 'the scheduled time';
      const serviceLabel = assignment.service_type ? ` (${assignment.service_type})` : '';
      const body = `Your ${positionName} shift starts at ${startTimeStr}${serviceLabel}. Please head to your post and check in.`;

      await base44.asServiceRole.entities.Notification.create({
        user_email: assignment.assigned_to_email,
        title: REMINDER_TITLE,
        message: body,
        type: 'assignment_reminder',
        assignment_id: assignment.id,
        read: false,
      }).catch(() => {});

      // Single push via sendDualPush (FCM if available, else Web Push) so members
      // registered on both channels don't receive duplicate push notifications.
      await base44.asServiceRole.functions.invoke('sendDualPush', {
        recipient_email: assignment.assigned_to_email,
        title: REMINDER_TITLE,
        body,
        notification_type: 'assignment',
        click_url: '/Dashboard',
      }).catch((err: Error) => console.log(`Push skipped for ${assignment.assigned_to_email}:`, err.message));

      results.push({ assignment_id: assignment.id, position: positionName, start_time: startTimeStr });
    }

    console.log(`One-hour assignment reminders: ${results.length} sent for ${todayStr}`, results);
    return Response.json({
      success: true,
      assignments_checked: assignments.length,
      reminders_sent: results.length,
      results,
    });
  } catch (error) {
    console.error('checkHourBeforeAssignmentReminders error:', error);
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}