import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Church hub coordinates: 21224 Orting Kapowsin Hwy E, Graham, WA 98338
const HUB_LAT = 47.0637;
const HUB_LON = -122.2525;
const VICINITY_MILES = 2;

function distanceMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function parseServiceTime(date, time) {
  const [h, m] = time.split(":").map(Number);
  return new Date(`${date}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`);
}

async function alreadyNotified(base44, userEmail, title, windowMs) {
  const existing = await base44.asServiceRole.entities.Notification.filter({ user_email: userEmail });
  const now = Date.now();
  return existing?.some(n => n.title === title && (now - new Date(n.created_date).getTime()) < windowMs);
}

async function notify(base44, { user_email, title, message, type, assignment_id }) {
  await base44.asServiceRole.entities.Notification.create({
    user_email, title, message,
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

    // ── 1. GPS-based check-in/out for assignments ─────────────────────────────
    // Source of truth: LiveLocation records.
    // is_active=true + within 2mi → check in assignment
    // is_active=true + outside 2mi → check out assignment (user has left)
    // is_active=false → user manually checked out, don't touch

    const allLocations = await base44.asServiceRole.entities.LiveLocation.filter({ is_active: true });
    let autoCheckedIn = 0;
    let autoCheckedOut = 0;

    for (const loc of allLocations) {
      if (!loc.user_email || !loc.latitude || !loc.longitude) continue;

      // Skip stale locations (not updated in 30 minutes)
      const lastUpdated = loc.last_updated ? new Date(loc.last_updated) : null;
      if (lastUpdated && (now - lastUpdated) > 30 * 60 * 1000) {
        console.log(`Skipping stale location for ${loc.user_name} (${Math.round((now - lastUpdated) / 60000)} min old)`);
        continue;
      }

      const dist = distanceMiles(loc.latitude, loc.longitude, HUB_LAT, HUB_LON);
      const isNear = dist <= VICINITY_MILES;

      const userAssignments = await base44.asServiceRole.entities.Assignment.filter({
        assigned_to_email: loc.user_email,
        service_date: today
      });

      for (const assignment of userAssignments) {
        // ── Auto check IN ──────────────────────────────────────────────────
        if (isNear && !assignment.checked_in) {
          await base44.asServiceRole.entities.Assignment.update(assignment.id, {
            checked_in: true,
            check_in_time: now.toISOString(),
            check_in_latitude: loc.latitude,
            check_in_longitude: loc.longitude
          });
          autoCheckedIn++;

          const alerted = await alreadyNotified(base44, loc.user_email, "Auto Checked In", 4 * 60 * 60 * 1000);
          if (!alerted) {
            await notify(base44, {
              user_email: loc.user_email,
              title: "Auto Checked In",
              message: `You've been automatically checked in to ${assignment.position_name} — you're within ${VICINITY_MILES} miles of the church.`,
              type: "assignment_reminder",
              assignment_id: assignment.id
            });
          }
          console.log(`Auto checked IN: ${loc.user_name} for ${assignment.position_name} (${dist.toFixed(2)} mi)`);
        }

        // ── Auto check OUT ─────────────────────────────────────────────────
        // Only check out if they're actively sharing location but have left the area
        if (!isNear && assignment.checked_in && !assignment.checked_out) {
          await base44.asServiceRole.entities.Assignment.update(assignment.id, {
            checked_out: true,
            check_out_time: now.toISOString()
          });
          autoCheckedOut++;

          if (assignment.radio_channel) {
            const alerted = await alreadyNotified(base44, loc.user_email, "Return Your Radio", 2 * 60 * 60 * 1000);
            if (!alerted) {
              await notify(base44, {
                user_email: loc.user_email,
                title: "Return Your Radio",
                message: `You've been auto checked out from ${assignment.position_name}. Please return your radio (Channel ${assignment.radio_channel}).`,
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
          console.log(`Auto checked OUT: ${loc.user_name} from ${assignment.position_name} (${dist.toFixed(2)} mi away)`);
        }
      }
    }

    // ── 2. Assignment alerts & hard fallback for users WITHOUT active GPS ──────
    const todayAssignments = await base44.asServiceRole.entities.Assignment.filter({ service_date: today });
    const activeUserEmails = new Set(allLocations.map(l => l.user_email));

    for (const assignment of todayAssignments) {
      if (!assignment.service_date || !assignment.start_time || !assignment.end_time) continue;
      if (activeUserEmails.has(assignment.assigned_to_email)) continue; // GPS handles these

      const startDateTime = parseServiceTime(assignment.service_date, assignment.start_time);
      const endDateTime = parseServiceTime(assignment.service_date, assignment.end_time);
      const fiveMinBeforeStart = new Date(startDateTime.getTime() - 5 * 60 * 1000);
      const oneHourAfterEnd = new Date(endDateTime.getTime() + 60 * 60 * 1000);

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
        }
      }

      // Hard auto check-out 1 hour after service end (no GPS)
      if (assignment.checked_in && !assignment.checked_out && now > oneHourAfterEnd) {
        await base44.asServiceRole.entities.Assignment.update(assignment.id, {
          checked_out: true,
          check_out_time: oneHourAfterEnd.toISOString()
        });
        autoCheckedOut++;
        console.log(`Hard cutoff auto checkout: ${assignment.assigned_to_name}`);
      }
    }

    // ── 3. Alert for unreturned equipment ─────────────────────────────────────
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