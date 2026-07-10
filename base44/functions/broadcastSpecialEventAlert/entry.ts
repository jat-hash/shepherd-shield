import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const { event_id, event_name, event_type, message } = await req.json();

    if (!event_id || !event_name || !message) {
      return Response.json({ 
        error: 'event_id, event_name, and message required' 
      }, { status: 400 });
    }

    // Get all users
    const allUsers = await base44.asServiceRole.entities.User.list();

    if (allUsers.length === 0) {
      return Response.json({ 
        message: 'No users to notify',
        success: false 
      });
    }

    const results = [];

    // Send notification to each user
    for (const recipient of allUsers) {
      try {
        const notifResult = await base44.asServiceRole.functions.invoke('sendDualPush', {
          recipient_email: recipient.email,
          title: `Special Event: ${event_name}`,
          body: message,
          alert_id: event_id,
          notification_type: 'general',
          click_url: '/SpecialEvents',
        });
        results.push({
          user_email: recipient.email,
          success: notifResult.data?.success || false
        });
      } catch (error) {
        console.error(`Error notifying ${recipient.email}:`, error);
        results.push({
          user_email: recipient.email,
          success: false,
          error: error.message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    return Response.json({ 
      success: successCount > 0,
      total_users: allUsers.length,
      notified: successCount,
      results
    });
  } catch (error) {
    console.error('Error in broadcastSpecialEventAlert:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});