import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Church hub coordinates: 21224 Orting Kapowsin Hwy E, Graham, WA 98338
const HUB_LAT = 47.0637;
const HUB_LON = -122.2525;
const VICINITY_MILES = 5;

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

    // ── 1. GPS-based check-in/out for assignments ─────────────────────────────
    // Source of truth: LiveLocation records.
    // is_active=true + within 2mi → check in assignment
    // is_active=true + outside 2mi → check out assignment (user has left)
    // is_active=false → user manually checked out, don't touch

    // Fetch ALL locations (active or not) — is_active=false just means user manually checked out
    // but we still use GPS proximity for assignment check-in
    const allLocations = await base44.asServiceRole.entities.LiveLocation.filter({});
    let autoCheckedIn = 0;
    let autoCheckedOut = 0;

    for (const loc of allLocations) {
      if (!loc.user_email || !loc.latitude || !loc.longitude) continue;

      // Skip stale locations (not updated in 8 hours - covers a full service day with backgrounded app)
      const lastUpdated = loc.last_updated ? new Date(loc.last_updated) : null;
      if (lastUpdated && (now - lastUpdated) > 8 * 60 * 60 * 1000) {
        console.log(`Skipping stale location for ${loc.user_name} (${Math.round((now - lastUpdated) / 60000)} min old)`);
        continue;
      }
      if (!lastUpdated) continue; // No timestamp at all, skip

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
            const inTitle = "✅ Arrived at Church";
            const inMsg = `${loc.user_name}, you've entered the church vicinity and been checked in to ${assignment.position_name}. Service starts at ${assignment.start_time}.`;
            await notify(base44, {
              user_email: loc.user_email,
              title: "Auto Checked In",
              message: inMsg,
              type: "assignment_reminder",
              assignment_id: assignment.id
            });
            await Promise.all([
              sendPush(base44, loc.user_email, inTitle, inMsg),
              sendSMS(loc.user_email, base44, `Shepherd Shield: ${inTitle} — ${inMsg}`),
            ]);
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

          const outTitle = "🚪 Left Church Vicinity";
          const radioNote = assignment.radio_channel ? ` Please return your radio (Ch ${assignment.radio_channel}).` : "";
          const outMsg = `${loc.user_name}, you've left the church area and been checked out from ${assignment.position_name}.${radioNote}`;

          await notify(base44, {
            user_email: loc.user_email,
            title: "Auto Checked Out",
            message: outMsg,
            type: "assignment_reminder",
            assignment_id: assignment.id
          });
          await Promise.all([
            sendPush(base44, loc.user_email, outTitle, outMsg),
            sendSMS(loc.user_email, base44, `Shepherd Shield: ${outTitle} — ${outMsg}`),
          ]);
          console.log(`Auto checked OUT: ${loc.user_name} from ${assignment.position_name} (${dist.toFixed(2)} mi away)`);
        }
      }
    }

    // ── 2. Assignment alerts & hard fallback for users WITHOUT active GPS ──────
    const todayAssignments = await base44.asServiceRole.entities.Assignment.filter({ service_date: today });
    // Users with a recent location record are handled by GPS above; skip them from time-based fallback
    const eightHoursAgo = new Date(now - 8 * 60 * 60 * 1000);
    const activeUserEmails = new Set(
      allLocations
        .filter(l => l.last_updated && new Date(l.last_updated) > eightHoursAgo)
        .map(l => l.user_email)
    );

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