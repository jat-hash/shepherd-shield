import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Entity automation: triggers on Incident create.
// Sends a WhatsApp dispatch notification to all admin users.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    const event = payload.event || {};
    if (event.type !== 'create') {
      return Response.json({ skipped: true, reason: 'Not a create event' });
    }

    const incident = payload.data;
    if (!incident) return Response.json({ skipped: true, reason: 'No incident data' });

    const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const auth = Deno.env.get('TWILIO_AUTH_TOKEN');
    const from = Deno.env.get('TWILIO_WHATSAPP_NUMBER');

    if (!sid || !auth || !from) {
      return Response.json({ error: 'Twilio WhatsApp credentials not configured' }, { status: 500 });
    }

    // Get all admin users with phone numbers
    const allUsers = await base44.asServiceRole.entities.User.list();
    const adminUsers = allUsers.filter(u => u.role === 'admin' && u.phone_number);

    const severityEmoji = {
      Critical: '🔴',
      High: '🟠',
      Medium: '🟡',
      Low: '🟢'
    }[incident.severity] || '⚪';

    const locationLine = incident.latitude && incident.longitude
      ? `📍 GPS: https://maps.google.com/?q=${incident.latitude},${incident.longitude}`
      : `📍 Location: ${incident.location || 'Not specified'}`;

    const message = `🛡️ *NEW INCIDENT ALERT*\n\n${severityEmoji} *${incident.severity} — ${incident.category}*\n\n*${incident.title}*\n\n${locationLine}\n\n📋 ${incident.description || 'No description'}\n\n👤 Reported by: ${incident.reported_by || 'Unknown'}\n⏰ ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}\n\nOpen Shepherd Shield for full details.`;

    const results = await Promise.allSettled(adminUsers.map(async (u) => {
      let phone = u.phone_number.replace(/\D/g, '');
      if (!phone.startsWith('1') && phone.length === 10) phone = '1' + phone;
      if (!phone.startsWith('+')) phone = '+' + phone;

      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${sid}:${auth}`),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          To: `whatsapp:${phone}`,
          From: from,
          Body: message
        }).toString()
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      console.log(`Incident WhatsApp sent to ${u.email}, SID: ${data.sid}`);
      return { email: u.email, sid: data.sid };
    }));

    const sent = results.filter(r => r.status === 'fulfilled').length;
    return Response.json({ success: true, sent, total: adminUsers.length });
  } catch (error) {
    console.error('Incident WhatsApp notify error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});