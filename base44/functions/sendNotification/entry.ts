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

    const results = { in_app_created: false, push_sent: false };

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

    // Dual push (FCM + Web Push) — delivers background alert when app is closed
    try {
      const notifType = type === 'incident' ? 'incident'
        : type.startsWith('assignment') ? 'assignment'
        : 'general';
      const clickUrl = assignment_id ? '/Assignments' : '/Communications';
      await base44.asServiceRole.functions.invoke('sendDualPush', {
        recipient_email: user_email,
        title,
        body: message,
        notification_type: notifType,
        click_url: clickUrl,
        assignment_id: assignment_id || '',
      });
      results.push_sent = true;
    } catch (error) {
      console.error('Push notification error:', error);
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