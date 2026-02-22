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

    const results = [];

    for (const device of devices) {
      try {
        // Use Firebase legacy API with server key
        const response = await fetch('https://fcm.googleapis.com/fcm/send', {
          method: 'POST',
          headers: {
            'Authorization': `key=${serverKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            to: device.fcm_token,
            priority: 'high',
            notification: {
              title,
              body,
              sound: 'default'
            },
            webpush: {
              notification: {
                title,
                body,
                icon: '/icon-192x192.png',
                badge: '/badge-72x72.png',
                sound: 'default',
                vibrate: '[1000, 200, 1000]',
                requireInteraction: true,
                tag: 'emergency-alert'
              }
            },
            data: {
              alertId: alert_id || ''
            }
          })
        });

        const data = await response.json();
        results.push({
          device_id: device.device_id,
          success: data.success === 1,
          messageId: data.message_id
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