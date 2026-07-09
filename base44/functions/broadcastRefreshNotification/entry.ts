import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Admin-only: broadcasts a "Refresh App" push notification to all users.
// The notification includes a "Refresh Now" action button that reloads the app
// directly from the service worker (even with app closed).
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const customMessage = body?.message || 'The app has been updated. Please refresh to get the latest version.';

    const allUsers = await base44.asServiceRole.entities.User.list();
    if (!allUsers || allUsers.length === 0) {
      return Response.json({ success: false, message: 'No users found' });
    }

    const title = '🔄 App Update — Refresh Now';

    let fcmSuccessCount = 0;

    for (const u of allUsers) {
      // In-app notification (works on all platforms)
      await base44.asServiceRole.entities.Notification.create({
        user_email: u.email,
        title,
        message: customMessage,
        type: 'general',
        read: false,
      }).catch(() => {});

      // FCM push with 'refresh' notification_type — the service worker adds
      // a "Refresh Now" action button
      const fcmRes = await base44.asServiceRole.functions.invoke('sendFCMNotification', {
        recipient_email: u.email,
        title,
        body: customMessage,
        notification_type: 'refresh',
        click_url: '/',
      }).catch(() => null);
      if (fcmRes?.data?.success) fcmSuccessCount++;
    }

    console.log(`Refresh notification broadcast by ${user.email}: ${allUsers.length} in-app, ${fcmSuccessCount} FCM`);

    return Response.json({
      success: true,
      total_users: allUsers.length,
      fcm_sent: fcmSuccessCount,
    });
  } catch (error) {
    console.error('Error in broadcastRefreshNotification:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});