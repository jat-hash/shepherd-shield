import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Scheduled monitor: sends nursery staff reminders tied to the day's services.
//   1. ~15 min BEFORE the earliest service start → "Check in children"
//   2. ~15 min BEFORE the latest service end     → "Check out children"
//
// Runs every 5 minutes. Times are evaluated in America/Los_Angeles so the
// reminders line up with the local wall-clock service schedule. Duplicate
// sends are prevented by a synthetic Notification.assignment_id key
// (`nursery-<date>-checkin` / `nursery-<date>-checkout`).

const LEAD_MINUTES = 15;       // reminder fires this far before the service boundary
const WINDOW_MINUTES = 45;    // don't fire more than this late after the boundary

const CHECKIN_TITLE = '👶 Check In Children';
const CHECKOUT_TITLE = '👶 Check Out Children';

const TZ = 'America/Los_Angeles';

// Mirrors src/lib/leadership.js → NURSERY_ACCESS_EMAILS (backend can't import src).
const NURSERY_ACCESS_EMAILS = [
  'wilbert.ryan@gmail.com',
  'pachecosmailbox@gmail.com',
  'wintersnorma@yahoo.com',
  'wintersjamesg@hotmail.com',
  'lilskey311@gmail.com',
  'christinescls@gmail.com',
  'rivera2981@gmail.com',
];

function pacificNowMinutes(): number {
  const now = new Date();
  const pacificStr = now.toLocaleString('en-US', { timeZone: TZ });
  const pd = new Date(pacificStr);
  return pd.getHours() * 60 + pd.getMinutes();
}

function timeToMinutes(t: string | undefined | null): number | null {
  if (!t) return null;
  const parts = t.split(':').map(Number);
  if (parts.length < 1 || isNaN(parts[0])) return null;
  return parts[0] * 60 + (parts[1] || 0);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
    const currentMinutes = pacificNowMinutes();

    // Derive today's service boundaries from assignments.
    const assignments = await base44.asServiceRole.entities.Assignment.filter({
      service_date: todayStr,
    });

    let earliestStart: number | null = null;
    let latestEnd: number | null = null;
    for (const a of assignments) {
      if (a.status === 'Declined') continue;
      const s = timeToMinutes(a.start_time);
      const e = timeToMinutes(a.end_time);
      if (s != null && (earliestStart == null || s < earliestStart)) earliestStart = s;
      if (e != null && (latestEnd == null || e > latestEnd)) latestEnd = e;
    }

    const results: any[] = [];
    if (earliestStart == null && latestEnd == null) {
      return Response.json({ success: true, message: 'No services today', reminders_sent: 0 });
    }

    // Resolve nursery recipients: admins + authorized nursery emails that are registered users.
    const allUsers = await base44.asServiceRole.entities.User.list();
    const recipients = allUsers.filter((u: any) =>
      u.role === 'admin' || NURSERY_ACCESS_EMAILS.includes((u.email || '').toLowerCase())
    );
    if (recipients.length === 0) {
      return Response.json({ success: true, message: 'No nursery recipients', reminders_sent: 0 });
    }

    const checkinKey = `nursery-${todayStr}-checkin`;
    const checkoutKey = `nursery-${todayStr}-checkout`;

    // ── 1. Check in children (15 min before earliest start) ──
    if (earliestStart != null) {
      const due =
        currentMinutes >= earliestStart - LEAD_MINUTES &&
        currentMinutes <= earliestStart + WINDOW_MINUTES;
      if (due) {
        const already = await alreadySent(base44, checkinKey, CHECKIN_TITLE);
        if (!already) {
          const startTimeStr = formatMinutes(earliestStart);
          const body = `Service begins at ${startTimeStr}. Please begin checking children into the nursery now.`;
          await sendToNursery(base44, recipients, CHECKIN_TITLE, body, checkinKey);
          results.push({ type: 'checkin', boundary: startTimeStr, recipients: recipients.length });
        }
      }
    }

    // ── 2. Check out children (15 min before latest end) ──
    if (latestEnd != null) {
      const due =
        currentMinutes >= latestEnd - LEAD_MINUTES &&
        currentMinutes <= latestEnd + WINDOW_MINUTES;
      if (due) {
        const already = await alreadySent(base44, checkoutKey, CHECKOUT_TITLE);
        if (!already) {
          const endTimeStr = formatMinutes(latestEnd);
          const body = `Service ends at ${endTimeStr}. Please begin checking children out of the nursery now.`;
          await sendToNursery(base44, recipients, CHECKOUT_TITLE, body, checkoutKey);
          results.push({ type: 'checkout', boundary: endTimeStr, recipients: recipients.length });
        }
      }
    }

    console.log(`Nursery reminders: ${results.length} sent for ${todayStr}`, results);
    return Response.json({
      success: true,
      earliest_start: earliestStart != null ? formatMinutes(earliestStart) : null,
      latest_end: latestEnd != null ? formatMinutes(latestEnd) : null,
      reminders_sent: results.length,
      results,
    });
  } catch (error) {
    console.error('checkNurseryReminders error:', error);
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});

function formatMinutes(m: number): string {
  const h24 = Math.floor(m / 60);
  const min = m % 60;
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(min).padStart(2, '0')} ${ampm}`;
}

async function alreadySent(base44: any, key: string, title: string): Promise<boolean> {
  try {
    const existing = await base44.asServiceRole.entities.Notification.filter({
      assignment_id: key,
    });
    return existing.some((n: any) => n.title === title);
  } catch (e) {
    // If the lookup fails, skip this round to avoid duplicate sends.
    console.log(`Nursery dedupe lookup failed for ${key}:`, (e as Error).message);
    return true;
  }
}

async function sendToNursery(base44: any, recipients: any[], title: string, body: string, dedupeKey: string) {
  await Promise.all(recipients.map((u: any) =>
    base44.asServiceRole.entities.Notification.create({
      user_email: u.email,
      title,
      message: body,
      type: 'general',
      assignment_id: dedupeKey,
      read: false,
    }).catch(() => {})
  ));

  // Push (FCM + Web Push) to each recipient.
  await Promise.all(recipients.map((u: any) => {
    return Promise.all([
      base44.asServiceRole.functions.invoke('sendFCMNotification', {
        recipient_email: u.email,
        title,
        body,
        notification_type: 'general',
        click_url: '/NurseryDashboard',
      }).catch((err: Error) => console.log(`FCM skipped for ${u.email}:`, err.message)),
      base44.asServiceRole.functions.invoke('sendWebPushService', {
        recipient_email: u.email,
        title,
        body,
        notification_type: 'general',
        click_url: '/NurseryDashboard',
      }).catch((err: Error) => console.log(`WebPush skipped for ${u.email}:`, err.message)),
    ]);
  }));
}