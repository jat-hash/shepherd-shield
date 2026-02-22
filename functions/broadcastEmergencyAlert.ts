import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    
    const alertData = payload.data || payload;
    const alert_type = alertData.alert_type;
    const message = alertData.message;
    
    if (!alert_type || !message) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get all users
    const allUsers = await base44.asServiceRole.entities.User.list();
    
    if (!allUsers || allUsers.length === 0) {
      return Response.json({ success: true, notified: 0 });
    }

    // Send push and email notifications to all users
    const notificationPromises = allUsers.map(async (user) => {
      try {
        // Send push notification
        await base44.asServiceRole.functions.invoke('sendFCMNotification', {
          recipient_email: user.email,
          title: `🚨 ${alert_type}`,
          body: message,
          alert_id: alertData.id || ''
        }).catch(err => {
          console.log(`Push notification skipped for ${user.email}:`, err.message);
        });

        // Send email notification
        return base44.asServiceRole.integrations.Core.SendEmail({
          to: user.email,
          subject: `🚨 EMERGENCY ALERT: ${alert_type}`,
          body: `
            <div style="font-family: Arial, sans-serif; color: #333;">
              <div style="background-color: #dc2626; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                <h2 style="margin: 0;">🚨 EMERGENCY ALERT</h2>
                <p style="margin: 10px 0 0 0; font-size: 18px;"><strong>${alert_type}</strong></p>
              </div>
              <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; border-left: 4px solid #dc2626;">
                <p style="margin: 0;"><strong>Message:</strong></p>
                <p style="margin: 10px 0 0 0; font-size: 16px;">${message}</p>
                <p style="margin: 20px 0 0 0; font-size: 12px; color: #666;">
                  <strong>Time:</strong> ${new Date().toLocaleString()}
                </p>
              </div>
              <div style="margin-top: 20px; padding: 15px; background-color: #fff3cd; border-radius: 8px; border-left: 4px solid #ffc107;">
                <p style="margin: 0; color: #856404;">
                  <strong>Action Required:</strong> Please log in to the Shepherd Shield app immediately to acknowledge this alert.
                </p>
              </div>
            </div>
          `
        });
      } catch (err) {
        console.error(`Failed to notify ${user.email}:`, err);
        return null;
      }
    });

    const results = await Promise.all(notificationPromises);
    const successCount = results.filter(r => r !== null).length;

    return Response.json({ 
      success: true, 
      notified: successCount,
      total_users: allUsers.length
    });
  } catch (error) {
    console.error('Broadcast error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});