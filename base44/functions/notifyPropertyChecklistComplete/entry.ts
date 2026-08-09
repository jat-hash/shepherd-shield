import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Triggered (entity automation) when a PropertySecurityCheck is created/updated.
// Evaluates whether the Marathon Property Checklist is now COMPLETE for the
// current security cycle — i.e. every active PropertyPost has a check recorded
// after the most recent cycle reset. When it first becomes complete, sends an
// in-app + push alert to Ryan, Pacheco, and all admins. Fires only once per
// cycle (deduped via a synthetic Notification.assignment_id key).

const RECIPIENT_EMAILS = [
  'wilbert.ryan@gmail.com',     // Ryan
  'pachecosmailbox@gmail.com',  // Pacheco
];

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);

    // 1. Most recent cycle boundary.
    const cycles = await base44.asServiceRole.entities.PropertySecurityCycle.list('-last_reset_at', 1);
    const cycleAt = cycles.length ? new Date(cycles[0].last_reset_at).getTime() : 0;
    const cycleKey = cycleAt ? new Date(cycleAt).toISOString() : 'none';
    const dedupeKey = `property-complete-${cycleKey}`;

    // 2. Active property posts (the roster that defines the checklist).
    const posts = await base44.asServiceRole.entities.PropertyPost.filter({ is_active: true }, 'order', 200);
    const activeNames = posts.map((p: any) => p.name).filter(Boolean);
    if (activeNames.length === 0) {
      return Response.json({ success: true, complete: false, reason: 'no active posts' });
    }

    // 3. Latest check per location within the current cycle.
    const checks = await base44.asServiceRole.entities.PropertySecurityCheck.list('-checked_at', 500);
    const latestByLoc: Record<string, any> = {};
    for (const c of checks) {
      if (cycleAt && new Date(c.checked_at).getTime() < cycleAt) continue;
      if (!latestByLoc[c.location_name]) latestByLoc[c.location_name] = c;
    }

    // 4. Is every active post checked?
    const unchecked = activeNames.filter((n: string) => !latestByLoc[n]);
    if (unchecked.length > 0) {
      return Response.json({ success: true, complete: false, unchecked, total: activeNames.length });
    }

    // 5. Dedupe — already alerted for this cycle?
    const existing = await base44.asServiceRole.entities.Notification.filter({ assignment_id: dedupeKey });
    if (existing && existing.length > 0) {
      return Response.json({ success: true, complete: true, already_alerted: true });
    }

    // 6. Build summary and send to Ryan, Pacheco, and admins.
    const secureCount = Object.values(latestByLoc).filter((c: any) => c.status === 'Secure').length;
    const unsecuredCount = activeNames.length - secureCount;
    const title = '✅ Marathon Property Checklist Complete';
    const body = unsecuredCount === 0
      ? `All ${activeNames.length} property posts are checked and Secure.`
      : `All ${activeNames.length} property posts have been checked (${secureCount} Secure, ${unsecuredCount} Unsecured).`;

    const allUsers = await base44.asServiceRole.entities.User.list();
    const recipients = allUsers.filter((u: any) =>
      u.role === 'admin' || RECIPIENT_EMAILS.includes((u.email || '').toLowerCase())
    );
    const seen = new Set<string>();
    const dedupedRecipients = recipients.filter((u: any) => {
      const key = (u.email || '').toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (dedupedRecipients.length === 0) {
      return Response.json({ success: true, complete: true, no_recipients: true });
    }

    await Promise.all(dedupedRecipients.map((u: any) =>
      base44.asServiceRole.entities.Notification.create({
        user_email: u.email,
        title,
        message: body,
        type: 'general',
        assignment_id: dedupeKey,
        read: false,
      }).catch(() => {})
    ));

    await Promise.all(dedupedRecipients.map((u: any) =>
      Promise.all([
        base44.asServiceRole.functions.invoke('sendFCMNotification', {
          recipient_email: u.email,
          title,
          body,
          notification_type: 'general',
          click_url: '/PropertySecurity',
        }).catch((err: Error) => console.log(`FCM skipped for ${u.email}:`, err.message)),
        base44.asServiceRole.functions.invoke('sendWebPushService', {
          recipient_email: u.email,
          title,
          body,
          notification_type: 'general',
          click_url: '/PropertySecurity',
        }).catch((err: Error) => console.log(`WebPush skipped for ${u.email}:`, err.message)),
      ])
    ));

    console.log(`Property checklist complete — alerted ${dedupedRecipients.length} recipients`);
    return Response.json({
      success: true,
      complete: true,
      alerted: true,
      recipients: dedupedRecipients.length,
      secure: secureCount,
      unsecured: unsecuredCount,
    });
  } catch (error) {
    console.error('notifyPropertyChecklistComplete error:', error);
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}