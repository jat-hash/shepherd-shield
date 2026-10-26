import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

// Fires when a member is assigned to the Marathon (or Bonco) post, reminding
// them to complete the Marathon Property Checklist. Invoked by the
// "Remind Marathon Assignee to Complete Checklist" workflow on Assignment
// create/update. Reminders go out on creation, and on updates only when the
// post is newly assigned to someone — never on check-in, status or note edits.

const REMINDER_TITLE = '📋 Complete the Marathon Property Checklist';
const CHECKLIST_POST = /marathon|bonco/i;

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const payload = await req.json().catch(() => ({}));
    const eventType: string = payload.event_type || payload.event?.type || 'create';
    const entityId: string = payload.entity_id || payload.data?.id;
    const changedFields: string[] = Array.isArray(payload.changed_fields) ? payload.changed_fields : [];

    if (!entityId) return Response.json({ success: false, message: 'No assignment id' });

    // On updates, only remind when the post is newly assigned to someone.
    if (eventType === 'update') {
      const reassigned =
        changedFields.includes('assigned_to_email') || changedFields.includes('position_name');
      if (!reassigned) return Response.json({ success: false, message: 'Assignee unchanged' });
    }

    const assignment = await base44.asServiceRole.entities.Assignment.get(entityId);
    if (!assignment) return Response.json({ success: false, message: 'Assignment not found' });
    if (assignment.status === 'Declined') return Response.json({ success: false, message: 'Assignment declined' });
    if (!assignment.assigned_to_email) return Response.json({ success: false, message: 'No assignee' });
    if (!CHECKLIST_POST.test(assignment.position_name || '')) {
      return Response.json({ success: false, message: 'Not a Marathon/Bonco post' });
    }

    const message = `You've been assigned to ${assignment.position_name} on ${assignment.service_date} at ${assignment.start_time}. Please complete the Marathon Property Checklist (secure all property posts).`;

    await base44.asServiceRole.functions.invoke('sendNotification', {
      user_email: assignment.assigned_to_email,
      title: REMINDER_TITLE,
      message,
      type: 'assignment_reminder',
      assignment_id: assignment.id,
    });

    return Response.json({ success: true, reminded: assignment.assigned_to_email });
  } catch (error) {
    console.error('remindMarathonChecklistOnAssignment error:', error);
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}