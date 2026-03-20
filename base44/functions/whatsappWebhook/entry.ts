import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
const WHATSAPP_FROM = Deno.env.get('TWILIO_WHATSAPP_NUMBER') || 'whatsapp:+14155238886';

const menuOptions = {
  '1': '📋 **Assignments** - View your upcoming shifts',
  '2': '🚨 **Report Incident** - Report a security incident',
  '3': '👥 **Team Status** - Check team member status',
  '4': '📞 **Contact Support** - Message the admin',
  'menu': '*Welcome to Shepherd Shield!* 🛡️\n\nReply with:\n1️⃣ - Assignments\n2️⃣ - Report Incident\n3️⃣ - Team Status\n4️⃣ - Contact Support'
};

async function verifyTwilioSignature(signature, url, params, authToken) {
  try {
    const data = url + Object.keys(params)
      .sort()
      .map(key => key + params[key])
      .join('');

    const encoder = new TextEncoder();
    const keyData = encoder.encode(authToken);
    const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
    const hashBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
    const hash = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));

    return signature === hash;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const formData = await req.formData();
    const incomingMessage = (formData.get('Body') || '').trim().toLowerCase();
    const fromNumber = formData.get('From') || '';

    const twilioSignature = req.headers.get('X-Twilio-Signature') || '';
    const url = new URL(req.url);
    const params = {};
    formData.forEach((value, key) => {
      params[key] = value;
    });

    const isValid = await verifyTwilioSignature(twilioSignature, url.toString(), params, TWILIO_AUTH_TOKEN);
    if (!isValid) {
      console.warn('Invalid Twilio signature');
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const senderPhone = fromNumber.replace('whatsapp:', '').trim();
    const base44 = createClientFromRequest(req);

    let senderEmail = 'unknown';
    let senderName = senderPhone;
    try {
      const allUsers = await base44.asServiceRole.entities.User.list(undefined, 1000);
      const matchedUser = allUsers.find(u => {
        const userPhone = (u.phone || '').replace(/\D/g, '');
        return userPhone === senderPhone.replace(/\D/g, '');
      });
      if (matchedUser) {
        senderEmail = matchedUser.email;
        senderName = matchedUser.full_name || matchedUser.email;
      }
    } catch (err) {
      console.log('Could not match sender to user:', err.message);
    }

    try {
      await base44.asServiceRole.entities.TeamMessage.create({
        channel: 'whatsapp',
        content: incomingMessage,
        sender_name: senderName,
        sender_email: senderEmail,
        message_type: 'text'
      });
    } catch (err) {
      console.log('Could not store message:', err.message);
    }

    let reply = menuOptions[incomingMessage] || menuOptions['menu'];

    const twimlXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(reply)}</Message>
</Response>`;

    return new Response(twimlXml, {
      headers: { 'Content-Type': 'application/xml' }
    });

  } catch (error) {
    console.error('WhatsApp webhook error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function escapeXml(unsafe) {
  return unsafe
    .replace(/[<>&'"]/g, c => ({
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      "'": '&apos;',
      '"': '&quot;'
    }[c]));
}