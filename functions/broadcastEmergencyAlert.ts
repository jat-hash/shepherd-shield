import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    
    const alertData = payload.data || payload;
    const alert_type = alertData.alert_type;
    const message = alertData.message;
    const triggered_by = alertData.triggered_by || 'Security Team';
    
    if (!alert_type || !message) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const allUsers = await base44.asServiceRole.entities.User.list();
    
    if (!allUsers || allUsers.length === 0) {
      return Response.json({ success: true, notified: 0 });
    }

    const notifyAll = allUsers.map(async (user) => {
      // 1. Create in-app Notification record
      await base44.asServiceRole.entities.Notification.create({
        user_email: user.email,
        title: `🚨 EMERGENCY: ${alert_type}`,
        message: message,
        type: 'general',
        read: false
      }).catch(() => {});

      // 2. Send email notification
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: user.email,
        subject: `🚨 EMERGENCY ALERT: ${alert_type}`,
        body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;"><div style="background-color: #dc2626; color: white; padding: 24px; border-radius: 8px 8px 0 0;"><h1 style="margin: 0; font-size: 24px;">🚨 EMERGENCY ALERT</h1><p style="margin: 8px 0 0; font-size: 20px; font-weight: bold;">${alert_type}</p></div><div style="background: #f9fafb; padding: 24px; border: 1px solid #e5e7eb;"><p style="font-size: 16px; color: #111;">${message}</p><hr style="border-color: #e5e7eb; margin: 16px 0;" /><p style="color: #6b7280; font-size: 14px;">Triggered by: ${triggered_by}</p><p style="color: #6b7280; font-size: 14px;">Time: ${new Date().toLocaleString()}</p></div><div style="background: #fff3cd; padding: 16px; border-radius: 0 0 8px 8px; border: 1px solid #ffc107; border-top: none;"><p style="margin: 0; color: #856404; font-weight: bold;">Open the Shepherd Shield app immediately to acknowledge this alert.</p></div></div>`
      }).catch(err => console.log(`Email skipped for ${user.email}:`, err.message));

      // 3. Send WhatsApp via Twilio to all users who have a phone number
      const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
      const twilioAuth = Deno.env.get('TWILIO_AUTH_TOKEN');
      const twilioWA = Deno.env.get('TWILIO_WHATSAPP_NUMBER');
      const userPhone = user.phone_number || user.data?.phone_number;
      if (twilioSid && twilioAuth && twilioWA && userPhone) {
        let phone = userPhone.replace(/\D/g, '');
        if (!phone.startsWith('1') && phone.length === 10) phone = '1' + phone;
        if (!phone.startsWith('+')) phone = '+' + phone;
        const body = `🚨 EMERGENCY: ${alert_type}\n\n${message}\n\nTriggered by: ${triggered_by}\n\nReply CHECKIN when safe.`;

        const waFrom = twilioWA.startsWith('whatsapp:') ? twilioWA : `whatsapp:${twilioWA}`;
        const waRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
          method: 'POST',
          headers: { 'Authorization': 'Basic ' + btoa(`${twilioSid}:${twilioAuth}`), 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ To: `whatsapp:${phone}`, From: waFrom, Body: body }).toString()
        });
        const waData = await waRes.json();
        if (!waRes.ok) console.log(`WhatsApp error for ${user.email}:`, JSON.stringify(waData));
        else console.log(`Emergency WhatsApp sent to ${user.email}, SID: ${waData.sid}`);
      }
    });

    await Promise.all(notifyAll);

    return Response.json({ 
      success: true, 
      notified: allUsers.length,
      total_users: allUsers.length
    });
  } catch (error) {
    console.error('Broadcast error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});