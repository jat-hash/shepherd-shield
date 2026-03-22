Deno.serve(async (req) => {
  try {
    const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const auth = Deno.env.get('TWILIO_AUTH_TOKEN');
    const from = Deno.env.get('TWILIO_WHATSAPP_NUMBER');

    if (!sid || !auth || !from) {
      return Response.json({ error: 'Twilio credentials not configured' }, { status: 500 });
    }

    const body = await req.json();
    let phone = (body.phone_number || '').replace(/\D/g, '');
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
        Body: body.message || 'Test message from Shepherd Shield'
      }).toString()
    });

    const data = await res.json();
    console.log('Response:', JSON.stringify(data));
    
    if (!res.ok) {
      return Response.json({ error: data.message || 'Failed to send' }, { status: 500 });
    }

    return Response.json({ success: true, sid: data.sid });
  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});