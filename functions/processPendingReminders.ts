import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const now = new Date();
    
    // Get all unset reminders
    const reminders = await base44.asServiceRole.entities.CalendarReminder.filter({
      is_sent: false
    });
    
    const results = [];
    
    for (const reminder of reminders) {
      const reminderDateTime = new Date(reminder.reminder_datetime);
      
      // Check if it's time to send this reminder
      if (reminderDateTime <= now) {
        try {
          // Send in-app notification
          await base44.asServiceRole.entities.Notification.create({
            user_email: reminder.user_email,
            title: `Upcoming: ${reminder.event_title}`,
            message: `${reminder.event_title} starts at ${new Date(reminder.event_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
            type: 'general',
            read: false
          });
          
          // Send push notification
          try {
            await base44.asServiceRole.functions.invoke('sendFCMNotification', {
              recipient_email: reminder.user_email,
              title: `Reminder: ${reminder.event_title}`,
              body: `Your event starts soon`,
              alert_id: reminder.id
            });
          } catch (err) {
            console.log('Push notification skipped:', err.message);
          }
          
          // Mark reminder as sent
          await base44.asServiceRole.entities.CalendarReminder.update(reminder.id, {
            is_sent: true,
            sent_at: new Date().toISOString()
          });
          
          results.push({
            reminder_id: reminder.id,
            success: true,
            user: reminder.user_email
          });
        } catch (error) {
          console.error(`Error processing reminder ${reminder.id}:`, error);
          results.push({
            reminder_id: reminder.id,
            success: false,
            error: error.message
          });
        }
      }
    }
    
    return Response.json({
      processed: results.filter(r => r.success).length,
      total: results.length,
      results
    });
  } catch (error) {
    console.error('Error in processPendingReminders:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});