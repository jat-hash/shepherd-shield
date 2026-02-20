import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { user_email, title, message, type, assignment_id } = await req.json();

    if (!user_email || !title || !message || !type) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get user preferences
    const users = await base44.asServiceRole.entities.User.list();
    const user = users.find(u => u.email === user_email);

    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    const results = { email_sent: false, in_app_created: false };

    // Check if user wants this type of notification
    let shouldNotify = false;
    if (type === 'assignment_new' && user.notify_new_assignments !== false) shouldNotify = true;
    if (type === 'assignment_change' && user.notify_assignment_changes !== false) shouldNotify = true;
    if (type === 'assignment_reminder' && user.notify_upcoming_assignments !== false) shouldNotify = true;
    if (type === 'general') shouldNotify = true;

    if (!shouldNotify) {
      return Response.json({ 
        success: true, 
        message: 'User has disabled this notification type',
        results 
      });
    }

    // Send email if enabled
    if (user.notifications_email !== false) {
      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: user_email,
          subject: title,
          body: message
        });
        results.email_sent = true;
      } catch (error) {
        console.error('Email send error:', error);
      }
    }

    // Create in-app notification if enabled
    if (user.notifications_in_app !== false) {
      try {
        await base44.asServiceRole.entities.Notification.create({
          user_email,
          title,
          message,
          type,
          assignment_id: assignment_id || null,
          read: false
        });
        results.in_app_created = true;
      } catch (error) {
        console.error('In-app notification error:', error);
      }
    }

    return Response.json({ success: true, results });

  } catch (error) {
    console.error('Notification error:', error);
    return Response.json({ 
      success: false,
      error: error.message 
    }, { status: 500 });
  }
});