import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import twilio from 'npm:twilio@4.10.0';

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

Deno.serve(async (req) => {
  try {
    // Only accept POST
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    // Parse incoming Twilio webhook
    const formData = await req.formData();
    const incomingMessage = (formData.get('Body') || '').trim().toLowerCase();
    const fromNumber = formData.get('From') || '';
    const accountSid = formData.get('AccountSid') || '';

    // Validate Twilio signature
    const twilioSignature = req.headers.get('X-Twilio-Signature') || '';
    const url = new URL(req.url);
    const params = {};
    formData.forEach((value, key) => {
      params[key] = value;
    });

    if (!verifyTwilioSignature(twilioSignature, url.toString(), params, TWILIO_AUTH_TOKEN)) {
      console.warn('Invalid Twilio signature');
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Extract phone number and sender info
    const senderPhone = fromNumber.replace('whatsapp:', '').trim();
    const base44 = createClientFromRequest(req);

    // Try to find user by phone
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

    // Store incoming message in TeamMessage entity
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

    // Determine reply based on user input
    let reply = menuOptions[incomingMessage];
    if (!reply) {
      reply = menuOptions['menu']; // Default to menu
    }

    // Send reply back via Twilio
    const twimlResponse = new twilio.twiml.MessagingResponse();
    twimlResponse.message(reply);

    return new Response(twimlResponse.toString(), {
      headers: { 'Content-Type': 'application/xml' }
    });

  } catch (error) {
    console.error('WhatsApp webhook error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// Verify Twilio signature
function verifyTwilioSignature(signature, url, params, authToken) {
  try {
    const data = url + Object.keys(params)
      .sort()
      .map(key => key + params[key])
      .join('');

    const hash = btoa(
      new TextEncoder().encode(
        await crypto.subtle.sign('HMAC', 
          await crypto.subtle.importKey('raw', new TextEncoder().encode(authToken), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']),
          new TextEncoder().encode(data)
        )
      )
    );

    return signature === hash;
  } catch {
    return false;
  }
}