import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Runs every 3 minutes to re-send WhatsApp alerts to users who haven't confirmed yet.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Find active emergency alerts
    const activeAlerts = await base44.asServiceRole.entities.EmergencyAlert.filter({ is_active: true });
    if (!activeAlerts || activeAlerts.length === 0) {
      return Response.json({ success: true, message: 'No active alerts' });
    }

    const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuth = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioWA = Deno.env.get('TWILIO_WHATSAPP_NUMBER');

    if (!twilioSid || !twilioAuth || !twilioWA) {
      return Response.json({ success: false, message: 'Twilio not configured' });
    }

    const waFrom = twilioWA.startsWith('whatsapp:') ? twilioWA : `whatsapp:${twilioWA}`;
    const allUsers = await base44.asServiceRole.entities.User.list();

    let totalSent = 0;

    for (const alert of activeAlerts) {
      // Get list of users who have already confirmed this alert
      const confirmations = await base44.asServiceRole.entities.SafetyCheckIn.filter({ alert_id: alert.id });
      const confirmedPhones = new Set(confirmations.map(c => c.user_phone).filter(Boolean));
      const confirmedEmails = new Set(confirmations.map(c => c.user_email).filter(Boolean));

      for (const user of allUsers) {
        const userPhone = user.phone_number || user.data?.phone_number;
        if (!userPhone) continue;

        // Skip if already confirmed
        if (confirmedEmails.has(user.email)) continue;

        let phone = userPhone.replace(/\D/g, '');
        if (!phone.startsWith('1') && phone.length === 10) phone = '1' + phone;
        if (!phone.startsWith('+')) phone = '+' + phone;

        if (confirmedPhones.has(phone)) continue;

        const waBody = `🚨 EMERGENCY ALERT — STILL ACTIVE 🚨\nType: ${alert.alert_type}\n\n${alert.message}\n\n⚠️ You have NOT confirmed this alert.\nReply *CONFIRM* right now to acknowledge.`;

        const waRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + btoa(`${twilioSid}:${twilioAuth}`),
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({ To: `whatsapp:${phone}`, From: waFrom, Body: waBody }).toString()
        });

        if (waRes.ok) {
          totalSent++;
          console.log(`Repeat alert sent to ${user.email}`);
        } else {
          const err = await waRes.json();
          console.log(`Failed to send to ${user.email}:`, JSON.stringify(err));
        }
      }
    }

    return Response.json({ success: true, sent: totalSent, alerts: activeAlerts.length });
  } catch (error) {
    console.error('Repeat alert error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});