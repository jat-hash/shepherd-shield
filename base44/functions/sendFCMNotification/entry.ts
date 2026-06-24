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
    const { recipient_email, title, body, alert_id, dm_channel, notification_type, click_url, allow_quick_reply } = await req.json();

    if (!recipient_email || !title || !body) {
      return Response.json({ error: 'recipient_email, title, and body required' }, { status: 400 });
    }

    const saRaw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
    if (!saRaw) {
      return Response.json({ error: 'FIREBASE_SERVICE_ACCOUNT not configured' }, { status: 500 });
    }
    const sa = JSON.parse(saRaw);

    // Look up ALL FCM tokens for this user (supports native app + PWA + multiple devices)
    const devices = await base44.asServiceRole.entities.UserDevice.filter({ user_email: recipient_email });
    const tokens = (devices || []).map(d => ({ token: d.fcm_token, id: d.id })).filter(t => t.token);
    if (tokens.length === 0) {
      return Response.json({ success: false, error: 'No device tokens for user' });
    }

    const accessToken = await getAccessToken(sa);
    const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;

    const fallbackUrl = dm_channel
      ? `/Communications?channel=${encodeURIComponent(dm_channel)}`
      : (alert_id ? '/' : '/Communications');
    const targetUrl = String(click_url || fallbackUrl);

    // We send BOTH a notification payload AND data.
    // - notification: ensures iOS/APNs displays it even when the web SW/data path
    //   is unavailable (native app wrapper, fresh launch, killed PWA), so the user
    //   still sees the alert and tapping it opens the deep link.
    // - data: carries the deep link + type so the Service Worker / in-app handler
    //   can apply the custom vibration pattern + route into the right DM.
    const messageData = {
      title: String(title),
      body: String(body),
      alertId: String(alert_id || ''),
      dm_channel: String(dm_channel || ''),
      notification_type: String(notification_type || ''),
      click_url: targetUrl,
    };

    let successCount = 0;
    let failureCount = 0;
    const deadTokenIds = [];

    await Promise.all(tokens.map(async ({ token, id }) => {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token,
            data: messageData,
            notification: {
              title: String(title),
              body: String(body),
            },
            android: {
              priority: "high",
              notification: {
                channelId: notification_type === 'emergency' ? 'emergency'
                  : notification_type === 'incident' ? 'incidents'
                  : notification_type === 'dm' ? 'messages'
                  : 'messages',
                priority: "max",
                defaultVibrateTimings: false,
              },
            },
            apns: {
              payload: {
                aps: {
                  "content-available": 1,
                  "mutable-content": 1,
                  sound: "default",
                },
              },
              fcm_options: { image: '/icon-192.png' },
            },
            webpush: {
              notification: {
                title: String(title),
                body: String(body),
                icon: '/icon-192.png',
                badge: '/icon-192.png',
                requireInteraction: notification_type === 'emergency' || notification_type === 'incident',
                vibrate: notification_type === 'emergency'
                  ? [1000, 200, 1000, 200, 1000, 200, 1000]
                  : notification_type === 'dm'
                  ? [250, 100, 250, 100, 250]
                  : [200, 100, 200],
                // Quick-reply action for comms messages so users can reply
                // directly from the notification on Android/desktop Chrome.
                ...(allow_quick_reply && (notification_type === 'dm' || notification_type === 'group_message')
                  ? { actions: [{ action: 'reply', title: 'Reply', type: 'text' }] }
                  : {}),
              },
              fcm_options: { link: targetUrl },
            },
          },
        }),
      }).catch(() => null);

      if (res?.ok) {
        successCount++;
      } else {
        failureCount++;
        // Inspect error — UNREGISTERED/invalid token means the device is gone; clean it up.
        try {
          const errJson = await res?.json?.();
          const errName = errJson?.error?.details?.[0]?.errorCode || errJson?.error?.status || '';
          if (errName === 'UNREGISTERED' || /unregistered|invalid|not found/i.test(String(errJson?.error?.message || ''))) {
            deadTokenIds.push(id);
          }
          console.log(`FCM v1 send failed for ${recipient_email} token ${token.substring(0, 16)}…: ${errName || errJson?.error?.message || 'unknown'}`);
        } catch (_) {}
      }
    }));

    // Prune dead tokens so future sends don't waste time on stale devices
    await Promise.all(deadTokenIds.map(id =>
      base44.asServiceRole.entities.UserDevice.delete(id).catch(() => {})
    ));

    console.log(`FCM v1 sent to ${recipient_email} (${tokens.length} device(s)), success: ${successCount}, failure: ${failureCount}, pruned: ${deadTokenIds.length}`);
    return Response.json({ success: true, recipient: recipient_email, successCount, failureCount, pruned: deadTokenIds.length });
  } catch (error) {
    console.error('Error in sendFCMNotification:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});