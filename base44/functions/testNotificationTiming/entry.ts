import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Find James Lim
    const jamesUsers = await base44.entities.User.list();
    const james = jamesUsers.find(u => u.full_name?.toLowerCase().includes('james') && u.full_name?.toLowerCase().includes('lim'));

    if (!james) {
      return Response.json({ error: 'James Lim not found' }, { status: 404 });
    }

    // Get upcoming assignments for James
    const assignments = await base44.entities.Assignment.filter({ assigned_to_email: james.email });
    
    // Get pending reminders
    const reminders = await base44.entities.CalendarReminder.filter({ user_email: james.email });

    // Check current time vs reminder times
    const now = new Date();
    const tzOffset = -7 * 60 * 1000; // Pacific Time (PDT is UTC-7)
    const localNow = new Date(now.getTime() + tzOffset);

    const reminderStatus = reminders.map(r => {
      const reminderTime = new Date(r.reminder_datetime);
      const secondsUntil = Math.round((reminderTime - now) / 1000);
      const minutesUntil = Math.round(secondsUntil / 60);
      
      return {
        event_title: r.event_title,
        event_datetime: r.event_datetime,
        reminder_datetime: r.reminder_datetime,
        is_sent: r.is_sent,
        minutes_until: minutesUntil,
        status: secondsUntil < 0 ? 'OVERDUE' : secondsUntil < 60 ? 'IMMINENT' : 'PENDING'
      };
    });

    return Response.json({
      user: { email: james.email, name: james.full_name },
      current_time_utc: now.toISOString(),
      current_time_pdt: new Date(now.getTime() - 7 * 60 * 60 * 1000).toISOString(),
      assignments_count: assignments.length,
      reminders: reminderStatus,
      upcoming_assignments: assignments.slice(0, 3).map(a => ({
        position: a.position_name,
        service_date: a.service_date,
        start_time: a.start_time,
        status: a.status
      }))
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});