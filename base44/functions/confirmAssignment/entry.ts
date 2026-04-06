import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { assignment_id } = await req.json();
    
    if (!assignment_id) {
      return Response.json({ error: 'Missing assignment_id' }, { status: 400 });
    }

    const assignment = await base44.entities.Assignment.get(assignment_id);
    if (!assignment) {
      return Response.json({ error: 'Assignment not found' }, { status: 404 });
    }

    // Update assignment status to Confirmed
    await base44.entities.Assignment.update(assignment_id, { status: 'Confirmed' });

    // Notify supervisor
    const supervisorEmail = assignment.supervisor || 'admin@shepherdshield.com';
    await base44.integrations.Core.SendEmail({
      to: supervisorEmail,
      subject: `Assignment Confirmed: ${assignment.assigned_to_name}`,
      body: `${assignment.assigned_to_name} has confirmed their assignment:\n\nPosition: ${assignment.position_name}\nDate: ${assignment.service_date}\nTime: ${assignment.start_time} - ${assignment.end_time}\n\nStatus: Confirmed`
    });

    // Create confirmation notification for the user
    await base44.entities.Notification.create({
      user_email: assignment.assigned_to_email,
      title: 'Assignment Confirmed',
      message: `Your assignment for ${assignment.position_name} on ${assignment.service_date} has been confirmed.`,
      type: 'assignment_change'
    });

    return Response.json({ success: true, status: 'Confirmed', message: 'Assignment confirmed and supervisor notified' });
  } catch (error) {
    console.error('Confirmation error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});