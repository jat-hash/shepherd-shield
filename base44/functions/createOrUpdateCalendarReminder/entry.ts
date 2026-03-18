import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event_type, event_id, user_email, reminder_minutes, event_title, event_date, start_time } = await req.json();
    
    if (!event_type || !event_id || !user_email || reminder_minutes === undefined) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    // If reminder_minutes is 0, don't create a reminder
    if (reminder_minutes === 0) {
      // Delete existing reminders for this event
      const existing = await base44.asServiceRole.entities.CalendarReminder.filter({
        event_type,
        event_id,
        user_email
      });
      
      for (const reminder of existing) {
        await base44.asServiceRole.entities.CalendarReminder.delete(reminder.id);
      }
      
      return Response.json({ success: true, action: 'deleted' });
    }
    
    // Calculate reminder datetime
    const [year, month, day] = event_date.split('-');
    const [hours, minutes] = start_time.split(':');
    const eventDateTime = new Date(`${year}-${month}-${day}T${hours}:${minutes}:00`);
    const reminderDateTime = new Date(eventDateTime.getTime() - reminder_minutes * 60 * 1000);
    
    // Check if reminder already exists
    const existing = await base44.asServiceRole.entities.CalendarReminder.filter({
      event_type,
      event_id,
      user_email
    });
    
    if (existing.length > 0) {
      // Update existing reminder
      await base44.asServiceRole.entities.CalendarReminder.update(existing[0].id, {
        reminder_time: reminder_minutes,
        reminder_datetime: reminderDateTime.toISOString(),
        is_sent: false,
        sent_at: null,
        event_title,
        event_datetime: eventDateTime.toISOString()
      });
      
      return Response.json({ success: true, action: 'updated', reminder_id: existing[0].id });
    } else {
      // Create new reminder
      const reminder = await base44.asServiceRole.entities.CalendarReminder.create({
        event_type,
        event_id,
        user_email,
        reminder_time: reminder_minutes,
        reminder_datetime: reminderDateTime.toISOString(),
        is_sent: false,
        event_title,
        event_datetime: eventDateTime.toISOString()
      });
      
      return Response.json({ success: true, action: 'created', reminder_id: reminder.id });
    }
  } catch (error) {
    console.error('Error in createOrUpdateCalendarReminder:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});