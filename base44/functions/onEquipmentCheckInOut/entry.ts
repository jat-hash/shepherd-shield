import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    const { data, old_data, changed_fields } = payload;

    const checkedOutChanged = changed_fields?.includes('checked_out');
    if (!checkedOutChanged) return Response.json({ status: 'no_change' });

    const wasCheckedOut = old_data?.checked_out;
    const isNowCheckedOut = data.checked_out;

    if (wasCheckedOut === isNowCheckedOut) return Response.json({ status: 'no_change' });

    const action = isNowCheckedOut ? 'out' : 'in';
    const item_name = data.name || 'Unknown Equipment';
    const person_name = data.checked_out_by || null;

    // No routine equipment check-out alerts to leaders — alerts are only sent
    // for actual issues handled elsewhere.
    return Response.json({ status: 'ok' });
  } catch (error) {
    console.error('onEquipmentCheckInOut error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});