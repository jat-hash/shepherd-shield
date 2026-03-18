import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { alertId } = await req.json();
    
    if (!alertId) {
      return Response.json({ error: 'Missing alertId' }, { status: 400 });
    }

    await base44.asServiceRole.entities.EmergencyAlert.update(alertId, { is_active: false });
    
    return Response.json({ success: true });
  } catch (error) {
    console.error('Dismiss alert error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});