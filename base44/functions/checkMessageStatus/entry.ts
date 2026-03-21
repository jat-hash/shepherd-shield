import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { sid } = await req.json();
    const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuth = Deno.env.get('TWILIO_AUTH_TOKEN');

    if (sid) {
      // Check specific message
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages/${sid}.json`, {
        headers: { 'Authorization': 'Basic ' + btoa(`${twilioSid}:${twilioAuth}`) }
      });
      const data = await res.json();
      return Response.json({ message: data });
    } else {
      // Get last 10 WhatsApp messages
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json?PageSize=10`, {
        headers: { 'Authorization': 'Basic ' + btoa(`${twilioSid}:${twilioAuth}`) }
      });
      const data = await res.json();
      const messages = data.messages?.map(m => ({
        sid: m.sid,
        to: m.to,
        from: m.from,
        status: m.status,
        error_code: m.error_code,
        error_message: m.error_message,
        date_sent: m.date_sent
      }));
      return Response.json({ messages });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});