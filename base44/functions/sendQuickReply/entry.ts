import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Receives a quick reply sent from the notification's reply action.
// Path 1: forwarded from an open app tab via the SDK (authenticated user session).
// Path 2: direct from the service worker when the app is closed — authenticates
//         via the device's FCM token (validated against UserDevice table). No
//         shared secret needed; the FCM token itself is the device credential.
// Path 3: legacy fallback with QUICK_REPLY_SECRET (backward compat).
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { channel, content, sender_email, sender_name, reply_secret, fcm_token } = await req.json();

    // Three valid auth paths (see header comment above)
    const user = await base44.auth.me().catch(() => null);
    const isForwardedFromApp = !!user;
    let resolvedEmail = null;
    let resolvedName = null;
    if (!isForwardedFromApp) {
      if (fcm_token) {
        // Validate the FCM token against registered devices
        const devices = await base44.asServiceRole.entities.UserDevice.filter({ fcm_token });
        if (devices.length === 0) {
          return Response.json({ error: 'Invalid device token' }, { status: 401 });
        }
        resolvedEmail = devices[0].user_email;
        resolvedName = sender_name || resolvedEmail.split('@')[0];
      } else if (reply_secret !== Deno.env.get('QUICK_REPLY_SECRET')) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }
    if (!channel || !content || !sender_email || !sender_name) {
      return Response.json({ error: 'channel, content, sender_email, sender_name required' }, { status: 400 });
    }

    // Pin the sender: app-forwarded → logged-in user; fcm_token → device owner; else → provided values
    const finalEmail = isForwardedFromApp ? user.email : (resolvedEmail || sender_email);
    const finalName = isForwardedFromApp ? (user.display_name || user.full_name || sender_name) : (resolvedName || sender_name);

    const trimmed = String(content).trim();
    if (!trimmed) {
      return Response.json({ error: 'Reply text is empty' }, { status: 400 });
    }

    // Create the message as the replying user (service role; no session available)
    const message = await base44.asServiceRole.entities.TeamMessage.create({
      channel: String(channel),
      content: trimmed,
      sender_name: String(finalName),
      sender_email: String(finalEmail),
      message_type: 'text'
    });

    // Trigger the normal message-notification flow (entity automation also fires
    // on create, but we invoke directly so DM recipients get a push immediately).
    await base44.functions.invoke('notifyNewMessage', {
      event: { type: 'create' },
      data: message
    }).catch(err => console.log('notifyNewMessage from quick-reply failed:', err.message));

    return Response.json({ success: true, message_id: message.id });
  } catch (error) {
    console.error('Error in sendQuickReply:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});