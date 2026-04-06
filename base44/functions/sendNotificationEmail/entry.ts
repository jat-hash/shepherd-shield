import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { data } = await req.json();
    
    if (!data || !data.user_email) {
      return Response.json({ error: 'Missing user_email' }, { status: 400 });
    }

    await base44.integrations.Core.SendEmail({
      to: data.user_email,
      subject: data.title || 'Shepherd Shield Notification',
      body: data.message || 'You have a new notification.'
    });

    return Response.json({ success: true, email_sent: data.user_email });
  } catch (error) {
    console.error('Email send error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});