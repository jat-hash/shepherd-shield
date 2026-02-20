import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Get assignments for tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const assignments = await base44.asServiceRole.entities.Assignment.filter({
      service_date: tomorrowStr
    });

    let notificationsSent = 0;

    for (const assignment of assignments) {
      // Check if user hasn't checked in and status is not declined
      if (!assignment.checked_in && assignment.status !== 'Declined') {
        const title = '🔔 Upcoming Assignment Reminder';
        const message = `You have an assignment tomorrow: ${assignment.position_name} at ${assignment.start_time}. Service: ${assignment.service_type}`;

        await base44.asServiceRole.functions.invoke('sendNotification', {
          user_email: assignment.assigned_to_email,
          title,
          message,
          type: 'assignment_reminder',
          assignment_id: assignment.id
        });

        notificationsSent++;
      }
    }

    return Response.json({
      success: true,
      assignments_checked: assignments.length,
      notifications_sent: notificationsSent
    });

  } catch (error) {
    console.error('Check upcoming assignments error:', error);
    return Response.json({ 
      success: false,
      error: error.message 
    }, { status: 500 });
  }
});