import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { to, message } = await req.json();

    if (!to || !message) {
      return Response.json({ 
        error: 'to and message required' 
      }, { status: 400 });
    }

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

    if (!accountSid || !authToken || !fromNumber) {
      return Response.json({ 
        error: 'Twilio credentials not configured',
        success: false 
      }, { status: 500 });
    }

    // Send SMS via Twilio
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          To: to,
          From: fromNumber,
          Body: message
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('Twilio error:', error);
      return Response.json({ 
        error: 'Failed to send SMS',
        success: false 
      }, { status: 500 });
    }

    const data = await response.json();
    return Response.json({ 
      success: true,
      messageId: data.sid
    });
  } catch (error) {
    console.error('Error in sendSMS:', error);
    return Response.json({ 
      error: error.message,
      success: false 
    }, { status: 500 });
  }
});