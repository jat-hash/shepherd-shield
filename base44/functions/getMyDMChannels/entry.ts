import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  // Fetch only messages in DM channels that contain this user's email
  // Two queries: messages sent by user in DM channels, and messages received (where channel includes their email)
  const [sent, received] = await Promise.all([
    base44.asServiceRole.entities.TeamMessage.filter({ sender_email: user.email }, '-created_date', 500),
    base44.asServiceRole.entities.TeamMessage.list('-created_date', 500),
  ]);

  const dmSet = new Set();
  // From sent: DM channels the user sent in
  sent.forEach(msg => {
    if (msg.channel?.startsWith('DM: ') && msg.channel.includes(user.email)) {
      dmSet.add(msg.channel);
    }
  });
  // From all: DM channels where user is recipient (not sender)
  received.forEach(msg => {
    if (msg.channel?.startsWith('DM: ') && msg.channel.includes(user.email)) {
      dmSet.add(msg.channel);
    }
  });

  return Response.json({ channels: Array.from(dmSet) });
});