import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { title, message, recipient_emails, send_sms, skip_push } = await req.json();

    if (!title || !message) {
      return Response.json({ error: 'title and message are required' }, { status: 400 });
    }

    // Get recipients
    let recipients;
    if (recipient_emails && recipient_emails.length > 0) {
      const allUsers = await base44.asServiceRole.entities.User.list(undefined, 1000);
      recipients = allUsers.filter(u => recipient_emails.includes(u.email));
    } else {
      recipients = await base44.asServiceRole.entities.User.list(undefined, 1000);
    }

    const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuth = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioWA = Deno.env.get('TWILIO_WHATSAPP_NUMBER');
    const waFrom = twilioWA?.startsWith('whatsapp:') ? twilioWA : `whatsapp:${twilioWA}`;

    const whatsapp_skipped = [];

    // Process each recipient
    for (const recipient of recipients) {
      // In-app notification
      await base44.asServiceRole.entities.Notification.create({
        user_email: recipient.email,
        title,
        message,
        type: 'general',
        read: false
      }).catch(() => {});

      // Dual push (FCM + Web Push) — skip when caller requests it (e.g. nursery
      // avoids duplicates because the in-app Notification already triggers a
      // browser notification via BrowserNotificationDispatcher)
      if (!skip_push) {
        await base44.asServiceRole.functions.invoke('sendDualPush', {
          recipient_email: recipient.email,
          title,
          body: message,
          notification_type: 'general',
          click_url: '/Communications',
        }).catch(err => console.log(`Push skipped for ${recipient.email}:`, err.message));
      }

      // WhatsApp (only if send_sms requested)
      if (send_sms && twilioSid && twilioAuth && twilioWA) {
        const recipientPhone = recipient.phone || recipient.phone_number;
        if (!recipientPhone) {
          whatsapp_skipped.push(recipient.email);
        } else {
          let phone = recipientPhone.replace(/\D/g, '');
          if (!phone.startsWith('1') && phone.length === 10) phone = '1' + phone;
          if (!phone.startsWith('+')) phone = '+' + phone;

          const waRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
            method: 'POST',
            headers: {
              'Authorization': 'Basic ' + btoa(`${twilioSid}:${twilioAuth}`),
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({ To: `whatsapp:${phone}`, From: waFrom, Body: `${title}\n\n${message}` }).toString()
          });
          const waData = await waRes.json();
          if (!waRes.ok) {
            console.log(`WhatsApp error for ${recipient.email}:`, JSON.stringify(waData));
            whatsapp_skipped.push(recipient.email);
          } else {
            console.log(`WhatsApp sent to ${recipient.email} (${phone}), SID: ${waData.sid}`);
          }
        }
      }
    }

    return Response.json({
      success: true,
      notified: recipients.length,
      whatsapp_skipped
    });

  } catch (error) {
    console.error('sendTeamNotification error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});