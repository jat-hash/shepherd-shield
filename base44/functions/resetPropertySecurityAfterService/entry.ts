import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Scheduled monitor (runs every ~10 minutes) that resets the property
// security current-status grid at the START of each service, so checks
// from a previous service/event never carry over into the new one.
// "A service is starting" is derived from real assignment data: we group
// today's assignments by service_type, take the earliest start_time, and
// once the Pacific wall clock reaches that time (within a catch-up window)
// we record a new cycle boundary. One reset per service per day.
// Robust to daylight-saving shifts because everything is computed in the
// church's America/Los_Angeles wall-clock time.

const TZ = 'America/Los_Angeles';
const START_WINDOW_MINUTES = 120; // reset within this long after a service starts

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

    // Earliest start time (in minutes) per service_type
    const serviceStarts = {};
    for (const a of assignments) {
      if (!a.service_type || a.status === 'Declined') continue;
      const parts = (a.start_time || '').split(':').map(Number);
      if (parts.length < 1 || isNaN(parts[0])) continue;
      const startMinutes = parts[0] * 60 + (parts[1] || 0);
      if (serviceStarts[a.service_type] == null || startMinutes < serviceStarts[a.service_type]) {
        serviceStarts[a.service_type] = startMinutes;
      }
    }

    // Most recent reset boundary
    const cycles = await base44.asServiceRole.entities.PropertySecurityCycle.list("-last_reset_at", 1);
    const lastReset = cycles.length ? cycles[0] : null;
    const lastResetParts = lastReset ? pacificParts(new Date(lastReset.last_reset_at)) : null;

    // Process earliest-starting service first; one reset per run is enough.
    const services = Object.keys(serviceStarts).sort((a, b) => serviceStarts[a] - serviceStarts[b]);

    for (const serviceType of services) {
      const startMinutes = serviceStarts[serviceType];
      if (nowMinutes < startMinutes) continue; // service hasn't started yet
      if (nowMinutes > startMinutes + START_WINDOW_MINUTES) continue; // catch-up window passed

      // Already reset for this service's start today?
      const alreadyReset =
        lastResetParts &&
        lastResetParts.dateStr === todayStr &&
        lastResetParts.minutes >= startMinutes &&
        lastReset.reset_by === serviceType;
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