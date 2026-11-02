import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

// Alerts the security team when radio or medical equipment passes its service
// due date. Runs on a daily schedule; sends at most one alert per day.

const TZ = 'America/Los_Angeles';
const TITLE = '⚠️ Equipment past its service date';
const ALERT_CATEGORIES = ['Radio', 'Medical', 'First Aid'];

function todayKey(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}

function addDays(key: string, days: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dueDateFor(item: any): string | null {
  if (item.next_maintenance_date) return String(item.next_maintenance_date).slice(0, 10);
  if (item.last_inspection_date) {
    return addDays(
      String(item.last_inspection_date).slice(0, 10),
      Number(item.maintenance_frequency_days) || 30
    );
  }
  return null; // never checked or serviced
}

function daysBetween(fromKey: string, toKey: string): number {
  return Math.round(
    (Date.parse(`${toKey}T12:00:00Z`) - Date.parse(`${fromKey}T12:00:00Z`)) / 86400000
  );
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth
      .me()
      .catch((e: any) => (e?.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { dry_run } = await req.json().catch(() => ({ dry_run: false }));
    const today = todayKey();

    const equipment = await base44.asServiceRole.entities.Equipment.list('-created_date', 500);

    const overdue = equipment
      .filter((e: any) => ALERT_CATEGORIES.includes(e.category))
      .map((e: any) => {
        const due = dueDateFor(e);
        return { item: e, due, late: due ? daysBetween(due, today) : null };
      })
      .filter((row: any) => row.due === null || (row.late !== null && row.late > 0))
      .sort((a: any, b: any) => (b.late ?? 99999) - (a.late ?? 99999));

    if (overdue.length === 0) {
      console.log(`No radio or medical equipment past its service date (${equipment.length} checked)`);
      return Response.json({ success: true, skipped: 'none_overdue', checked: equipment.length });
    }

    const summary = overdue.map(({ item, due, late }: any) => ({
      name: item.name,
      category: item.category,
      due: due || 'never checked',
      days_late: late,
    }));

    const recentRes: any = await base44.asServiceRole.entities.Notification.filter(
      { title: TITLE },
      { sort: '-created_date', limit: 50 }
    );
    const recent: any[] = Array.isArray(recentRes) ? recentRes : recentRes?.items || [];
    const alreadySent = recent.some(
      (n: any) =>
        n.created_date &&
        new Date(n.created_date).toLocaleDateString('en-CA', { timeZone: TZ }) === today
    );

    if (dry_run) {
      return Response.json({ success: true, dry_run: true, overdue_count: overdue.length, overdue_items: summary, already_sent_today: alreadySent });
    }

    if (alreadySent) {
      console.log('Overdue equipment alert already sent today — skipping');
      return Response.json({ success: true, skipped: 'already_sent_today', overdue_count: overdue.length });
    }

    const listed = overdue
      .slice(0, 4)
      .map(({ item, late }: any) =>
        late === null ? `${item.name} (never checked)` : `${item.name} (${late} day${late === 1 ? '' : 's'} late)`
      );
    const extra = overdue.length - listed.length;
    const body = `${overdue.length} item${overdue.length === 1 ? '' : 's'} past its service date: ${listed.join(', ')}${extra > 0 ? ` and ${extra} more` : ''}. Open Equipment → Service Log and run the checklist.`;

    const users = await base44.asServiceRole.entities.User.list();
    const recipients = users
      .filter((u: any) => ['admin', 'user'].includes(String(u.role || '').trim().toLowerCase()))
      .map((u: any) => u.email)
      .filter(Boolean);

    if (recipients.length === 0) {
      return Response.json({ success: false, skipped: 'no_recipients', overdue_count: overdue.length });
    }

    await base44.asServiceRole.entities.Notification.bulkCreate(
      recipients.map((email: string) => ({
        user_email: email,
        title: TITLE,
        message: body,
        type: 'general',
        read: false,
      }))
    ).catch((e: Error) => console.log('In-app notifications skipped:', e.message));

    let pushed = 0;
    for (let i = 0; i < recipients.length; i += 5) {
      const batch = recipients.slice(i, i + 5);
      const results = await Promise.allSettled(
        batch.map((email: string) =>
          base44.asServiceRole.functions.invoke('sendDualPush', {
            recipient_email: email,
            title: TITLE,
            body,
            notification_type: 'general',
            click_url: '/EquipmentInventory',
          })
        )
      );
      pushed += results.filter(
        (r: any) => r.status === 'fulfilled' && (r.value?.data?.success ?? false)
      ).length;
    }

    console.log(`Overdue equipment alert → ${recipients.length} recipients (${pushed} pushes), ${overdue.length} items`);

    return Response.json({
      success: true,
      date: today,
      overdue_count: overdue.length,
      overdue_items: summary,
      recipients: recipients.length,
      pushes_delivered: pushed,
    });
  } catch (error) {
    console.error('checkOverdueEquipmentAlerts error:', error);
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}