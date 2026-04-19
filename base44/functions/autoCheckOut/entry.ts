import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const now = new Date();

    // ── 1. Auto check-out assignments 1 hour past end time ──────────────────
    const assignments = await base44.asServiceRole.entities.Assignment.filter({
      checked_in: true,
      checked_out: false
    });

    let autoCheckedOut = 0;

    for (const assignment of assignments) {
      if (!assignment.service_date || !assignment.end_time) continue;

      const [endHour, endMin] = assignment.end_time.split(":").map(Number);
      const endDateTime = new Date(`${assignment.service_date}T${String(endHour).padStart(2,'0')}:${String(endMin).padStart(2,'0')}:00`);
      const oneHourAfterEnd = new Date(endDateTime.getTime() + 60 * 60 * 1000);
      const fortyFiveMinAfterEnd = new Date(endDateTime.getTime() + 45 * 60 * 1000);

      if (now > oneHourAfterEnd) {
        // Auto check-out
        await base44.asServiceRole.entities.Assignment.update(assignment.id, {
          checked_out: true,
          check_out_time: oneHourAfterEnd.toISOString()
        });
        autoCheckedOut++;
        console.log(`Auto checked out: ${assignment.assigned_to_name} from ${assignment.position_name}`);
      } else if (now > fortyFiveMinAfterEnd) {
        // Alert — haven't checked out yet at 45 min past end
        // Only notify once: check if we already sent this alert by looking for an existing notification
        const existing = await base44.asServiceRole.entities.Notification.filter({
          user_email: assignment.assigned_to_email,
          assignment_id: assignment.id,
          type: "assignment_reminder",
          title: "Please Check Out"
        });

        if (!existing || existing.length === 0) {
          await base44.asServiceRole.entities.Notification.create({
            user_email: assignment.assigned_to_email,
            title: "Please Check Out",
            message: `Your ${assignment.service_type || 'service'} assignment ended. Please check out from the app.`,
            type: "assignment_reminder",
            assignment_id: assignment.id,
            read: false
          });
          console.log(`Sent checkout reminder to ${assignment.assigned_to_name}`);
        }
      }
    }

    // ── 2. Alert for unreturned equipment 1 hour past service end ────────────
    // Find checked-out equipment
    const equipment = await base44.asServiceRole.entities.Equipment.filter({
      checked_out: true
    });

    // Get today's assignments to know when service ended
    const today = now.toISOString().split("T")[0];
    const todayAssignments = await base44.asServiceRole.entities.Assignment.filter({
      service_date: today
    });

    // Find the latest end time among today's assignments
    let latestServiceEnd = null;
    for (const a of todayAssignments) {
      if (!a.end_time) continue;
      const [h, m] = a.end_time.split(":").map(Number);
      const endDT = new Date(`${today}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`);
      if (!latestServiceEnd || endDT > latestServiceEnd) latestServiceEnd = endDT;
    }

    if (latestServiceEnd) {
      const oneHourAfterService = new Date(latestServiceEnd.getTime() + 60 * 60 * 1000);

      if (now > oneHourAfterService) {
        for (const item of equipment) {
          if (!item.checked_out_by) continue;

          // Find the user email for the person who checked out the equipment
          const users = await base44.asServiceRole.entities.User.filter({ full_name: item.checked_out_by });
          const userEmail = users?.[0]?.email;
          if (!userEmail) continue;

          // Only notify once
          const existing = await base44.asServiceRole.entities.Notification.filter({
            user_email: userEmail,
            type: "general",
            title: "Return Equipment"
          });

          // Check if notification was already sent in last 2 hours (avoid spam)
          const recentAlert = existing?.find(n => {
            const created = new Date(n.created_date);
            return (now - created) < 2 * 60 * 60 * 1000;
          });

          if (!recentAlert) {
            await base44.asServiceRole.entities.Notification.create({
              user_email: userEmail,
              title: "Return Equipment",
              message: `Please return "${item.name}" — service has ended and equipment should be checked back in.`,
              type: "general",
              read: false
            });
            console.log(`Sent equipment return alert to ${item.checked_out_by} for ${item.name}`);
          }
        }
      }
    }

    return Response.json({ success: true, auto_checked_out: autoCheckedOut });
  } catch (error) {
    console.error('autoCheckOut error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});