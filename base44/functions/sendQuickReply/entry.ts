import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Receives a quick-reply sent from the Service Worker (notification reply action).
// Because push-driven replies have no user session, we authenticate via a
// lightweight shared secret passed from the SW, then act as service role.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { channel, content, sender_email, sender_name, reply_secret } = await req.json();

    // Shared secret — the SW includes it so random callers can't spoof replies.
    if (reply_secret !== Deno.env.get('QUICK_REPLY_SECRET')) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!channel || !content || !sender_email || !sender_name) {
      return Response.json({ error: 'channel, content, sender_email, sender_name required' }, { status: 400 });
    }

    const trimmed = String(content).trim();
    if (!trimmed) {
      return Response.json({ error: 'Reply text is empty' }, { status: 400 });
    }

    // Create the message as the replying user (service role; no session available)
    const message = await base44.asServiceRole.entities.TeamMessage.create({
      channel: String(channel),
      content: trimmed,
      sender_name: String(sender_name),
      sender_email: String(sender_email),
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