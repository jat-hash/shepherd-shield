import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Marks a new property security service cycle by recording the reset
// boundary timestamp. Checks made before this timestamp belong to a
// previous cycle and are excluded from the current-status grid, while
// remaining in history for the monthly unsecured report.
// Invoked by scheduled automations after each service ends (Sunday AM,
// Sunday PM, Tuesday Bible Study, Thursday Services). Can also be
// triggered manually by leadership.

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);

    let serviceLabel = 'scheduled';
    try {
      const body = await req.json();
      if (body && body.service_label) serviceLabel = String(body.service_label);
    } catch (_) {}

    const now = new Date().toISOString();
    const existing = await base44.asServiceRole.entities.PropertySecurityCycle.list(1);
    let cycle;
    if (existing.length > 0) {
      cycle = await base44.asServiceRole.entities.PropertySecurityCycle.update(existing[0].id, {
        last_reset_at: now,
        reset_by: serviceLabel,
      });
    } else {
      cycle = await base44.asServiceRole.entities.PropertySecurityCycle.create({
        last_reset_at: now,
        reset_by: serviceLabel,
      });
    }

    return Response.json({ success: true, cycle });
  } catch (error) {
    console.error('resetPropertySecurityCycle error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}