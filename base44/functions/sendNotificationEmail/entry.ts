import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { data } = await req.json();
    
    if (!data || !data.user_email) {
      return Response.json({ error: 'Missing user_email' }, { status: 400 });
    }

    let emailBody = data.message || 'You have a new notification.';
    
    // Add confirmation link for assignment reminders
    if (data.type === 'assignment_reminder' && data.assignment_id) {
      const confirmUrl = `${Deno.env.get('APP_URL') || 'https://shepherdshield.com'}/api/confirm-assignment?token=${btoa(data.assignment_id)}`;
      emailBody += `\n\n--- CONFIRM YOUR ASSIGNMENT ---\nClick the link below to confirm your attendance:\n${confirmUrl}\n\nOr reply to this email with 'CONFIRM' to confirm your assignment.`;
    }

    await base44.integrations.Core.SendEmail({
      to: data.user_email,
      subject: data.title || 'Shepherd Shield Notification',
      body: emailBody
    });

    return Response.json({ success: true, email_sent: data.user_email, confirmation_sent: data.type === 'assignment_reminder' });
  } catch (error) {
    console.error('Email send error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});