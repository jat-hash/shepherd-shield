import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { channel } = body;

  // Strict check: must be a DM channel containing this user's email
  if (!channel || !channel.startsWith('DM: ') || !channel.includes(user.email)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const messages = await base44.asServiceRole.entities.TeamMessage.filter(
    { channel },
    '-created_date',
    100
  );

  return Response.json({ messages });
});