import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

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

function userName(u) {
  return u.data?.display_name || u.display_name || u.full_name || u.email || 'Unknown';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));

    // --- Action: delete a stale device token ---
    if (body.action === 'delete_device' && body.device_id) {
      await base44.asServiceRole.entities.UserDevice.delete(body.device_id);
      return Response.json({ success: true, deleted: body.device_id });
    }
    if (body.action === 'delete_webpush' && body.sub_id) {
      await base44.asServiceRole.entities.PushSubscription.delete(body.sub_id);
      return Response.json({ success: true, deleted: body.sub_id });
    }

    // --- Read mode: gather all device registrations ---
    const validate_tokens = body.validate_tokens === true;

    const [devices, webPushSubs, users] = await Promise.all([
      base44.asServiceRole.entities.UserDevice.filter({}, '-created_date', 500),
      base44.asServiceRole.entities.PushSubscription.filter({}, '-created_date', 500),
      base44.asServiceRole.entities.User.list('-created_date', 500),
    ]);

    const userList = users || [];
    const userEmailSet = new Set(userList.map(u => (u.email || '').toLowerCase()).filter(Boolean));

    const devicesByUser = {};
    (devices || []).forEach(d => {
      const key = (d.user_email || '').toLowerCase();
      if (!devicesByUser[key]) devicesByUser[key] = [];
      devicesByUser[key].push(d);
    });

    const webPushByUser = {};
    (webPushSubs || []).forEach(s => {
      const key = (s.user_email || '').toLowerCase();
      if (!webPushByUser[key]) webPushByUser[key] = [];
      webPushByUser[key].push(s);
    });

    // --- Optional: validate each FCM token via FCM validateOnly (no message delivered) ---
    let tokenValidation = {};
    if (validate_tokens && (devices || []).length > 0) {
      const saRaw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
      if (saRaw) {
        const sa = JSON.parse(saRaw);
        const accessToken = await getAccessToken(sa);
        const fcmUrl = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;

        const results = await Promise.all((devices || []).map(async (d) => {
          try {
            const res = await fetch(fcmUrl, {
              method: 'POST',
              headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                validateOnly: true,
                message: { token: d.fcm_token, data: { _diag: '1' } },
              }),
            });
            if (res.ok) {
              return { id: d.id, valid: true, status: 200, error: null };
            }
            const errBody = await res.json().catch(() => ({}));
            const errMsg = errBody?.error?.message || `HTTP ${res.status}`;
            return { id: d.id, valid: false, status: res.status, error: errMsg };
          } catch (e) {
            return { id: d.id, valid: false, status: 0, error: e.message };
          }
        }));
        results.forEach(r => { tokenValidation[r.id] = r; });
      }
    }

    // --- Build per-user result ---
    const userResults = userList.map(u => {
      const key = (u.email || '').toLowerCase();
      const userDevices = (devicesByUser[key] || []).map(d => ({
        id: d.id,
        fcm_token_preview: d.fcm_token ? (d.fcm_token.substring(0, 20) + '…') : '(empty)',
        device_id: d.device_id || '—',
        created_date: d.created_date,
        updated_date: d.updated_date,
        validation: tokenValidation[d.id] || null,
      }));
      const userWebPush = (webPushByUser[key] || []).map(s => ({
        id: s.id,
        endpoint_preview: s.endpoint ? (s.endpoint.substring(0, 50) + '…') : '(empty)',
        device_id: s.device_id || '—',
        created_date: s.created_date,
      }));
      return {
        email: u.email,
        name: userName(u),
        role: u.role,
        fcm_devices: userDevices,
        web_push_subscriptions: userWebPush,
        has_any_registration: userDevices.length > 0 || userWebPush.length > 0,
      };
    }).sort((a, b) => {
      // Users without registration first (most likely the ones failing), then alphabetical
      if (a.has_any_registration !== b.has_any_registration) {
        return a.has_any_registration ? 1 : -1;
      }
      return (a.name || '').localeCompare(b.name || '');
    });

    // --- Orphaned devices (registered to emails not in the user list) ---
    const orphanedDevices = (devices || [])
      .filter(d => !userEmailSet.has((d.user_email || '').toLowerCase()))
      .map(d => ({
        id: d.id,
        user_email: d.user_email,
        fcm_token_preview: d.fcm_token ? (d.fcm_token.substring(0, 20) + '…') : '(empty)',
        device_id: d.device_id || '—',
        created_date: d.created_date,
        validation: tokenValidation[d.id] || null,
      }));
    const orphanedWebPush = (webPushSubs || [])
      .filter(s => !userEmailSet.has((s.user_email || '').toLowerCase()))
      .map(s => ({
        id: s.id,
        user_email: s.user_email,
        endpoint_preview: s.endpoint ? (s.endpoint.substring(0, 50) + '…') : '(empty)',
        device_id: s.device_id || '—',
        created_date: s.created_date,
      }));

    const validatedCount = Object.keys(tokenValidation).length;
    const validCount = Object.values(tokenValidation).filter(r => r.valid).length;
    const invalidCount = validatedCount - validCount;

    return Response.json({
      summary: {
        total_users: userList.length,
        users_with_devices: userResults.filter(u => u.has_any_registration).length,
        users_without_devices: userResults.filter(u => !u.has_any_registration).length,
        total_fcm_tokens: (devices || []).length,
        valid_fcm_tokens: validatedCount > 0 ? validCount : null,
        invalid_fcm_tokens: validatedCount > 0 ? invalidCount : null,
        total_web_push_subs: (webPushSubs || []).length,
        orphaned_device_count: orphanedDevices.length + orphanedWebPush.length,
      },
      users: userResults,
      orphaned_devices: orphanedDevices,
      orphaned_web_push: orphanedWebPush,
      tokens_validated: validatedCount > 0,
    });
  } catch (error) {
    console.error('diagnosePushDevices error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});