import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Nursery alerts go ONLY to these three leads
const NURSERY_LEADS = [
  'wilbert.ryan@gmail.com',      // Ryan
  'pachecosmailbox@gmail.com',   // Luis Pacheco
  'wintersjamesg@hotmail.com',  // James Winters
];

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

    // Resolve only the three designated leads
    const allUsers = await base44.asServiceRole.entities.User.list();
    const leads = allUsers.filter(function (u) { return NURSERY_LEADS.includes(u.email); });

    console.log('Notifying ' + leads.length + ' nursery leads: ' + title);

    // In-app notifications for each lead — these trigger the browser
    // notification via BrowserNotificationDispatcher. We intentionally do NOT
    // also call sendDualPush here to avoid duplicate notifications.
    await Promise.all(leads.map(function (u) {
      return base44.asServiceRole.entities.Notification.create({
        user_email: u.email,
        title: title,
        message: body,
        type: 'general',
        read: false,
      });
    }));

    // When a check-out leaves zero children checked in, send a special empty-nursery alert
    if (isCheckOut) {
      const todayStr = new Date().toISOString().slice(0, 10);
      const stillIn = await base44.asServiceRole.entities.NurseryChild.filter(
        { service_date: todayStr, checked_in: true }
      );
      if (stillIn.length === 0) {
        const emptyTitle = '⚠️ Nursery Empty';
        const emptyBody = 'All children have been checked out of the nursery.';
        await Promise.all(leads.map(function (u) {
          return base44.asServiceRole.entities.Notification.create({
            user_email: u.email,
            title: emptyTitle,
            message: emptyBody,
            type: 'general',
            read: false,
          });
        }));
        console.log('Nursery empty alert sent to leads');
      }
    }

    return Response.json({ success: true, notified: leads.length });
  } catch (error) {
    console.error('notifyNurseryCheckIn error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});