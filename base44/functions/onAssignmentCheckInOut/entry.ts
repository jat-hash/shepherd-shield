import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    const { data, old_data, changed_fields } = payload;

    const checkedInChanged = changed_fields?.includes('checked_in');
    const checkedOutChanged = changed_fields?.includes('checked_out');

    if (!checkedInChanged && !checkedOutChanged) {
      return Response.json({ status: 'no_checkin_change' });
    }

    const person_name = data.assigned_to_name || data.assigned_to_email || 'Unknown';

    let action = null;
    if (checkedInChanged && data.checked_in && !old_data?.checked_in) {
      action = 'in';
    } else if (checkedOutChanged && data.checked_out && !old_data?.checked_out) {
      action = 'out';
    }

    if (!action) return Response.json({ status: 'no_action' });

    await base44.asServiceRole.functions.invoke('notifyLeaders', {
      item_type: 'checkin',
      action,
      person_name,
    });

    return Response.json({ status: 'ok' });
  } catch (error) {
    console.error('onAssignmentCheckInOut error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});