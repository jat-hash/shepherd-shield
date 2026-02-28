import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const { recipient_email, title, body, alert_id } = await req.json();

    if (!recipient_email || !title || !body) {
      return Response.json({ 
        error: 'recipient_email, title, and body required' 
      }, { status: 400 });
    }

    const restApiKey = Deno.env.get('ONESIGNAL_REST_API_KEY');
    const appId = Deno.env.get('ONESIGNAL_APP_ID');

    if (!restApiKey || !appId) {
      return Response.json({ error: 'OneSignal credentials not configured' }, { status: 500 });
    }

    // Send notification to user via external ID (email)
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${restApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        app_id: appId,
        include_external_user_ids: [recipient_email],
        headings: { en: title },
        contents: { en: body },
        priority: 10,
        android_channel_id: 'emergency-alerts',
        data: {
          alertId: alert_id || ''
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('OneSignal API error:', data);
      return Response.json({
        success: false,
        error: data.errors?.join(', ') || 'Failed to send notification'
      }, { status: response.status });
    }

    return Response.json({
      success: true,
      recipient: recipient_email,
      notificationId: data.body?.notification_id
    });
  } catch (error) {
    console.error('Error in sendFCMNotification:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});