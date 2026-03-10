import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Public webhook for Twilio WhatsApp incoming messages.
// Configure this function's URL in Twilio Console → Messaging → Senders → WhatsApp → Webhook URL
// Supported commands: ALERT, HELP, CHECKIN

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function twimlResponse(message) {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`,
    { headers: { 'Content-Type': 'text/xml' } }
  );
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Parse Twilio's form-urlencoded body
    const text = await req.text();
    const params = new URLSearchParams(text);

    const from = params.get('From') || '';
    const bodyRaw = (params.get('Body') || '').trim();
    const profileName = params.get('ProfileName') || 'Unknown User';
    const latitude = params.get('Latitude');
    const longitude = params.get('Longitude');
    const fromNumber = from.replace('whatsapp:', '');

    const parts = bodyRaw.split(/\s+/);
    const command = (parts[0] || '').toUpperCase();
    const details = parts.slice(1).join(' ').trim();

    const locationStr = latitude && longitude
      ? `GPS: ${latitude}, ${longitude}`
      : 'Location not provided';

    if (command === 'ALERT') {
      const description = details || 'Emergency reported via WhatsApp';

      await base44.asServiceRole.entities.Incident.create({
        title: `WhatsApp Alert from ${profileName}`,
        category: 'Suspicious Activity',
        location: locationStr,
        severity: 'High',
        description: `${description}\n\nReported by: ${profileName} (${fromNumber})\nSource: WhatsApp Bot`,
        latitude: latitude ? parseFloat(latitude) : undefined,
        longitude: longitude ? parseFloat(longitude) : undefined,
        reported_by: profileName,
        status: 'Open'
      });

      return twimlResponse(
        `🚨 ALERT RECEIVED\n\nYour emergency has been reported to the security team.\n\nRef: ${new Date().toISOString().slice(0, 19)} UTC\n\nReply HELP if you need immediate assistance or share your location for faster response.`
      );

    } else if (command === 'HELP') {
      await base44.asServiceRole.entities.Incident.create({
        title: `URGENT: Help Requested via WhatsApp`,
        category: 'Panic Alert',
        location: locationStr,
        severity: 'Critical',
        description: `User ${profileName} (${fromNumber}) requested immediate help via WhatsApp.\n${details || ''}`,
        latitude: latitude ? parseFloat(latitude) : undefined,
        longitude: longitude ? parseFloat(longitude) : undefined,
        reported_by: profileName,
        status: 'Open',
        is_panic: true
      });

      return twimlResponse(
        `🆘 HELP REQUEST RECEIVED\n\nYour request has been escalated as CRITICAL. The security team has been notified immediately.\n\nIf this is a life-threatening emergency, please also call 911.\n\nStay in a safe location if possible.`
      );

    } else if (command === 'CHECKIN' || bodyRaw.toUpperCase() === 'CHECK IN' || bodyRaw.toUpperCase() === 'CHECK-IN') {
      const activeAlerts = await base44.asServiceRole.entities.EmergencyAlert.filter({ is_active: true });

      if (activeAlerts.length > 0) {
        const alert = activeAlerts[0];
        await base44.asServiceRole.entities.SafetyCheckIn.create({
          alert_id: alert.id,
          user_email: fromNumber,
          user_name: profileName,
          status: 'safe',
          latitude: latitude ? parseFloat(latitude) : undefined,
          longitude: longitude ? parseFloat(longitude) : undefined
        });

        return twimlResponse(
          `✅ CHECK-IN CONFIRMED\n\nYou have been marked as SAFE for alert: ${alert.alert_type}.\n\nThank you for checking in. Stay alert and follow security team instructions.`
        );
      } else {
        await base44.asServiceRole.entities.SafetyCheckIn.create({
          alert_id: 'manual',
          user_email: fromNumber,
          user_name: profileName,
          status: 'safe',
          latitude: latitude ? parseFloat(latitude) : undefined,
          longitude: longitude ? parseFloat(longitude) : undefined
        });

        return twimlResponse(
          `✅ CHECK-IN RECEIVED\n\nNo active emergency alerts at this time. You have been logged as safe.\n\nAvailable commands:\n• ALERT [details] — Report an emergency\n• HELP — Request immediate assistance\n• CHECKIN — Confirm your safety`
        );
      }

    } else {
      return twimlResponse(
        `🛡️ Shepherd Shield Security Bot\n\nAvailable commands:\n\n• ALERT [details] — Report an emergency\n• HELP — Request immediate assistance\n• CHECKIN — Confirm you are safe\n\nYou can also share your location with any command for faster response.`
      );
    }

  } catch (error) {
    console.error('WhatsApp bot error:', error);
    return twimlResponse('Sorry, there was an error processing your request. Please try again or call for help directly.');
  }
});