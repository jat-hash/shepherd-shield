Deno.serve(async (req) => {
  try {
    const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const auth = Deno.env.get('TWILIO_AUTH_TOKEN');
    const from = Deno.env.get('TWILIO_WHATSAPP_NUMBER');

    console.log('Twilio Config:', {
      sid: sid ? 'SET' : 'MISSING',
      auth: auth ? 'SET' : 'MISSING',
      from: from || 'MISSING'
    });

    if (!sid || !auth || !from) {
      return Response.json({ error: 'Twilio credentials not configured', config: { sid: !!sid, auth: !!auth, from } }, { status: 500 });
    }

    const phone = '+12532329036';

    const reqBody = new URLSearchParams({
      To: `whatsapp:${phone}`,
      From: from.startsWith('whatsapp:') ? from : `whatsapp:${from}`,
      Body: 'Test message from Shepherd Shield'
    }).toString();

    console.log('Request body:', reqBody);
    console.log('To:', `whatsapp:${phone}`);
    console.log('From:', from.startsWith('whatsapp:') ? from : `whatsapp:${from}`);

    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${sid}:${auth}`),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: reqBody
    });

    const data = await res.json();
    console.log('Twilio response status:', res.status);
    console.log('Twilio response:', JSON.stringify(data, null, 2));

    return Response.json({ status: res.status, response: data });
  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});