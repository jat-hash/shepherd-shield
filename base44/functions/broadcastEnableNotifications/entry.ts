import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// One-time broadcast: prompts all users — especially iPhone users — to enable
// push notifications. Sends an in-app Notification (visible when they next open
// the app) AND a dual-channel push (FCM for Android/Chrome/Desktop, Web Push
// for iOS/Safari installed PWA) so users with working push get a live alert.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allUsers = await base44.asServiceRole.entities.User.list();
    if (!allUsers || allUsers.length === 0) {
      return Response.json({ success: false, message: 'No users found' });
    }

    const title = '🔔 Enable Notifications';
    const body = 'Please make sure push notifications are enabled so you never miss an alert. iPhone users: open Settings → Shepherd Shield → Notifications → Allow, and keep the app installed on your Home Screen.';

    let pushSent = 0;
    let notifCreated = 0;
    const errors = [];

    for (const u of allUsers) {
      // In-app notification — visible when the user opens the app
      await base44.asServiceRole.entities.Notification.create({
        user_email: u.email,
        title,
        message: body,
        type: 'general',
        read: false,
      }).catch(() => {});
      notifCreated++;

      // Dual push (FCM + Web Push) — live alert for users with push working
      const pushRes = await base44.asServiceRole.functions.invoke('sendDualPush', {
        recipient_email: u.email,
        title,
        body,
        notification_type: 'general',
        click_url: '/PushDiagnostics',
      }).catch(err => {
        errors.push({ email: u.email, error: err.message });
        return null;
      });
      if (pushRes?.data?.success) pushSent++;
    }

    console.log(`Enable-notifications broadcast by ${user.email}: ${notifCreated} in-app, ${pushSent} push sent, ${errors.length} errors`);

    return Response.json({
      success: true,
      total_users: allUsers.length,
      in_app_sent: notifCreated,
      push_sent: pushSent,
      errors,
    });
  } catch (error) {
    console.error('broadcastEnableNotifications error:', error);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});