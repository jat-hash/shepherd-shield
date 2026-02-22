import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event } = await req.json();

    if (!event || event.type !== 'create' || !event.data?.is_active) {
      return Response.json({ success: false, message: 'Not an active alert creation' });
    }

    const alert = event.data;
    const allUsers = await base44.asServiceRole.entities.User.list();

    if (allUsers.length === 0) {
      return Response.json({ success: false, message: 'No users to notify' });
    }

    const results = [];

    // Send FCM notification to each user
    for (const user of allUsers) {
      try {
        const notifResult = await base44.functions.invoke('sendFCMNotification', {
          recipient_email: user.email,
          title: `🚨 EMERGENCY: ${alert.alert_type}`,
          body: alert.message,
          alert_id: alert.id
        });
        results.push({
          user_email: user.email,
          success: notifResult.data?.success || false
        });
      } catch (error) {
        console.error(`Error notifying ${user.email}:`, error);
        results.push({
          user_email: user.email,
          success: false
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`Emergency alert broadcast: ${successCount}/${allUsers.length} users notified`);
    
    return Response.json({ 
      success: true,
      total_users: allUsers.length,
      notified: successCount
    });
  } catch (error) {
    console.error('Error in broadcastEmergencyPush:', error);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});