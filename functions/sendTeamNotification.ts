import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { title, message, recipient_emails } = await req.json();

    if (!title || !message) {
      return Response.json({ error: 'title and message are required' }, { status: 400 });
    }

    // Get recipients: either specific users or all users
    let recipients;
    if (recipient_emails && recipient_emails.length > 0) {
      const allUsers = await base44.asServiceRole.entities.User.list();
      recipients = allUsers.filter(u => recipient_emails.includes(u.email));
    } else {
      recipients = await base44.asServiceRole.entities.User.list();
    }

    await Promise.all(recipients.map(async (recipient) => {
      // Create in-app notification
      await base44.asServiceRole.entities.Notification.create({
        user_email: recipient.email,
        title,
        message,
        type: 'general',
        read: false
      }).catch(() => {});

      // Send email
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: recipient.email,
        subject: title,
        body: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #1e3a5f; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
              <h2 style="margin: 0;">📢 ${title}</h2>
            </div>
            <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
              <p style="font-size: 16px; color: #111;">${message}</p>
              <hr style="border-color: #e5e7eb;" />
              <p style="color: #6b7280; font-size: 13px;">Sent by ${user.full_name || user.email} via Shepherd Shield</p>
            </div>
          </div>
        `
      }).catch(err => console.log(`Email skipped for ${recipient.email}:`, err.message));

      // Send OneSignal push notification
      const oneSignalAppId = Deno.env.get('ONESIGNAL_APP_ID');
      const oneSignalRestApiKey = Deno.env.get('ONESIGNAL_REST_API_KEY');
      if (oneSignalAppId && oneSignalRestApiKey) {
        await fetch('https://onesignal.com/api/v1/notifications', {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${oneSignalRestApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            app_id: oneSignalAppId,
            include_external_user_ids: [recipient.email],
            headings: { en: title },
            contents: { en: message },
            data: { type: 'general' }
          })
        }).catch(err => console.log(`Push notification skipped for ${recipient.email}:`, err.message));
      }
    }));

    return Response.json({ success: true, notified: recipients.length });
  } catch (error) {
    console.error('sendTeamNotification error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});