import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Sends a single WhatsApp message via Twilio
// Payload: { to: "+1234567890", message: "..." }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { to, message } = await req.json();
    if (!to || !message) return Response.json({ error: 'Missing required fields: to, message' }, { status: 400 });

    const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const auth = Deno.env.get('TWILIO_AUTH_TOKEN');
    const from = Deno.env.get('TWILIO_WHATSAPP_NUMBER');

    if (!sid || !auth || !from) {
      return Response.json({ error: 'Twilio WhatsApp credentials not configured' }, { status: 500 });
    }

    let toFormatted = to.replace(/\D/g, '');
    if (!toFormatted.startsWith('1') && toFormatted.length === 10) toFormatted = '1' + toFormatted;
    if (!toFormatted.startsWith('+')) toFormatted = '+' + toFormatted;

    const fromFormatted = from.startsWith('whatsapp:') ? from : `whatsapp:${from}`;
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${sid}:${auth}`),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        To: `whatsapp:${toFormatted}`,
        MessagingServiceSid: 'HXa8f2d0c8dd650aa0c4a6d08f9b44197e',
        Body: message
      }).toString()
    });

    const data = await res.json();
    if (!res.ok) return Response.json({ error: data.message || 'Failed to send WhatsApp message' }, { status: 500 });

    console.log(`WhatsApp sent to ${to}, SID: ${data.sid}`);
    return Response.json({ success: true, sid: data.sid });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});