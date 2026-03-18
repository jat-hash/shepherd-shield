import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event, data } = await req.json();

    if (event.type !== 'create' || !data) {
      return Response.json({ success: false, message: 'Not a create event' });
    }

    const assignment = data;
    
    const title = '📋 New Assignment';
    const message = `You've been assigned to ${assignment.position_name} on ${new Date(assignment.service_date).toLocaleDateString()} at ${assignment.start_time}. Service: ${assignment.service_type}`;

    await base44.asServiceRole.functions.invoke('sendNotification', {
      user_email: assignment.assigned_to_email,
      title,
      message,
      type: 'assignment_new',
      assignment_id: assignment.id
    });

    return Response.json({ success: true });

  } catch (error) {
    console.error('New assignment notification error:', error);
    return Response.json({ 
      success: false,
      error: error.message 
    }, { status: 500 });
  }
});