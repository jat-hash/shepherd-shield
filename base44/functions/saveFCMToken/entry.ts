import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { fcm_token, device_id } = await req.json();

    if (!fcm_token) {
      return Response.json({ error: 'FCM token required' }, { status: 400 });
    }

    // Check if device already exists
    const existing = await base44.entities.UserDevice.filter({
      user_email: user.email,
      device_id: device_id || 'default'
    });

    if (existing.length > 0) {
      // Update existing token
      await base44.entities.UserDevice.update(existing[0].id, {
        fcm_token,
        user_email: user.email,
        device_id: device_id || 'default'
      });
    } else {
      // Create new device entry
      await base44.entities.UserDevice.create({
        user_email: user.email,
        fcm_token,
        device_id: device_id || 'default'
      });
    }

    return Response.json({ 
      success: true, 
      message: 'FCM token saved successfully' 
    });
  } catch (error) {
    console.error('Error saving FCM token:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});