import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event, data, old_data } = await req.json();

    if (event.type !== 'update' || !data || !old_data) {
      return Response.json({ success: false, message: 'Not an update event' });
    }

    const assignment = data;
    const oldAssignment = old_data;

    // Check if assignment details changed (not just check-in/out status)
    const fieldsToCheck = ['position_name', 'service_date', 'service_type', 'start_time', 'end_time', 'assigned_to_email'];
    const hasChanges = fieldsToCheck.some(field => assignment[field] !== oldAssignment[field]);

    if (!hasChanges) {
      return Response.json({ success: false, message: 'No significant changes' });
    }

    const title = '✏️ Assignment Updated';
    const message = `Your assignment has been updated: ${assignment.position_name} on ${new Date(assignment.service_date).toLocaleDateString()} at ${assignment.start_time}. Please review the changes.`;

    // Notify old assignee if email changed
    if (assignment.assigned_to_email !== oldAssignment.assigned_to_email) {
      await base44.asServiceRole.functions.invoke('sendNotification', {
        user_email: oldAssignment.assigned_to_email,
        title: '❌ Assignment Removed',
        message: `Your assignment for ${oldAssignment.position_name} has been reassigned.`,
        type: 'assignment_change',
        assignment_id: assignment.id
      });
    }

    // Notify current assignee
    await base44.asServiceRole.functions.invoke('sendNotification', {
      user_email: assignment.assigned_to_email,
      title,
      message,
      type: 'assignment_change',
      assignment_id: assignment.id
    });

    return Response.json({ success: true });

  } catch (error) {
    console.error('Assignment change notification error:', error);
    return Response.json({ 
      success: false,
      error: error.message 
    }, { status: 500 });
  }
});