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

    // Push-only: we intentionally do NOT create in-app Notification records.
    // Those persist as unread and would reappear in the bell every time the
    // user opens the app. The FCM push (with a "Refresh Now" action button) is
    // the sole delivery mechanism — it only fires when the admin clicks
    // "Refresh All", and the service worker handles the refresh directly.
    for (const u of allUsers) {
      const pushRes = await base44.asServiceRole.functions.invoke('sendDualPush', {
        recipient_email: u.email,
        title,
        body: customMessage,
        notification_type: 'refresh',
        click_url: '/',
      }).catch(() => null);
      if (pushRes?.data?.success) fcmSuccessCount++;
    }

    console.log(`Refresh notification broadcast by ${user.email}: ${fcmSuccessCount}/${allUsers.length} dual pushes (FCM+WebPush)`);

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