import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Single entry point for dual-channel push delivery.
// Fires FCM (Android/Chrome/Desktop) and Web Push (iOS/Safari installed PWA)
// concurrently so every user receives the alert regardless of platform.
// Notification functions should call THIS instead of sendFCMNotification directly.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // No auth check — sendDualPush is an internal dispatcher called from other
    // backend functions (entity automations, scheduled tasks) where there is no
    // user session. Requiring auth here silently broke Web Push (iOS) delivery
    // for every notification type triggered without a user context.
    const params = await req.json();
    const { recipient_email, title, body, alert_id, incident_id, dm_channel,
            notification_type, click_url, allow_quick_reply } = params;

    if (!recipient_email || !title || !body) {
      return Response.json({ error: 'recipient_email, title, and body required' }, { status: 400 });
    }

    // Build the shared payload once — both channels get the same content
    const fcmParams = {
      recipient_email, title, body,
      alert_id: alert_id || '',
      incident_id: incident_id || '',
      dm_channel: dm_channel || '',
      notification_type: notification_type || 'general',
      click_url: click_url || '/Communications',
      allow_quick_reply: allow_quick_reply || false,
    };
    const webPushParams = {
      recipient_email, title, body,
      alert_id: alert_id || '',
      incident_id: incident_id || '',
      dm_channel: dm_channel || '',
      notification_type: notification_type || 'general',
      click_url: click_url || '/Communications',
    };

    // Fire both channels concurrently — total latency = max(FCM, WebPush), not sum
    // Use sendWebPushService (no auth gate) instead of sendWebPush (requires auth).
    // sendWebPush fails in service-role contexts, silently dropping iOS/Safari pushes.
    const [fcmRes, wpRes] = await Promise.allSettled([
      base44.asServiceRole.functions.invoke('sendFCMNotification', fcmParams),
      base44.asServiceRole.functions.invoke('sendWebPushService', webPushParams),
    ]);

    const fcm = fcmRes.status === 'fulfilled' ? fcmRes.value?.data : { error: fcmRes.reason?.message };
    const wp = wpRes.status === 'fulfilled' ? wpRes.value?.data : { error: wpRes.reason?.message };

    const fcmSuccess = fcm?.successCount > 0;
    const wpSuccess = wp?.sent > 0;
    const anySuccess = fcmSuccess || wpSuccess;

    console.log(`sendDualPush → ${recipient_email}: FCM ${fcmSuccess ? '✓' : '✗'} (${fcm?.successCount || 0}/${fcm?.failureCount || 0}), WebPush ${wpSuccess ? '✓' : '✗'} (${wp?.sent || 0}/${wp?.failure || 0})`);

    return Response.json({
      success: anySuccess,
      recipient: recipient_email,
      fcm: fcm,
      webpush: wp,
    });
  } catch (error) {
    console.error('Error in sendDualPush:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});