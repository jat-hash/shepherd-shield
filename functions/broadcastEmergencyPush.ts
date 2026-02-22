import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    
    // Extract alert data from automation payload
    const alertData = payload.data || payload;
    const alertId = alertData.id || payload.entity_id;

    if (!alertId) {
      return Response.json({ error: 'Alert ID required' }, { status: 400 });
    }

    // Get the alert details
    const alert = await base44.asServiceRole.entities.EmergencyAlert.get(alertId);
    
    if (!alert || !alert.is_active) {
      return Response.json({ error: 'Alert not found or not active' }, { status: 404 });
    }

    // Get all users
    const users = await base44.asServiceRole.entities.User.list();

    // Create URGENT in-app notifications for all users (will trigger real-time alerts)
    const notificationPromises = users.map(user =>
      base44.asServiceRole.entities.Notification.create({
        user_email: user.email,
        title: '🚨 EMERGENCY ALERT',
        message: `${alert.alert_type}: ${alert.message}`,
        type: 'general',
        read: false
      })
    );

    // Send URGENT email notifications to all users
    const emailPromises = users.map(user =>
      base44.asServiceRole.integrations.Core.SendEmail({
        from_name: '🚨 EMERGENCY - Shepherd Shield',
        to: user.email,
        subject: `🚨 URGENT: ${alert.alert_type} - EMERGENCY ALERT`,
        body: `
          <div style="background-color: #dc2626; color: white; padding: 30px; font-family: Arial, sans-serif; border: 5px solid #991b1b;">
            <h1 style="margin: 0 0 15px 0; font-size: 28px; text-transform: uppercase;">🚨 EMERGENCY ALERT 🚨</h1>
            <h2 style="margin: 0 0 20px 0; font-weight: bold; font-size: 24px; background: #991b1b; padding: 15px; border-radius: 8px;">${alert.alert_type}</h2>
            <p style="font-size: 18px; margin: 0; line-height: 1.6; background: rgba(0,0,0,0.2); padding: 20px; border-radius: 8px;">${alert.message}</p>
            <p style="margin-top: 25px; font-size: 14px; opacity: 0.9;">
              Alert triggered: ${new Date(alert.created_date).toLocaleString()}
            </p>
            <p style="margin-top: 20px; font-size: 16px;">
              <a href="${Deno.env.get('BASE44_APP_URL') || 'https://app.base44.com'}" 
                 style="background: white; color: #dc2626; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                ⚡ OPEN APP NOW ⚡
              </a>
            </p>
            <p style="margin-top: 20px; font-size: 12px; opacity: 0.8;">
              This is an automated emergency notification from Shepherd Shield Security. Please respond immediately.
            </p>
          </div>
        `
      }).catch(err => console.error(`Failed to email ${user.email}:`, err))
    );

    await Promise.all([...notificationPromises, ...emailPromises]);

    return Response.json({ 
      success: true, 
      users_notified: users.length,
      alert_type: alert.alert_type
    });

  } catch (error) {
    console.error('Broadcast error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});