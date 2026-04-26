import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Church hub coordinates: 21224 Orting Kapowsin Hwy E, Graham, WA 98338
const HUB_LAT = 47.0637;
const HUB_LON = -122.2525;
const VICINITY_MILES = 2;

// Helper: calculate distance in miles between two GPS coordinates (Haversine)
function distanceMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8; // Earth radius in miles
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
  const existing = await base44.asServiceRole.entities.Notification.filter({
    user_email: userEmail
  });
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

    // ── Fetch all today's assignments ──────────────────────────────────────────
    const todayAssignments = await base44.asServiceRole.entities.Assignment.filter({
      service_date: today
    });

    let autoCheckedOut = 0;

    for (const assignment of todayAssignments) {
      if (!assignment.service_date || !assignment.start_time || !assignment.end_time) continue;

      const startDateTime = parseServiceTime(assignment.service_date, assignment.start_time);
      const endDateTime = parseServiceTime(assignment.service_date, assignment.end_time);

      const fiveMinBeforeStart = new Date(startDateTime.getTime() - 5 * 60 * 1000);
      const fortyFiveMinAfterEnd = new Date(endDateTime.getTime() + 45 * 60 * 1000);
      const oneHourAfterEnd = new Date(endDateTime.getTime() + 60 * 60 * 1000);

      // ── Auto check-in: if within service window, not yet checked in, and within 2 miles of hub ──
      if (!assignment.checked_in && now >= fiveMinBeforeStart && now <= endDateTime) {
        // Look up live location for this user
        const liveLocations = await base44.asServiceRole.entities.LiveLocation.filter({
          user_email: assignment.assigned_to_email,
          is_active: true
        });
        const loc = liveLocations?.[0];
        if (loc?.latitude && loc?.longitude) {
          const dist = distanceMiles(loc.latitude, loc.longitude, HUB_LAT, HUB_LON);
          if (dist <= VICINITY_MILES) {
            await base44.asServiceRole.entities.Assignment.update(assignment.id, {
              checked_in: true,
              check_in_time: now.toISOString(),
              check_in_latitude: loc.latitude,
              check_in_longitude: loc.longitude
            });
            await notify(base44, {
              user_email: assignment.assigned_to_email,
              title: "Auto Checked In",
              message: `You've been automatically checked in to ${assignment.position_name} — you're within ${VICINITY_MILES} miles of the church.`,
              type: "assignment_reminder",
              assignment_id: assignment.id
            });
            console.log(`Auto checked in: ${assignment.assigned_to_name} (${dist.toFixed(2)} mi from hub)`);
            assignment.checked_in = true; // update local state to skip further check-in alerts below
          }
        }
      }

      // ── A. 5-min pre-service alert: not checked in yet ─────────────────────
      if (!assignment.checked_in && now >= fiveMinBeforeStart && now < startDateTime) {
        const alerted = await alreadyNotified(
          base44, assignment.assigned_to_email, "Check In Now", 30 * 60 * 1000
        );
        if (!alerted) {
          const radioMsg = assignment.radio_channel
            ? ` Pick up your radio on Channel ${assignment.radio_channel}.`
            : "";
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

      // ── B. Service started but still not checked in (alert every 30 min) ───
      if (!assignment.checked_in && now >= startDateTime && now < endDateTime) {
        const alerted = await alreadyNotified(
          base44, assignment.assigned_to_email, "You Haven't Checked In", 30 * 60 * 1000
        );
        if (!alerted) {
          const radioMsg = assignment.radio_channel
            ? ` Make sure to pick up your radio on Channel ${assignment.radio_channel}.`
            : "";
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

      // ── C. Auto check-out 45 min past end time (if still within 2 miles) or 1 hour hard cutoff ──
      if (assignment.checked_in && !assignment.checked_out && now > fortyFiveMinAfterEnd) {
        let shouldAutoCheckOut = false;

        // Check GPS — auto check-out if they've left the 2-mile vicinity
        const liveLocations = await base44.asServiceRole.entities.LiveLocation.filter({
          user_email: assignment.assigned_to_email,
          is_active: true
        });
        const loc = liveLocations?.[0];
        if (loc?.latitude && loc?.longitude) {
          const dist = distanceMiles(loc.latitude, loc.longitude, HUB_LAT, HUB_LON);
          if (dist > VICINITY_MILES) {
            shouldAutoCheckOut = true;
            console.log(`GPS auto checkout: ${assignment.assigned_to_name} is ${dist.toFixed(2)} mi away`);
          }
        } else if (now > oneHourAfterEnd) {
          // No GPS data — fall back to hard 1-hour cutoff
          shouldAutoCheckOut = true;
          console.log(`Hard cutoff auto checkout: ${assignment.assigned_to_name} (no GPS)`);
        }

        if (shouldAutoCheckOut) {
          await base44.asServiceRole.entities.Assignment.update(assignment.id, {
            checked_out: true,
            check_out_time: now.toISOString()
          });
          autoCheckedOut++;

          // Also notify about radio return if they had one
          if (assignment.radio_channel) {
            const alerted = await alreadyNotified(
              base44, assignment.assigned_to_email, "Return Your Radio", 2 * 60 * 60 * 1000
            );
            if (!alerted) {
              await notify(base44, {
                user_email: assignment.assigned_to_email,
                title: "Return Your Radio",
                message: `You've been auto checked out from ${assignment.service_type || 'service'}. Please return your radio (Channel ${assignment.radio_channel}) immediately.`,
                type: "assignment_reminder",
                assignment_id: assignment.id
              });
            }
          }

          console.log(`Auto checked out: ${assignment.assigned_to_name} from ${assignment.position_name}`);
        }
      }
    }

    // ── 2. Alert for unreturned equipment 1 hour past service end ────────────
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

    return Response.json({ success: true, auto_checked_out: autoCheckedOut });
  } catch (error) {
    console.error('autoCheckOut error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});