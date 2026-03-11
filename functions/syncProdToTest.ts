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
        
        // Check if exists in test DB
        try {
          const existing = await base44.asServiceRole.entities[entity_name].get(entity_id, { data_env: "dev" });
          if (existing) {
            // Update in test
            await base44.asServiceRole.entities[entity_name].update(entity_id, syncData, { data_env: "dev" });
          } else {
            // Create in test with same ID
            await base44.asServiceRole.entities[entity_name].create({ id: entity_id, ...syncData }, { data_env: "dev" });
          }
        } catch {
          // Record doesn't exist, create it
          await base44.asServiceRole.entities[entity_name].create({ id: entity_id, ...syncData }, { data_env: "dev" });
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