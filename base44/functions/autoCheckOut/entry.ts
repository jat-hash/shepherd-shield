import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Church campus center: 21224 Orting Kapowsin Hwy E, Graham, WA 98338
const CAMPUS_LAT = 47.0637;
const CAMPUS_LON = -122.2525;
// Campus boundary radius — 3 miles covers the church area.
// Auto-checkout fires only when the user moves beyond this perimeter.
const CAMPUS_RADIUS_MILES = 3;

const FIREBASE_SERVER_KEY = Deno.env.get("FIREBASE_SERVER_KEY");
const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER");

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
  // Parse as Pacific Time by appending the offset explicitly
  // Pacific Standard Time = UTC-8, Pacific Daylight Time = UTC-7
  // We use the Intl API to determine the correct offset for the given date
  const [h, m] = time.split(":").map(Number);
  // Build a UTC date first, then adjust by PT offset
  const naive = new Date(`${date}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00Z`);
  // Get the PT offset in minutes for that date
  const ptOffset = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', timeZoneName: 'shortOffset' })
    .formatToParts(naive)
    .find(p => p.type === 'timeZoneName')?.value || 'GMT-7';
  const offsetMatch = ptOffset.match(/GMT([+-]\d+)/);
  const offsetHours = offsetMatch ? parseInt(offsetMatch[1]) : -7;
  return new Date(naive.getTime() - offsetHours * 60 * 60 * 1000);
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

// Send FCM push notification to all registered devices for a user
async function sendPush(base44, userEmail, title, body) {
  if (!FIREBASE_SERVER_KEY) return;
  try {
    const devices = await base44.asServiceRole.entities.UserDevice.filter({ user_email: userEmail });
    if (!devices || devices.length === 0) return;
    const tokens = devices.map(d => d.fcm_token).filter(Boolean);
    if (tokens.length === 0) return;

    await fetch("https://fcm.googleapis.com/fcm/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `key=${FIREBASE_SERVER_KEY}`,
      },
      body: JSON.stringify({
        registration_ids: tokens,
        notification: { title, body },
        data: { title, body },
        priority: "high",
      }),
    });
    console.log(`Push sent to ${userEmail}: ${title}`);
  } catch (e) {
    console.warn(`Push failed for ${userEmail}:`, e.message);
  }
}

