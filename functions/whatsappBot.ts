import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Twilio WhatsApp incoming message webhook.
// Set this function's URL in Twilio Console under WhatsApp Webhook.
// Supported commands: ALERT, HELP, CHECKIN

function twiml(message) {
  const safe = message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${safe}</Message></Response>`,
    { headers: { 'Content-Type': 'text/xml' } }
  );
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const text = await req.text();
    const params = new URLSearchParams(text);

    const from = (params.get('From') || '').replace('whatsapp:', '');
    const bodyRaw = (params.get('Body') || '').trim();
    const profileName = params.get('ProfileName') || 'Unknown User';
    const latitude = params.get('Latitude');
    const longitude = params.get('Longitude');

    const command = (bodyRaw.split(/\s+/)[0] || '').toUpperCase();
    const details = bodyRaw.split(/\s+/).slice(1).join(' ').trim();
    const locationStr = (latitude && longitude) ? `GPS: ${latitude}, ${longitude}` : 'Location not provided';

    if (command === 'ALERT') {
      await base44.asServiceRole.entities.Incident.create({
        title: `WhatsApp Alert from ${profileName}`,
        category: 'Suspicious Activity',
        location: locationStr,
        severity: 'High',
        description: `${details || 'Emergency reported via WhatsApp'}\n\nFrom: ${profileName} (${from})\nSource: WhatsApp Bot`,
        latitude: latitude ? parseFloat(latitude) : undefined,
        longitude: longitude ? parseFloat(longitude) : undefined,
        reported_by: profileName,
        status: 'Open'
      });

      return twiml(`ALERT RECEIVED\n\nYour emergency has been reported to the security team.\nTime: ${new Date().toISOString().slice(0,19)} UTC\n\nReply HELP if you need immediate assistance.`);

    } else if (command === 'HELP') {
      await base44.asServiceRole.entities.Incident.create({
        title: `URGENT: Help Requested via WhatsApp`,
        category: 'Panic Alert',
        location: locationStr,
        severity: 'Critical',
        description: `${profileName} (${from}) requested immediate help via WhatsApp.\n${details || ''}`,
        latitude: latitude ? parseFloat(latitude) : undefined,
        longitude: longitude ? parseFloat(longitude) : undefined,
        reported_by: profileName,
        status: 'Open',
        is_panic: true
      });

      return twiml(`HELP REQUEST RECEIVED\n\nYour request has been escalated as CRITICAL. Security team notified.\n\nIf life-threatening, call 911.\nStay in a safe location.`);

    } else if (command === 'CHECKIN') {
      const activeAlerts = await base44.asServiceRole.entities.EmergencyAlert.filter({ is_active: true });
      const alertId = activeAlerts.length > 0 ? activeAlerts[0].id : 'manual';

      await base44.asServiceRole.entities.SafetyCheckIn.create({
        alert_id: alertId,
        user_email: from,
        user_name: profileName,
        status: 'safe',
        latitude: latitude ? parseFloat(latitude) : undefined,
        longitude: longitude ? parseFloat(longitude) : undefined
      });

      return twiml(`CHECK-IN CONFIRMED\n\nYou have been marked as SAFE.\n${activeAlerts.length > 0 ? `Alert: ${activeAlerts[0].alert_type}` : 'No active alerts.'}\n\nThank you.`);

    } else {
      return twiml(`Shepherd Shield Security Bot\n\nCommands:\n- ALERT [details] - Report an emergency\n- HELP - Request immediate assistance\n- CHECKIN - Confirm you are safe\n\nShare your location with any command for faster response.`);
    }

  } catch (error) {
    console.error('WhatsApp bot error:', error);
    return twiml('Error processing your request. Please try again or call for help directly.');
  }
});