import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Returns the public WhatsApp bot number for frontend use (wa.me links).

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const raw = Deno.env.get('TWILIO_WHATSAPP_NUMBER') || '';
    // Strip "whatsapp:" prefix and leading "+" for wa.me URL
    const cleaned = raw.replace('whatsapp:', '').replace(/^\+/, '');

    const appId = Deno.env.get('BASE44_APP_ID');
    const webhookUrl = appId
      ? `https://api.base44.com/api/apps/${appId}/functions/whatsappBot`
      : null;

    return Response.json({
      whatsapp_number: raw.replace('whatsapp:', ''),
      wa_me_number: cleaned,
      configured: !!cleaned,
      webhook_url: webhookUrl
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});