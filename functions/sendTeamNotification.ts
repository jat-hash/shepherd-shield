import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { title, message, recipient_emails, send_sms } = await req.json();

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

      // Send SMS via Twilio if recipient has a phone number AND has SMS notifications enabled
      const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
      const twilioAuth = Deno.env.get('TWILIO_AUTH_TOKEN');
      const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');
      const sendSms = send_sms !== false; // allow caller to force SMS or use default (check user pref)
      if (twilioSid && twilioAuth && twilioPhone && recipient.phone_number && (sendSms && recipient.notifications_sms)) {
        let phone = recipient.phone_number.replace(/\D/g, '');
        if (!phone.startsWith('1') && phone.length === 10) phone = '1' + phone;
        if (!phone.startsWith('+')) phone = '+' + phone;
        const smsBody = `${title}\n\n${message}`;
        console.log(`Sending SMS to ${recipient.email} at ${phone}`);
        const smsRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + btoa(`${twilioSid}:${twilioAuth}`),
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({ To: phone, From: twilioPhone, Body: smsBody }).toString()
        });
        const smsData = await smsRes.json();
        if (!smsRes.ok) console.log(`SMS error for ${recipient.email}:`, JSON.stringify(smsData));
        else console.log(`SMS sent to ${recipient.email}, SID: ${smsData.sid}`);
      }
    }));

    return Response.json({ success: true, notified: recipients.length });
  } catch (error) {
    console.error('sendTeamNotification error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});