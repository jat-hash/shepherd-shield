import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    
    const { event } = body;
    if (!event) {
      return Response.json({ error: 'Missing event data' }, { status: 400 });
    }

    const { type, entity_name, entity_id, data, old_data } = event;
    
    // Handle create/update
    if (type === 'create' || type === 'update') {
      if (data) {
        // Remove built-in fields that shouldn't be copied
        const { id, created_date, updated_date, created_by, ...syncData } = data;
        
        // Try update first, fall back to create if not found
        let updated = false;
        try {
          await base44.asServiceRole.entities[entity_name].update(entity_id, syncData, { data_env: "dev" });
          updated = true;
        } catch (_e) {
          // Record doesn't exist yet in test DB
        }
        
        if (!updated) {
          try {
            await base44.asServiceRole.entities[entity_name].create({ id: entity_id, ...syncData }, { data_env: "dev" });
          } catch (_e) {
            // Already created by a concurrent request, ignore
          }
        }
      }
    }
    
    // Handle delete
    if (type === 'delete') {
      try {
        await base44.asServiceRole.entities[entity_name].delete(entity_id, { data_env: "dev" });
      } catch (error) {
        // Already deleted or doesn't exist, that's fine
      }
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('Sync error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});