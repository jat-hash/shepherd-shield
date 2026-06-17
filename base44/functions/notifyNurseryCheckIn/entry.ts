import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let payload = {};
    try {
      payload = await req.json();
    } catch (_) {
      payload = {};
    }

    const event = payload.event || {};
    const data = payload.data || null;

    if (!data) {
      return Response.json({ success: false, error: 'No entity data in payload' });
    }

    const childName = data.child_name || 'Unknown Child';
    const parentName = data.parent_name || '';
    const checkInTime = data.check_in_time
      ? new Date(data.check_in_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      : '';
    const checkOutTime = data.check_out_time
      ? new Date(data.check_out_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      : '';

    const isCheckOut = event.type === 'update' && data.checked_in === false && !!data.check_out_time;
    const isCheckIn = event.type === 'create' || (event.type === 'update' && data.checked_in === true && !data.check_out_time);

    if (!isCheckIn && !isCheckOut) {
      return Response.json({ success: true, message: 'No relevant state change, skipping' });
    }

    const title = isCheckOut ? '👶 Child Checked Out' : '👶 Child Checked In';
    const body = isCheckOut
      ? `${childName} was picked up${parentName ? ' by ' + parentName : ''}${checkOutTime ? ' at ' + checkOutTime : ''}`
      : `${childName} checked in${parentName ? ' — Parent: ' + parentName : ''}${checkInTime ? ' at ' + checkInTime : ''}`;

    const allUsers = await base44.asServiceRole.entities.User.list();
    const nurseryStaff = allUsers.filter(function(u) {
      return u.role === 'nursery' || u.role === 'admin';
    });

    console.log('Notifying ' + nurseryStaff.length + ' nursery staff: ' + title);

    const firebaseServerKey = Deno.env.get('FIREBASE_SERVER_KEY');

    if (firebaseServerKey && nurseryStaff.length > 0) {
      const tokenResults = await Promise.all(
        nurseryStaff.map(function(u) {
          return base44.asServiceRole.entities.UserDevice.filter({ user_email: u.email });
        })
      );
      const allTokens = tokenResults.flat().map(function(d) { return d.fcm_token; }).filter(Boolean);

      if (allTokens.length > 0) {
        const fcmRes = await fetch('https://fcm.googleapis.com/fcm/send', {
          method: 'POST',
          headers: {
            'Authorization': 'key=' + firebaseServerKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            registration_ids: allTokens,
            notification: { title: title, body: body, sound: 'default' },
            data: { notification_type: 'nursery_checkin', click_url: '/NurseryDashboard' },
            priority: 'high'
          })
        });
        const fcmData = await fcmRes.json();
        console.log('FCM sent to ' + allTokens.length + ' devices, success=' + fcmData.success + ', failure=' + fcmData.failure);
      } else {
        console.log('No FCM tokens found for nursery staff');
      }
    }

    await Promise.all(
      nurseryStaff.map(function(u) {
        return base44.asServiceRole.entities.Notification.create({
          user_email: u.email,
          title: title,
          message: body,
          type: 'general',
          read: false,
        });
      })
    );

    return Response.json({ success: true, notified: nurseryStaff.length });
  } catch (error) {
    console.error('notifyNurseryCheckIn error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});