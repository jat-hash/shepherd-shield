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

    // Create personal check-in and live location when checking in to assignment
    if (action === 'in') {
      const today = new Date().toISOString().split('T')[0];
      const now = new Date().toISOString();
      
      // Only create a PersonalCheckIn if one doesn't already exist (open) for today
      // This prevents duplicates when user already checked in via the dashboard
      const existingCheckIns = await base44.asServiceRole.entities.PersonalCheckIn.filter({
        user_email: data.assigned_to_email,
        check_in_date: today,
      });
      const alreadyOpen = existingCheckIns.find(r => !r.check_out_time);
      
      if (!alreadyOpen) {
        await base44.asServiceRole.entities.PersonalCheckIn.create({
          user_email: data.assigned_to_email,
          user_name: data.assigned_to_name,
          check_in_date: today,
          check_in_time: data.check_in_time || now,
          latitude: data.check_in_latitude,
          longitude: data.check_in_longitude,
        });
      }
      
      // Create or update live location
      const existingLive = await base44.asServiceRole.entities.LiveLocation.filter({ user_email: data.assigned_to_email });
      const locData = {
        user_email: data.assigned_to_email,
        user_name: data.assigned_to_name,
        latitude: data.check_in_latitude,
        longitude: data.check_in_longitude,
        accuracy: 0,
        last_updated: now,
        is_active: true,
      };
      
      if (existingLive.length > 0) {
        await base44.asServiceRole.entities.LiveLocation.update(existingLive[0].id, locData);
      } else {
        await base44.asServiceRole.entities.LiveLocation.create(locData);
      }
    }
    
    // Mark live location as inactive and close PersonalCheckIn when checking out
    if (action === 'out') {
      const now = new Date().toISOString();
      const existingLive = await base44.asServiceRole.entities.LiveLocation.filter({ user_email: data.assigned_to_email });
      if (existingLive.length > 0) {
        await base44.asServiceRole.entities.LiveLocation.update(existingLive[0].id, { is_active: false, last_updated: now });
      }
      // Close any open PersonalCheckIn for today
      const today = now.split('T')[0];
      const openCheckIns = await base44.asServiceRole.entities.PersonalCheckIn.filter({ user_email: data.assigned_to_email, check_in_date: today });
      const open = openCheckIns.find(r => !r.check_out_time);
      if (open) {
        await base44.asServiceRole.entities.PersonalCheckIn.update(open.id, { check_out_time: now });
      }
    }

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