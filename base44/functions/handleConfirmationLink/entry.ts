import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);
    const token = url.searchParams.get('token');

    if (!token) {
      return Response.json({ error: 'Missing token' }, { status: 400 });
    }

    // Decode assignment ID from token
    const assignment_id = atob(token);

    // Call confirmAssignment function
    const confirmResponse = await base44.functions.invoke('confirmAssignment', { assignment_id });

    // Redirect to confirmation page
    return Response.redirect('/confirmation-success', 303);
  } catch (error) {
    console.error('Confirmation link error:', error);
    return Response.redirect('/confirmation-error', 303);
  }
});