import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { target_email } = await req.json();

    if (!target_email) {
      return Response.json({ error: 'Missing target_email' }, { status: 400 });
    }

    // Get an assignment for this user to use as test data
    const assignments = await base44.entities.Assignment.filter({ assigned_to_email: target_email }, '-updated_date', 1);
    const testAssignment = assignments?.[0];

    // Create test notifications
    const notifications = [
      {
        user_email: target_email,
        title: 'Test: New Assignment',
        message: 'This is a test notification for a new assignment.',
        type: 'assignment_new',
        assignment_id: testAssignment?.id
      },
      {
        user_email: target_email,
        title: 'Test: Assignment Reminder',
        message: `This is a test reminder for ${testAssignment?.position_name || 'your assignment'} on ${testAssignment?.service_date || 'the scheduled date'}.`,
        type: 'assignment_reminder',
        assignment_id: testAssignment?.id
      },
      {
        user_email: target_email,
        title: 'Test: General Notification',
        message: 'This is a test general notification to verify your notification system is working.',
        type: 'general'
      }
    ];

    const createdNotifications = [];
    for (const notif of notifications) {
      const created = await base44.entities.Notification.create(notif);
      createdNotifications.push(created);
      // Fire the actual push notification so it reaches the device even when
      // the app is closed (FCM data-only payload → service worker shows it).
      try {
        await base44.functions.invoke('sendFCMNotification', {
          recipient_email: target_email,
          title: notif.title,
          body: notif.message,
          notification_type: notif.type === 'assignment_new' ? 'assignment' : (notif.type === 'assignment_reminder' ? 'assignment' : 'general'),
          assignment_id: notif.assignment_id || '',
        });
      } catch (pushErr) {
        console.log('Push send skipped for', notif.type, ':', pushErr.message);
      }
    }

    // Create test team message
    const testMessage = await base44.entities.TeamMessage.create({
      channel: 'test',
      content: `Test message for ${target_email} - verifying communications system`,
      sender_name: 'System Test',
      sender_email: 'test@system.local',
      message_type: 'text'
    });

    return Response.json({
      success: true,
      notifications_sent: createdNotifications.length,
      message_sent: !!testMessage,
      target_email,
      details: 'Test notifications and message created. Check database and email for delivery.'
    });
  } catch (error) {
    console.error('Test notification error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});