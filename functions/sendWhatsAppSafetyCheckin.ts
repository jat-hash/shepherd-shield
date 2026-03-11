import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Sends a WhatsApp safety check-in request to all users with phone numbers.
// Called by admins during an active emergency.
// Payload: { alertId, alertType, message }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { alertId, alertType, message } = await req.json();
    if (!alertType || !message) return Response.json({ error: 'Missing alertType or message' }, { status: 400 });

    const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const auth = Deno.env.get('TWILIO_AUTH_TOKEN');
    const from = Deno.env.get('TWILIO_WHATSAPP_NUMBER');

    if (!sid || !auth || !from) {
      return Response.json({ error: 'Twilio WhatsApp credentials not configured' }, { status: 500 });
    }

    const allUsers = await base44.asServiceRole.entities.User.list();
    const usersWithPhone = allUsers.filter(u => u.phone_number && u.email !== user.email);

    const checkInMessage = `🛡️ *SAFETY CHECK-IN REQUEST*\n\n🚨 *Alert:* ${alertType}\n${message}\n\n*Please reply with one of:*\n✅ *CHECKIN* — I am safe\n🆘 *HELP* — I need assistance\n\nYour response will be logged by the security team.`;

    const results = await Promise.allSettled(usersWithPhone.map(async (u) => {
      const uPhone = u.phone_number;
      let phone = uPhone.replace(/\D/g, '');
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
          From: from.startsWith('whatsapp:') ? from : `whatsapp:${from}`,
          Body: checkInMessage
        }).toString()
      });

      const data = await res.json();
      if (!res.ok) {
        console.log(`WhatsApp check-in error for ${u.email}:`, data.message);
        throw new Error(data.message);
      }
      console.log(`WhatsApp check-in sent to ${u.email}, SID: ${data.sid}`);
      return { email: u.email, sid: data.sid };
    }));

    const sent = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    return Response.json({ success: true, sent, failed, total: usersWithPhone.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});