// Send SMS via Twilio
async function sendSMS(userEmail, base44, message) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) return;
  try {
    const users = await base44.asServiceRole.entities.User.filter({ email: userEmail });
    const phone = users?.[0]?.phone_number;
    if (!phone) return;

    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
    const creds = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
    const body = new URLSearchParams({ To: phone, From: TWILIO_PHONE_NUMBER, Body: message });

    await fetch(url, {
      method: "POST",
      headers: { "Authorization": `Basic ${creds}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    console.log(`SMS sent to ${userEmail} (${phone}): ${message.slice(0, 50)}...`);
  } catch (e) {
    console.warn(`SMS failed for ${userEmail}:`, e.message);
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const now = new Date();
    // Use Pacific Time (America/Los_Angeles) local date to match how assignments are created
    const today = now.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });

    // Assignments are MANUAL check-in/out only — no GPS automation for assignments.
    // GPS auto check-in/out applies only to PersonalCheckIn (handled in the PersonalCheckIn component).

    let autoCheckedIn = 0;
    let autoCheckedOut = 0;

    // ── 0. Campus boundary arrival notifications ──────────────────────────────
    // Notify leaders when a team member's live location crosses INTO the 3-mile campus boundary.
    const allLiveLocations = await base44.asServiceRole.entities.LiveLocation.filter({ is_active: true });
    const allUsers = await base44.asServiceRole.entities.User.list();
    const leaderPatterns = ['james lim', 'wilbert ryan'];
    const leaderRoles = ['security_chief', 'security chief', 'chief', 'admin'];
    const leaders = allUsers.filter(u => {
      const name = (u.full_name || u.display_name || '').toLowerCase();
      const role = (u.role || '').toLowerCase();
      return leaderPatterns.some(p => name.includes(p)) || leaderRoles.some(r => role.includes(r));
    });

    for (const loc of allLiveLocations) {
      if (!loc.latitude || !loc.longitude) continue;
      const dist = distanceMiles(loc.latitude, loc.longitude, CAMPUS_LAT, CAMPUS_LON);
      const isOnCampus = dist <= CAMPUS_RADIUS_MILES;
      if (!isOnCampus) continue;

      // Only notify once per person per day (use a 12-hour window)
      const arrivalTitle = `📍 On Campus: ${loc.user_name}`;
      const alreadySent = await alreadyNotified(base44, leaders[0]?.email || '', arrivalTitle, 12 * 60 * 60 * 1000);
      if (alreadySent) continue;

      const arrivalMsg = `${loc.user_name} has arrived on campus (${dist.toFixed(2)} mi from campus center).`;
      await Promise.all(leaders.map(leader =>
        base44.asServiceRole.entities.Notification.create({
          user_email: leader.email,
          title: arrivalTitle,
          message: arrivalMsg,
          type: 'general',
          read: false
        })
      ));
      console.log(`Campus arrival notified for: ${loc.user_name}`);
    }

    // ── 1. Assignment alerts & hard fallback checkout ─────────────────────────
    const todayAssignments = await base44.asServiceRole.entities.Assignment.filter({ service_date: today });

    for (const assignment of todayAssignments) {
      if (!assignment.service_date || !assignment.start_time || !assignment.end_time) continue;

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

      // 15-min before end reminder: "Wrap up your tasks"
      const fifteenMinBeforeEnd = new Date(endDateTime.getTime() - 15 * 60 * 1000);
      if (assignment.checked_in && !assignment.checked_out && now >= fifteenMinBeforeEnd && now < endDateTime) {
        const alerted = await alreadyNotified(base44, assignment.assigned_to_email, "Shift Ending Soon", 30 * 60 * 1000);
        if (!alerted) {
          await notify(base44, {
            user_email: assignment.assigned_to_email,
            title: "Shift Ending Soon",
            message: `Your ${assignment.position_name} shift ends in 15 minutes. Please begin wrapping up your tasks and ensure your area is secure.`,
            type: "assignment_reminder",
            assignment_id: assignment.id
          });
          await sendPush(base44, assignment.assigned_to_email, "⏰ Shift Ending Soon", `Your ${assignment.position_name} shift ends in 15 minutes. Begin wrapping up your tasks.`);
          console.log(`15-min end reminder sent to: ${assignment.assigned_to_name}`);
        }
      }

      // Auto check-out only if user has left the 3-mile vicinity (GPS-based only)
      if (assignment.checked_in && !assignment.checked_out) {
        let shouldCheckOut = false;
        let reason = '';

        // GPS: user has left the campus boundary (0.25-mile radius around church property)
        const liveLocations = await base44.asServiceRole.entities.LiveLocation.filter({
          user_email: assignment.assigned_to_email,
          is_active: true
        });
        const loc = liveLocations?.[0];
        if (loc?.latitude && loc?.longitude) {
          const dist = distanceMiles(loc.latitude, loc.longitude, CAMPUS_LAT, CAMPUS_LON);
          if (dist > CAMPUS_RADIUS_MILES) {
            shouldCheckOut = true;
            reason = `left campus boundary (${(dist * 5280).toFixed(0)} ft from campus center)`;
          }
        } else {
          // No live location available — skip auto-checkout, do not assume they left
          console.log(`No live location for ${assignment.assigned_to_name} — skipping GPS auto-checkout`);
        }

        if (shouldCheckOut) {
          // Re-fetch the assignment to confirm it's still not checked out (avoid race/cache issues)
          const freshList = await base44.asServiceRole.entities.Assignment.filter({
            service_date: today,
            assigned_to_email: assignment.assigned_to_email
          });
          const fresh = freshList?.find(a => a.id === assignment.id);
          if (!fresh || fresh.checked_out) {
            console.log(`Skipping auto-checkout for ${assignment.assigned_to_name}: already checked out (fresh check)`);
            continue;
          }
          const checkOutTime = now.toISOString();
          await base44.asServiceRole.entities.Assignment.update(assignment.id, {
            checked_out: true,
            check_out_time: checkOutTime
          });
          // Also close any open PersonalCheckIn for today
          const openCheckIns = await base44.asServiceRole.entities.PersonalCheckIn.filter({
            user_email: assignment.assigned_to_email,
            check_in_date: today
          });
          const open = openCheckIns.find(r => !r.check_out_time);
          if (open) {
            await base44.asServiceRole.entities.PersonalCheckIn.update(open.id, { check_out_time: checkOutTime });
          }
          autoCheckedOut++;
          console.log(`Auto checkout (${reason}): ${assignment.assigned_to_name}`);
        }
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