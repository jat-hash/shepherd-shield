import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Scheduled background monitor: checks today's assignments against check-in
// status. If a team member's shift started more than GRACE_PERIOD minutes ago
// and they haven't checked in, sends a push notification to:
//   1. The late person (FCM + Web Push, so iPhone users like Chavez get Web Push)
//   2. Admins & designated leaders (so they're aware who is late)
// Uses late_notified flag on Assignment to prevent duplicate alerts.

const GRACE_PERIOD_MINUTES = 5;
const LEADER_EMAILS = [
  'wilbert.ryan@gmail.com',
  'pachecosmailbox@gmail.com',
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // ─── Determine "today" and current time in Pacific timezone ───
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
    const pacificStr = now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
    const pacificDate = new Date(pacificStr);
    const currentMinutes = pacificDate.getHours() * 60 + pacificDate.getMinutes();

    // ─── Fetch today's assignments ───
    const assignments = await base44.asServiceRole.entities.Assignment.filter({ service_date: todayStr });

    // ─── Find late assignments ───
    const lateAssignments = assignments.filter(a => {
      if (a.checked_in) return false;
      if (a.status === 'Declined') return false;
      if (a.late_notified) return false;
      const parts = (a.start_time || '').split(':').map(Number);
      if (parts.length < 1 || isNaN(parts[0])) return false;
      const startMinutes = parts[0] * 60 + (parts[1] || 0);
      return currentMinutes > startMinutes + GRACE_PERIOD_MINUTES;
    });

    if (lateAssignments.length === 0) {
      console.log(`Late check-in monitor: 0 late out of ${assignments.length} assignments for ${todayStr}`);
      return Response.json({ success: true, checked: assignments.length, late: 0 });
    }

    // ─── Fetch admins + leaders for notifications ───
    const allUsers = await base44.asServiceRole.entities.User.list();
    const leaders = allUsers.filter(u =>
      u.role === 'admin' ||
      LEADER_EMAILS.includes((u.email || '').toLowerCase())
    );

    const results = [];

    for (const assignment of lateAssignments) {
      const timeStr = assignment.start_time || 'scheduled time';
      const positionName = assignment.position_name || 'their position';
      const assigneeName = assignment.assigned_to_name || assignment.assigned_to_email || 'Team member';

      // ── 1. Notify the late person ──
      if (assignment.assigned_to_email) {
        const memberTitle = '⏰ You are late for your shift';
        const memberBody = `Your assignment for ${positionName} started at ${timeStr}. Please check in immediately.`;

        await base44.asServiceRole.entities.Notification.create({
          user_email: assignment.assigned_to_email,
          title: memberTitle,
          message: memberBody,
          type: 'assignment_reminder',
          assignment_id: assignment.id,
          read: false,
        }).catch(() => {});

        // FCM (Android/Chrome/Desktop)
        await base44.asServiceRole.functions.invoke('sendFCMNotification', {
          recipient_email: assignment.assigned_to_email,
          title: memberTitle,
          body: memberBody,
          notification_type: 'assignment',
          click_url: '/Assignments',
        }).catch(err => console.log(`FCM skipped for ${assignment.assigned_to_email}:`, err.message));

        // Web Push (iOS/Safari installed PWA — covers Chavez on iPhone)
        await base44.asServiceRole.functions.invoke('sendWebPushService', {
          recipient_email: assignment.assigned_to_email,
          title: memberTitle,
          body: memberBody,
          notification_type: 'assignment',
          click_url: '/Assignments',
        }).catch(err => console.log(`WebPush skipped for ${assignment.assigned_to_email}:`, err.message));
      }

      // ── 2. Notify admins & leaders ──
      const leaderTitle = `⏰ Late: ${assigneeName}`;
      const leaderBody = `${assigneeName} is late for ${positionName} (started at ${timeStr}).`;

      for (const leader of leaders) {
        await base44.asServiceRole.entities.Notification.create({
          user_email: leader.email,
          title: leaderTitle,
          message: leaderBody,
          type: 'general',
          read: false,
        }).catch(() => {});

        await base44.asServiceRole.functions.invoke('sendFCMNotification', {
          recipient_email: leader.email,
          title: leaderTitle,
          body: leaderBody,
          notification_type: 'assignment',
          click_url: '/Assignments',
        }).catch(err => console.log(`FCM skipped for ${leader.email}:`, err.message));

        await base44.asServiceRole.functions.invoke('sendWebPushService', {
          recipient_email: leader.email,
          title: leaderTitle,
          body: leaderBody,
          notification_type: 'assignment',
          click_url: '/Assignments',
        }).catch(err => console.log(`WebPush skipped for ${leader.email}:`, err.message));
      }

      // ── Mark as notified to prevent duplicates ──
      await base44.asServiceRole.entities.Assignment.update(assignment.id, { late_notified: true });

      results.push({ id: assignment.id, assignee: assigneeName, position: positionName, started_at: timeStr });
    }

    console.log(`Late check-in monitor: ${lateAssignments.length} late assignments detected`, results);
    return Response.json({ success: true, checked: assignments.length, late: lateAssignments.length, results });

  } catch (error) {
    console.error('checkLateCheckIns error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});