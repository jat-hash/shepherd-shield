import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Church hub coordinates: 21224 Orting Kapowsin Hwy E, Graham, WA 98338
const HUB_LAT = 47.0637;
const HUB_LON = -122.2525;
const VICINITY_MILES = 2;

// Helper: calculate distance in miles between two GPS coordinates (Haversine)
function distanceMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Helper: parse a service_date + time string into a Date object
function parseServiceTime(date, time) {
  const [h, m] = time.split(":").map(Number);
  return new Date(`${date}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`);
}

// Helper: check if a notification was already sent recently (within windowMs)
async function alreadyNotified(base44, userEmail, title, windowMs) {
  const existing = await base44.asServiceRole.entities.Notification.filter({ user_email: userEmail });
  const now = Date.now();
  return existing?.some(n => n.title === title && (now - new Date(n.created_date).getTime()) < windowMs);
}

// Helper: create a notification
async function notify(base44, { user_email, title, message, type, assignment_id }) {
  await base44.asServiceRole.entities.Notification.create({
    user_email,
    title,
    message,
    type: type || "general",
    ...(assignment_id ? { assignment_id } : {}),
    read: false
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const now = new Date();
    const today = now.toISOString().split("T")[0];

    // ── 1. GPS-based check-in/out for ALL users with live location ────────────
    // This is purely proximity-based — no assignment or time restrictions.
    const allLocations = await base44.asServiceRole.entities.LiveLocation.list();

    let autoCheckedIn = 0;
    let autoCheckedOut = 0;

    for (const loc of allLocations) {
      if (!loc.user_email || !loc.latitude || !loc.longitude) continue;

      const dist = distanceMiles(loc.latitude, loc.longitude, HUB_LAT, HUB_LON);
      const isNear = dist <= VICINITY_MILES;

      // Find today's assignments for this user that are not fully settled
      const userAssignments = await base44.asServiceRole.entities.Assignment.filter({
        assigned_to_email: loc.user_email,
        service_date: today
      });

      for (const assignment of userAssignments) {
        // ── Check IN: user is near and not yet checked in ──
        if (isNear && !assignment.checked_in) {
          await base44.asServiceRole.entities.Assignment.update(assignment.id, {
            checked_in: true,
            check_in_time: now.toISOString(),
            check_in_latitude: loc.latitude,
            check_in_longitude: loc.longitude
          });
          autoCheckedIn++;

          const alerted = await alreadyNotified(base44, loc.user_email, "Auto Checked In", 60 * 60 * 1000);
          if (!alerted) {
            await notify(base44, {
              user_email: loc.user_email,
              title: "Auto Checked In",
              message: `You've been automatically checked in to ${assignment.position_name} — you're within ${VICINITY_MILES} miles of the church.`,
              type: "assignment_reminder",
              assignment_id: assignment.id
            });
          }
          console.log(`Auto checked IN: ${loc.user_name} (${dist.toFixed(2)} mi)`);
        }

        // ── Check OUT: user has left and is checked in but not out ──
        if (!isNear && assignment.checked_in && !assignment.checked_out) {
          await base44.asServiceRole.entities.Assignment.update(assignment.id, {
            checked_out: true,
            check_out_time: now.toISOString()
          });
          autoCheckedOut++;

          // Notify about radio return if applicable
          if (assignment.radio_channel) {
            const alerted = await alreadyNotified(base44, loc.user_email, "Return Your Radio", 2 * 60 * 60 * 1000);
            if (!alerted) {
              await notify(base44, {
                user_email: loc.user_email,
                title: "Return Your Radio",
                message: `You've been auto checked out from ${assignment.service_type || 'service'}. Please return your radio (Channel ${assignment.radio_channel}).`,
                type: "assignment_reminder",
                assignment_id: assignment.id
              });
            }
          }

          await notify(base44, {
            user_email: loc.user_email,
            title: "Auto Checked Out",
            message: `You've been automatically checked out from ${assignment.position_name} — you left the church vicinity.`,
            type: "assignment_reminder",
            assignment_id: assignment.id
          });
          console.log(`Auto checked OUT: ${loc.user_name} (${dist.toFixed(2)} mi away)`);
        }
      }

      // ── PersonalCheckIn: handle users with no assignments today ──
      // Check in: near + no open personal check-in today
      if (isNear) {
        const openCheckIns = await base44.asServiceRole.entities.PersonalCheckIn.filter({
          user_email: loc.user_email,
          check_in_date: today
        });
        const hasOpen = openCheckIns?.some(c => !c.check_out_time);
        if (!hasOpen) {
          await base44.asServiceRole.entities.PersonalCheckIn.create({
            user_email: loc.user_email,
            user_name: loc.user_name || loc.user_email,
            check_in_date: today,
            check_in_time: now.toISOString(),
            latitude: loc.latitude,
            longitude: loc.longitude
          });
          console.log(`Personal check-in created for ${loc.user_name}`);
        }
      }

      // Check out: left + has open personal check-in
      if (!isNear) {
        const openCheckIns = await base44.asServiceRole.entities.PersonalCheckIn.filter({
          user_email: loc.user_email,
          check_in_date: today
        });
        for (const ci of openCheckIns) {
          if (!ci.check_out_time) {
            await base44.asServiceRole.entities.PersonalCheckIn.update(ci.id, {
              check_out_time: now.toISOString()
            });
            console.log(`Personal check-out recorded for ${loc.user_name}`);
          }
        }
      }
    }

    // ── 2. Assignment alerts (for users without GPS) ──────────────────────────
    const todayAssignments = await base44.asServiceRole.entities.Assignment.filter({ service_date: today });
    const activeUserEmails = new Set(allLocations.map(l => l.user_email));

    for (const assignment of todayAssignments) {
      if (!assignment.service_date || !assignment.start_time || !assignment.end_time) continue;
      // Skip if this user has live GPS (handled above)
      if (activeUserEmails.has(assignment.assigned_to_email)) continue;

      const startDateTime = parseServiceTime(assignment.service_date, assignment.start_time);
      const endDateTime = parseServiceTime(assignment.service_date, assignment.end_time);
      const fiveMinBeforeStart = new Date(startDateTime.getTime() - 5 * 60 * 1000);

      // 5-min pre-service alert
      if (!assignment.checked_in && now >= fiveMinBeforeStart && now < startDateTime) {
        const alerted = await alreadyNotified(base44, assignment.assigned_to_email, "Check In Now", 30 * 60 * 1000);
        if (!alerted) {
          const radioMsg = assignment.radio_channel ? ` Pick up your radio on Channel ${assignment.radio_channel}.` : "";
          await notify(base44, {
            user_email: assignment.assigned_to_email,
            title: "Check In Now",
            message: `Your ${assignment.service_type || 'service'} assignment (${assignment.position_name}) starts in 5 minutes. Please check in via the app.${radioMsg}`,
            type: "assignment_reminder",
            assignment_id: assignment.id
          });
          console.log(`5-min check-in alert sent to ${assignment.assigned_to_name}`);
        }
      }

      // Service started but not checked in
      if (!assignment.checked_in && now >= startDateTime && now < endDateTime) {
        const alerted = await alreadyNotified(base44, assignment.assigned_to_email, "You Haven't Checked In", 30 * 60 * 1000);
        if (!alerted) {
          const radioMsg = assignment.radio_channel ? ` Make sure to pick up your radio on Channel ${assignment.radio_channel}.` : "";
          await notify(base44, {
            user_email: assignment.assigned_to_email,
            title: "You Haven't Checked In",
            message: `Your ${assignment.service_type || 'service'} assignment (${assignment.position_name}) has started. Please check in now.${radioMsg}`,
            type: "assignment_reminder",
            assignment_id: assignment.id
          });
          console.log(`Missed check-in alert sent to ${assignment.assigned_to_name}`);
        }
      }

      // Hard auto check-out 1 hour after service end (no GPS fallback)
      const oneHourAfterEnd = new Date(endDateTime.getTime() + 60 * 60 * 1000);
      if (assignment.checked_in && !assignment.checked_out && now > oneHourAfterEnd) {
        await base44.asServiceRole.entities.Assignment.update(assignment.id, {
          checked_out: true,
          check_out_time: oneHourAfterEnd.toISOString()
        });
        autoCheckedOut++;
        console.log(`Hard cutoff auto checkout: ${assignment.assigned_to_name}`);
      }
    }

    // ── 3. Alert for unreturned equipment 1 hour past latest service end ──────
    const equipment = await base44.asServiceRole.entities.Equipment.filter({ checked_out: true });
    let latestServiceEnd = null;
    for (const a of todayAssignments) {
      if (!a.end_time) continue;
      const endDT = parseServiceTime(today, a.end_time);
      if (!latestServiceEnd || endDT > latestServiceEnd) latestServiceEnd = endDT;
    }
    if (latestServiceEnd) {
      const oneHourAfterService = new Date(latestServiceEnd.getTime() + 60 * 60 * 1000);
      if (now > oneHourAfterService) {
        for (const item of equipment) {
          if (!item.checked_out_by) continue;
          const users = await base44.asServiceRole.entities.User.filter({ full_name: item.checked_out_by });
          const userEmail = users?.[0]?.email;
          if (!userEmail) continue;
          const alerted = await alreadyNotified(base44, userEmail, "Return Equipment", 2 * 60 * 60 * 1000);
          if (!alerted) {
            await notify(base44, {
              user_email: userEmail,
              title: "Return Equipment",
              message: `Please return "${item.name}" — service has ended and equipment should be checked back in.`,
              type: "general"
            });
            console.log(`Equipment return alert sent to ${item.checked_out_by} for ${item.name}`);
          }
        }
      }
    }

    return Response.json({ success: true, auto_checked_in: autoCheckedIn, auto_checked_out: autoCheckedOut });
  } catch (error) {
    console.error('autoCheckOut error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});