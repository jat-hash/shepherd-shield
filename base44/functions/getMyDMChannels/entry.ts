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
  const { caller_email } = body;

  if (!userEmail && caller_email) {
    userEmail = caller_email;
  }

  if (!userEmail) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  // Find all DM channels where this user is a participant
  const allDMs = await base44.asServiceRole.entities.TeamMessage.list('-created_date', 500);

  const dmSet = new Set();
  allDMs.forEach(msg => {
    if (msg.channel?.startsWith('DM: ') && msg.channel.includes(userEmail)) {
      dmSet.add(msg.channel);
    }
  });

  return Response.json({ channels: Array.from(dmSet) });
});