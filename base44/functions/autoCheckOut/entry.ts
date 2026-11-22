import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const FIREBASE_SERVER_KEY = Deno.env.get("FIREBASE_SERVER_KEY");
const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER");

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

    // Check-in/out is manual for everyone — no GPS distance limits anywhere.

    let autoCheckedIn = 0;
    let autoCheckedOut = 0;

    // ── 1. Assignment alerts & hard fallback checkout ─────────────────────────
    const allUsers = await base44.asServiceRole.entities.User.list();
    const todayAssignments = await base44.asServiceRole.entities.Assignment.filter({ service_date: today });

    // All automated service-start/end notifications (radio pickup/return,
    // nursery "service begins", Marathon property checklist, late/no-show
    // alerts, equipment-return) have been disabled. Only the manual Altar Call
    // and Church Out buttons send service-start/end notifications now. This
    // loop only performs the silent auto-checkout fallback.

    for (const assignment of todayAssignments) {
      if (!assignment.service_date || !assignment.start_time || !assignment.end_time) continue;

      const endDateTime = parseServiceTime(assignment.service_date, assignment.end_time);

      // Pre-service "Check In Now" / "You Haven't Checked In" reminders removed
      // — all automated service-start/end notifications are now off.

      // Auto check-out 15 min after service end (no distance/GPS limit)
      if (assignment.checked_in && !assignment.checked_out) {
        let shouldCheckOut = false;
        let reason = '';

        // Time-based fallback: 15 minutes after service end, auto-checkout.
        // Ensures assignments don't stay open if a member forgot to check out.
        const fifteenMinAfterEnd = new Date(endDateTime.getTime() + 15 * 60 * 1000);
        if (now >= fifteenMinAfterEnd) {
          shouldCheckOut = true;
          reason = `15 min after service end (auto time checkout)`;
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

    // ── 2. Every member checked out 15 min after the service time ──────────────
    // The radio only stays live while a member holds an open check-in, so a
    // check-in left open after the service keeps that member joined to the
    // channel (and burning radio minutes) until someone closes it. This pass
    // closes it for everyone, including members with no assignment that day.
    const serviceEnds = new Set<string>();

    // Standard weekly service end times, so this works even on a day whose
    // assignments were never entered in the scheduler.
    const weekday = new Date(
      now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })
    ).getDay();
    const WEEKLY_SERVICE_ENDS: Record<number, string[]> = {
      0: ['11:45', '15:00', '19:45'], // Sunday AM, Spanish, Sunday PM
      2: ['20:15'], // Tuesday Bible Study
      3: ['21:00'], // Wednesday Spanish Bible Study
      4: ['20:45'], // Thursday Services
    };
    (WEEKLY_SERVICE_ENDS[weekday] || []).forEach((time) => serviceEnds.add(time));
    // Plus the end time of every service actually scheduled today.
    todayAssignments.forEach((assignment: any) => {
      if (assignment.end_time) serviceEnds.add(assignment.end_time);
    });

    const sortedEnds = Array.from(serviceEnds)
      .map((time) => parseServiceTime(today, time))
      .sort((a, b) => a.getTime() - b.getTime());

    // Members still inside an open assignment are handled by the pass above.
    const openAssignmentEmails = new Set(
      todayAssignments
        .filter((a: any) => a.checked_in && !a.checked_out && a.assigned_to_email)
        .map((a: any) => a.assigned_to_email)
    );

    const openCheckIns = await base44.asServiceRole.entities.PersonalCheckIn.filter({
      check_in_date: today,
    });

    for (const checkIn of openCheckIns) {
      if (checkIn.check_out_time) continue;
      if (openAssignmentEmails.has(checkIn.user_email)) continue;
      if (!checkIn.check_in_time) continue;

      const checkedInAt = new Date(checkIn.check_in_time).getTime();
      // The first service end after this member arrived is the service they
      // came for; 15 minutes past it they are off duty.
      const serviceEnd = sortedEnds.find((end) => end.getTime() > checkedInAt);
      if (!serviceEnd) continue;
      if (now.getTime() < serviceEnd.getTime() + 15 * 60 * 1000) continue;

      await base44.asServiceRole.entities.PersonalCheckIn.update(checkIn.id, {
        check_out_time: now.toISOString(),
      });
      autoCheckedOut++;
      console.log(
        `Auto checkout 15 min after service end: ${checkIn.user_name || checkIn.user_email}`
      );
    }

    // Equipment-return service-end alert removed — automated service-end
    // notifications are off; only manual Altar Call / Church Out send them.

    return Response.json({ success: true, auto_checked_in: autoCheckedIn, auto_checked_out: autoCheckedOut });
  } catch (error) {
    console.error('autoCheckOut error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});