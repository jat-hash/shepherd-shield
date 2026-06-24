import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Receives a quick reply sent from the notification's reply action.
// Primary path: forwarded from an open app tab via the SDK (uses the logged-in
// user's real session — sender is pinned to that user, no secret needed).
// Fallback path: a direct call with the shared QUICK_REPLY_SECRET (used only
// when the SW has the secret configured, for background replies with no tab open).
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { channel, content, sender_email, sender_name, reply_secret } = await req.json();

    // Two valid paths:
    // 1) Forwarded from an open app tab via the SDK — the caller is authenticated
    //    as a logged-in user, so we trust the provided sender info (no secret needed).
    // 2) Direct from the service worker when no tab is open — no user session, so the
    //    shared QUICK_REPLY_SECRET must match.
    const user = await base44.auth.me().catch(() => null);
    const isForwardedFromApp = !!user;
    if (!isForwardedFromApp) {
      if (reply_secret !== Deno.env.get('QUICK_REPLY_SECRET')) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }
    if (!channel || !content || !sender_email || !sender_name) {
      return Response.json({ error: 'channel, content, sender_email, sender_name required' }, { status: 400 });
    }

    // If forwarded from the app, pin the sender to the logged-in user to prevent spoofing.
    const finalEmail = isForwardedFromApp ? user.email : sender_email;
    const finalName = isForwardedFromApp ? (user.display_name || user.full_name || sender_name) : sender_name;

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