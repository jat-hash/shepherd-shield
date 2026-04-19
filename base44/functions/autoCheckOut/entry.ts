import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Get all assignments that are checked in but not checked out
    const assignments = await base44.asServiceRole.entities.Assignment.filter({
      checked_in: true,
      checked_out: false
    });

    const now = new Date();
    let autoCheckedOut = 0;

    for (const assignment of assignments) {
      if (!assignment.service_date || !assignment.end_time) continue;

      // Parse end time on service date
      const [endHour, endMin] = assignment.end_time.split(":").map(Number);
      const endDateTime = new Date(`${assignment.service_date}T${String(endHour).padStart(2,'0')}:${String(endMin).padStart(2,'0')}:00`);

      // Auto check-out if current time is more than 1 hour past end time
      const oneHourAfterEnd = new Date(endDateTime.getTime() + 60 * 60 * 1000);

      if (now > oneHourAfterEnd) {
        const checkOutTime = oneHourAfterEnd.toISOString();
        await base44.asServiceRole.entities.Assignment.update(assignment.id, {
          checked_out: true,
          check_out_time: checkOutTime
        });
        autoCheckedOut++;
        console.log(`Auto checked out: ${assignment.assigned_to_name} from ${assignment.position_name} on ${assignment.service_date}`);
      }
    }

    return Response.json({ success: true, auto_checked_out: autoCheckedOut });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});