import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

// Monthly reminder: nudges Ryan to run the monthly equipment maintenance
// checklist (batteries, condition, supplies) for every piece of equipment.

const TZ = 'America/Los_Angeles';
const RYAN_EMAIL = 'wilbert.ryan@gmail.com'; // Wilbert Ryan
const TITLE = '📋 Monthly equipment check is due';

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const monthKey = new Date().toLocaleDateString('en-CA', { timeZone: TZ }).slice(0, 7);

    const equipment = await base44.asServiceRole.entities.Equipment.list('-created_date', 500);

    if (equipment.length === 0) {
      console.log('Monthly equipment reminder skipped: no equipment on file');
      return Response.json({ success: true, skipped: 'no_equipment' });
    }

    const pending = equipment.filter(
      e => !e.last_inspection_date || String(e.last_inspection_date).slice(0, 7) !== monthKey
    );

    const body =
      pending.length === 0
        ? `All ${equipment.length} items are already checked this month.`
        : `${pending.length} of ${equipment.length} items need the monthly check — batteries, condition, and supplies.`;

    await base44.asServiceRole.entities.Notification.create({
      user_email: RYAN_EMAIL,
      title: TITLE,
      message: body,
      type: 'general',
      read: false,
    }).catch((e: Error) => console.log('Notification create skipped:', e.message));

    await base44.asServiceRole.functions.invoke('sendDualPush', {
      recipient_email: RYAN_EMAIL,
      title: TITLE,
      body,
      notification_type: 'general',
      click_url: '/EquipmentInventory',
    }).catch((e: Error) => console.log('Push skipped:', e.message));

    console.log(`Monthly equipment reminder sent to ${RYAN_EMAIL} (${pending.length} pending of ${equipment.length})`);

    return Response.json({
      success: true,
      month: monthKey,
      total: equipment.length,
      pending: pending.length,
      pending_items: pending.map((p: any) => p.name),
    });
  } catch (error) {
    console.error('remindMonthlyEquipmentCheck error:', error);
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}