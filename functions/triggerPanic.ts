import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { latitude, longitude } = body;

    const locationStr = latitude && longitude
      ? `GPS: ${Number(latitude).toFixed(5)}, ${Number(longitude).toFixed(5)}`
      : "Location unknown";

    // Create incident record
    const incident = await base44.entities.Incident.create({
      title: `PANIC ALERT — ${user.display_name || user.full_name || user.email}`,
      category: "Panic Alert",
      location: locationStr,
      latitude: latitude || null,
      longitude: longitude || null,
      severity: "Critical",
      description: `Panic button triggered by ${user.display_name || user.full_name || user.email}. Requires immediate response.`,
      reported_by: user.display_name || user.full_name || user.email,
      status: "Open",
      is_panic: true,
      incident_date: new Date().toISOString().split('T')[0]
    });

    // Create active emergency alert banner
    await base44.asServiceRole.entities.EmergencyAlert.create({
      alert_type: "Panic Alert",
      message: `${user.display_name || user.full_name || user.email} triggered the panic button. Check the Team Map.`,
      triggered_by: user.display_name || user.full_name || user.email,
      is_active: true
    });

    // Notify all users
    const allUsers = await base44.asServiceRole.entities.User.list();

    await Promise.all(allUsers.map(async (u) => {
      // In-app notification
      await base44.asServiceRole.entities.Notification.create({
        user_email: u.email,
        title: "🚨 PANIC ALERT",
        message: `${user.display_name || user.full_name || user.email} needs immediate help! Check the Team Map for location.`,
        type: "general",
        read: false
      }).catch(() => {});

      // Email notification
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: u.email,
        subject: "🚨 PANIC ALERT — Immediate Response Required",
        body: `<div style="font-family: Arial; max-width: 600px; margin: 0 auto; background: #0a1128; color: white; padding: 20px; border-radius: 12px;"><div style="background: #dc2626; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 20px;"><h1 style="margin: 0; font-size: 26px; letter-spacing: 2px;">🚨 PANIC ALERT</h1></div><p style="color: #f1f5f9; font-size: 16px;"><strong>${user.display_name || user.full_name || user.email}</strong> has triggered the panic button and requires immediate assistance.</p><p style="color: #94a3b8; font-size: 12px; text-align: center; margin-top: 20px;">Shepherd Shield Security System — Check the Team Map for location.</p></div>`
      }).catch(() => {});

      // WhatsApp via Twilio if phone available
      const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
      const twilioAuth = Deno.env.get('TWILIO_AUTH_TOKEN');
      const twilioWA = Deno.env.get('TWILIO_WHATSAPP_NUMBER');
      const uPhone = u.phone_number;
      if (twilioSid && twilioAuth && twilioWA && uPhone) {
        let phone = uPhone.replace(/\D/g, '');
        if (!phone.startsWith('1') && phone.length === 10) phone = '1' + phone;
        if (!phone.startsWith('+')) phone = '+' + phone;
        const panicBody = `🚨 PANIC ALERT\n${user.display_name || user.full_name || user.email} needs immediate help!\n${locationStr}${latitude ? `\nhttps://maps.google.com/?q=${latitude},${longitude}` : ""}`;

        const waFrom = twilioWA.startsWith('whatsapp:') ? twilioWA : `whatsapp:${twilioWA}`;
        await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
          method: 'POST',
          headers: { 'Authorization': 'Basic ' + btoa(`${twilioSid}:${twilioAuth}`), 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ To: `whatsapp:${phone}`, From: waFrom, Body: panicBody }).toString()
        }).catch(() => {});
      }
    }));

    return Response.json({ success: true, incident_id: incident.id });
  } catch (error) {
    console.error('triggerPanic error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});