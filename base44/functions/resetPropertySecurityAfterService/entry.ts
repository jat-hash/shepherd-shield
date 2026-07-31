import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Scheduled monitor (runs every ~10 minutes) that resets the property
// security current-status grid after each service ends. "A service ended"
// is derived from real assignment data: we group today's assignments by
// service_type, take the latest end_time, and once the Pacific wall clock
// passes that time (plus a grace buffer) we record a new cycle boundary.
// This is robust to daylight-saving shifts because everything is computed
// in the church's America/Los_Angeles wall-clock time.

const TZ = 'America/Los_Angeles';
const GRACE_MINUTES = 15; // wait this long after the last assignment ends

function pacificParts(date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (type) => parts.find(p => p.type === type)?.value || '';
  let hour = get('hour');
  if (hour === '24') hour = '00';
  return {
    dateStr: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(hour) * 60 + Number(get('minute')),
  };
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);

    const now = new Date();
    const nowParts = pacificParts(now);
    const todayStr = nowParts.dateStr;
    const nowMinutes = nowParts.minutes;

    // Today's assignments (service_date is stored as the church's local date)
    const assignments = await base44.asServiceRole.entities.Assignment.filter({ service_date: todayStr });

    // Latest end time (in minutes) per service_type
    const serviceEnds = {};
    for (const a of assignments) {
      if (!a.service_type) continue;
      const parts = (a.end_time || '').split(':').map(Number);
      if (parts.length < 1 || isNaN(parts[0])) continue;
      const endMinutes = parts[0] * 60 + (parts[1] || 0);
      if (serviceEnds[a.service_type] == null || endMinutes > serviceEnds[a.service_type]) {
        serviceEnds[a.service_type] = endMinutes;
      }
    }

    // Most recent reset boundary
    const cycles = await base44.asServiceRole.entities.PropertySecurityCycle.list("-last_reset_at", 1);
    let lastResetParts = null;
    if (cycles.length) {
      lastResetParts = pacificParts(new Date(cycles[0].last_reset_at));
    }

    // Process services earliest-ending first; one reset per run is enough.
    const services = Object.keys(serviceEnds).sort((a, b) => serviceEnds[a] - serviceEnds[b]);

    for (const serviceType of services) {
      const endMinutes = serviceEnds[serviceType];
      if (nowMinutes < endMinutes + GRACE_MINUTES) continue; // service not fully ended yet
      const alreadyReset = lastResetParts &&
        lastResetParts.dateStr === todayStr &&
        lastResetParts.minutes >= endMinutes + GRACE_MINUTES;
      if (alreadyReset) continue;

      await base44.asServiceRole.functions.invoke('resetPropertySecurityCycle', {
        service_label: serviceType,
      });
      return Response.json({ success: true, reset: true, service: serviceType, at: now.toISOString() });
    }

    return Response.json({ success: true, reset: false, services: services.length });
  } catch (error) {
    console.error('resetPropertySecurityAfterService error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}