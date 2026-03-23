import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const testUsers = [
      { email: 'john@church.local', role: 'user' },
      { email: 'sarah@church.local', role: 'user' },
      { email: 'mike@church.local', role: 'user' },
      { email: 'rachel@church.local', role: 'user' },
      { email: 'david@church.local', role: 'admin' },
    ];

    const results = [];
    for (const testUser of testUsers) {
      try {
        await base44.users.inviteUser(testUser.email, testUser.role);
        results.push({ email: testUser.email, status: 'invited' });
      } catch (error) {
        results.push({ email: testUser.email, status: 'failed', error: error.message });
      }
    }

    return Response.json({ success: true, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});