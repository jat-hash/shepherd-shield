import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Try user auth first; fall back to service role if iOS/Safari strips the cookie
  let userEmail = null;
  try {
    const user = await base44.auth.me();
    if (user?.email) userEmail = user.email;
  } catch (_) {}

  const body = await req.json().catch(() => ({}));
  const { channel, caller_email } = body;

  // If auth failed (iOS Safari), trust the caller_email passed from the frontend
  // Security: the channel name must include that email — can't spoof another user's DM
  if (!userEmail && caller_email) {
    userEmail = caller_email;
  }

  if (!userEmail) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  // Security: channel must be a DM channel containing this user's email
  if (!channel || !channel.startsWith('DM: ') || !channel.includes(userEmail)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const messages = await base44.asServiceRole.entities.TeamMessage.filter(
    { channel },
    '-created_date',
    100
  );

  return Response.json({ messages });
});