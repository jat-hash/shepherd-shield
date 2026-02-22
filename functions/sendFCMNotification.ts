import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { recipient_email, title, body, alert_id } = await req.json();

    if (!recipient_email || !title || !body) {
      return Response.json({ 
        error: 'recipient_email, title, and body required' 
      }, { status: 400 });
    }

    // Get FCM tokens for the recipient
    const devices = await base44.entities.UserDevice.filter({
      user_email: recipient_email
    });

    if (devices.length === 0) {
      return Response.json({ 
        message: 'No devices registered for user',
        success: false 
      });
    }

    const serverKey = Deno.env.get('FIREBASE_SERVER_KEY');
    if (!serverKey) {
      return Response.json({ error: 'Firebase server key not configured' }, { status: 500 });
    }

    // Parse server key to get project ID (format: project_id:token)
    const projectId = serverKey.split(':')[0];

    const results = [];

    for (const device of devices) {
      try {
        // Use Firebase Cloud Messaging v1 API
        const response = await fetch(
          `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${serverKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              message: {
                token: device.fcm_token,
                notification: {
                  title,
                  body
                },
                data: {
                  alertId: alert_id || ''
                },
                webpush: {
                  priority: 'high',
                  notification: {
                    title,
                    body,
                    icon: '/icon-192x192.png',
                    badge: '/badge-72x72.png',
                    sound: 'default',
                    vibrate: [1000, 200, 1000],
                    requireInteraction: true,
                    tag: 'emergency-alert'
                  }
                }
              }
            })
          }
        );

        const data = await response.json();
        results.push({
          device_id: device.device_id,
          success: response.ok && !!data.name,
          messageId: data.name || null
        });
      } catch (error) {
        console.error(`Error sending to device ${device.device_id}:`, error);
        results.push({
          device_id: device.device_id,
          success: false,
          error: error.message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    return Response.json({ 
      success: successCount > 0,
      total_devices: devices.length,
      successful: successCount,
      results
    });
  } catch (error) {
    console.error('Error in sendFCMNotification:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});