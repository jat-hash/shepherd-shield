import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { alertId } = await req.json();

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

    // Create in-app notifications for all users
    const notificationPromises = users.map(user =>
      base44.asServiceRole.entities.Notification.create({
        user_email: user.email,
        title: '🚨 EMERGENCY ALERT',
        message: `${alert.alert_type}: ${alert.message}`,
        type: 'general',
        read: false
      })
    );

    // Send email notifications to all users
    const emailPromises = users.map(user =>
      base44.asServiceRole.integrations.Core.SendEmail({
        to: user.email,
        subject: '🚨 EMERGENCY ALERT - Shepherd Shield',
        body: `
          <div style="background-color: #dc2626; color: white; padding: 20px; font-family: Arial, sans-serif;">
            <h1 style="margin: 0 0 10px 0;">🚨 EMERGENCY ALERT</h1>
            <h2 style="margin: 0 0 15px 0; font-weight: bold;">${alert.alert_type}</h2>
            <p style="font-size: 16px; margin: 0;">${alert.message}</p>
            <p style="margin-top: 20px; font-size: 14px; opacity: 0.9;">
              Alert triggered: ${new Date(alert.created_date).toLocaleString()}
            </p>
            <p style="margin-top: 15px; font-size: 14px;">
              <a href="${Deno.env.get('BASE44_APP_URL') || 'https://app.base44.com'}" 
                 style="color: white; text-decoration: underline;">
                Open Shepherd Shield App
              </a>
            </p>
          </div>
        `
      }).catch(err => console.error(`Failed to email ${user.email}:`, err))
    );

    await Promise.all([...notificationPromises, ...emailPromises]);

    return Response.json({ 
      success: true, 
      users_notified: users.length 
    });

  } catch (error) {
    console.error('Broadcast error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});