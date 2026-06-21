import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Cached OAuth2 access token (avoids re-fetching per call within the same isolate)
let _cachedToken = null;

function base64Url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToPkcs8(pem) {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\s/g, "");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  if (_cachedToken && _cachedToken.exp > now + 60) return _cachedToken.token;

  const header = { alg: "RS256", typ: "JWT", kid: sa.private_key_id };
  const payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const enc = new TextEncoder();
  const headerB64 = base64Url(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64Url(enc.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(signingInput));
  const signatureB64 = base64Url(new Uint8Array(sigBuf));
  const jwt = `${signingInput}.${signatureB64}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error("Failed to obtain FCM access token: " + JSON.stringify(tokenData));
  }
  _cachedToken = { token: tokenData.access_token, exp: now + (tokenData.expires_in || 3600) };
  return _cachedToken.token;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { recipient_email, title, body, alert_id, dm_channel, notification_type, click_url } = await req.json();

    if (!recipient_email || !title || !body) {
      return Response.json({ error: 'recipient_email, title, and body required' }, { status: 400 });
    }

    const saRaw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
    if (!saRaw) {
      return Response.json({ error: 'FIREBASE_SERVICE_ACCOUNT not configured' }, { status: 500 });
    }
    const sa = JSON.parse(saRaw);

    // Look up FCM tokens for this user
    const devices = await base44.asServiceRole.entities.UserDevice.filter({ user_email: recipient_email });
    const tokens = (devices || []).map(d => d.fcm_token).filter(Boolean);
    if (tokens.length === 0) {
      return Response.json({ success: false, error: 'No device tokens for user' });
    }

    const accessToken = await getAccessToken(sa);
    const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;
    const data = {
      alertId: String(alert_id || ''),
      dm_channel: String(dm_channel || ''),
      notification_type: String(notification_type || ''),
      click_url: String(click_url || (dm_channel
        ? `/Communications?channel=${encodeURIComponent(dm_channel)}`
        : (alert_id ? '/' : '/Communications'))),
    };

    let successCount = 0;
    let failureCount = 0;
    for (const token of tokens) {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token,
            notification: { title, body },
            data,
            android: { priority: "high", notification: { sound: "default" } },
            apns: { payload: { aps: { sound: "default" } } },
          },
        }),
      }).catch(() => null);
      if (res?.ok) successCount++; else failureCount++;
    }

    console.log(`FCM v1 sent to ${recipient_email} (${tokens.length} device(s)), success: ${successCount}, failure: ${failureCount}`);
    return Response.json({ success: true, recipient: recipient_email, successCount, failureCount });
  } catch (error) {
    console.error('Error in sendFCMNotification:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});