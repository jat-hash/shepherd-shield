import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Scheduled monitor: sends radio reminders to members assigned to a position.
//   1. ~15 min BEFORE the assignment start → "check out radios" (pick up a radio)
//   2. ~10 min BEFORE the assignment end   → "check in radios" (return the radio)
//
// Runs every 5 minutes. Duplicate sends are prevented by checking whether a
// Notification with the matching title already exists for that assignment.
// Times are evaluated in the America/Los_Angeles timezone so the reminders
// line up with the local wall-clock service schedule.

const START_LEAD_MINUTES = 15;   // pick-up reminder fires this far before start
const END_LEAD_MINUTES = 10;      // return reminder fires this far before end
const START_WINDOW_MINUTES = 45;  // don't fire pick-up reminder more than this late after start
const END_WINDOW_MINUTES = 30;    // don't fire return reminder more than this late after end

const CHECKOUT_TITLE = '📻 Check Out Your Radio';
const CHECKIN_TITLE = '📻 Check In Your Radio';

const TZ = 'America/Los_Angeles';

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

      const startMinutes = timeToMinutes(assignment.start_time);
      const endMinutes = timeToMinutes(assignment.end_time);
      if (startMinutes == null || endMinutes == null) continue;

      const positionName = assignment.position_name || 'your position';
      const startTimeStr = assignment.start_time || 'scheduled time';
      const endTimeStr = assignment.end_time || 'scheduled time';

      // Fetch existing notifications for this assignment to dedupe by title.
      let existing: any[] = [];
      try {
        existing = await base44.asServiceRole.entities.Notification.filter({
          assignment_id: assignment.id,
        });
      } catch (e) {
        // If the lookup fails, skip this assignment rather than risk dupes.
        console.log(`Radio dedupe lookup failed for ${assignment.id}:`, (e as Error).message);
        continue;
      }
      const existingTitles = new Set(existing.map((n: any) => n.title));

      // ── 1. Pick-up radio reminder (15 min before start) ──
      const checkoutDue =
        currentMinutes >= startMinutes - START_LEAD_MINUTES &&
        currentMinutes <= startMinutes + START_WINDOW_MINUTES;
      if (checkoutDue && !existingTitles.has(CHECKOUT_TITLE)) {
        const body = `Your ${positionName} shift starts at ${startTimeStr}. Please check out (pick up) your radio now.`;
        await sendRadioAlert(base44, assignment.assigned_to_email, CHECKOUT_TITLE, body, assignment.id);
        results.push({ assignment_id: assignment.id, type: 'checkout', position: positionName });
      }

      // ── 2. Return radio reminder (10 min before end) ──
      const checkinDue =
        currentMinutes >= endMinutes - END_LEAD_MINUTES &&
        currentMinutes <= endMinutes + END_WINDOW_MINUTES;
      if (checkinDue && !existingTitles.has(CHECKIN_TITLE)) {
        const body = `Your ${positionName} shift ends at ${endTimeStr}. Please check in (return) your radio now.`;
        await sendRadioAlert(base44, assignment.assigned_to_email, CHECKIN_TITLE, body, assignment.id);
        results.push({ assignment_id: assignment.id, type: 'checkin', position: positionName });
      }
    }

    console.log(`Radio reminders: ${results.length} sent for ${todayStr}`, results);
    return Response.json({
      success: true,
      assignments_checked: assignments.length,
      reminders_sent: results.length,
      results,
    });
  } catch (error) {
    console.error('checkRadioReminders error:', error);
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});

async function sendRadioAlert(base44: any, email: string, title: string, body: string, assignmentId: string) {
  // In-app notification
  await base44.asServiceRole.entities.Notification.create({
    user_email: email,
    title,
    message: body,
    type: 'assignment_reminder',
    assignment_id: assignmentId,
    read: false,
  }).catch(() => {});

  // Single push via sendDualPush (FCM if available, else Web Push) so members
  // registered on both channels don't receive duplicate push notifications.
  await base44.asServiceRole.functions.invoke('sendDualPush', {
    recipient_email: email,
    title,
    body,
    notification_type: 'assignment',
    click_url: '/Dashboard',
  }).catch((err: Error) => console.log(`Push skipped for ${email}:`, err.message));
}