import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    
    const alertData = payload.data || payload;
    const alert_type = alertData.alert_type;
    const message = alertData.message;
    const triggered_by = alertData.triggered_by || 'Security Team';
    const alert_id = alertData.id;
    
    if (!alert_type || !message) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const allUsers = await base44.asServiceRole.entities.User.list();
    
    if (!allUsers || allUsers.length === 0) {
      return Response.json({ success: true, notified: 0 });
    }

    const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuth = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioWA = Deno.env.get('TWILIO_WHATSAPP_NUMBER');

    const notifyAll = allUsers.map(async (user) => {
      // 1. Create in-app Notification record
      await base44.asServiceRole.entities.Notification.create({
        user_email: user.email,
        title: `🚨 EMERGENCY: ${alert_type}`,
        message: message,
        type: 'general',
        read: false
      }).catch(() => {});

      // 2. Dual push (FCM + Web Push) — delivers background alert when app is closed
      await base44.asServiceRole.functions.invoke('sendDualPush', {
        recipient_email: user.email,
        title: `🚨 EMERGENCY: ${alert_type}`,
        body: message,
        alert_id: alert_id || '',
        notification_type: 'emergency',
        click_url: '/',
      }).catch(err => console.log(`Push skipped for ${user.email}:`, err.message));

      // 3. Send WhatsApp with CONFIRM instructions — will repeat until confirmed
      const userPhone = user.phone_number || user.data?.phone_number;
      if (twilioSid && twilioAuth && twilioWA && userPhone) {
        let phone = userPhone.replace(/\D/g, '');
        if (!phone.startsWith('1') && phone.length === 10) phone = '1' + phone;
        if (!phone.startsWith('+')) phone = '+' + phone;

        const waBody = `🚨 EMERGENCY ALERT 🚨\nType: ${alert_type}\n\n${message}\n\nTriggered by: ${triggered_by}\n\n⚠️ Reply *CONFIRM* to acknowledge this alert.\nYou will keep receiving this message until you reply CONFIRM.`;

        const waFrom = twilioWA.startsWith('whatsapp:') ? twilioWA : `whatsapp:${twilioWA}`;
        const waRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + btoa(`${twilioSid}:${twilioAuth}`),
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({ To: `whatsapp:${phone}`, From: waFrom, Body: waBody }).toString()
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