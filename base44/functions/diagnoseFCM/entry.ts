import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const saRaw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
    if (!saRaw) return Response.json({ error: 'FIREBASE_SERVICE_ACCOUNT not set' }, { status: 500 });
    const sa = JSON.parse(saRaw);

    const saInfo = {
      project_id: sa.project_id,
      client_email: sa.client_email,
      private_key_id: sa.private_key_id,
      has_private_key: !!sa.private_key,
    };

    // Mint an access token via JWT bearer
    let oauthResult;
    try {
      const now = Math.floor(Date.now() / 1000);
      const header = { alg: "RS256", typ: "JWT", kid: sa.private_key_id };
      const payload = {
        iss: sa.client_email,
        scope: "https://www.googleapis.com/auth/firebase.messaging",
        aud: sa.token_uri || "https://oauth2.googleapis.com/token",
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

      const tokenRes = await fetch(sa.token_uri || "https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion: jwt,
        }),
      });
      oauthResult = { status: tokenRes.status, body: await tokenRes.json() };
    } catch (e) {
      oauthResult = { error: e.message };
    }

    // Probe FCM with an intentionally-invalid token to check auth/project access
    let fcmProbe;
    if (oauthResult?.body?.access_token) {
      try {
        const probeRes = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${oauthResult.body.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message: { token: "INVALID_PROBE_TOKEN_XYZ", data: { test: "1" } } }),
        });
        fcmProbe = { status: probeRes.status, body: await probeRes.text() };
      } catch (e) {
        fcmProbe = { error: e.message };
      }
    }

    const firebaseVapidKey = Deno.env.get('FIREBASE_VAPID_KEY');
    const nativeVapidKey = Deno.env.get('VAPID_PUBLIC_KEY');

    // Try sending to the most recent REAL token via legacy HTTP API
    let legacyProbe = null;
    try {
      const devices = await base44.asServiceRole.entities.UserDevice.list('-created_date', 1);
      const latestToken = devices?.[0]?.fcm_token;
      const serverKey = Deno.env.get('FIREBASE_SERVER_KEY');
      if (latestToken && serverKey) {
        const legacyRes = await fetch('https://fcm.googleapis.com/fcm/send', {
          method: 'POST',
          headers: { 'Authorization': `key=${serverKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: latestToken, data: { test: 'diag' } }),
        });
        const legacyBody = await legacyRes.json();
        legacyProbe = { 
          status: legacyRes.status, 
          token_preview: latestToken.substring(0, 30),
          success: legacyBody.success, 
          failure: legacyBody.failure,
          error: legacyBody.results?.[0]?.error || null,
        };
      } else {
        legacyProbe = { skipped: !latestToken ? 'no tokens in DB' : 'no FIREBASE_SERVER_KEY' };
      }
    } catch (e) {
      legacyProbe = { error: e.message };
    }

    return Response.json({
      browser_firebase_project_id: "shepard-shield-32db7",
      service_account: saInfo,
      oauth_exchange_ok: oauthResult?.body?.access_token ? true : false,
      oauth_error: oauthResult?.body?.error ? JSON.stringify(oauthResult.body.error) : null,
      fcm_probe: fcmProbe,
      project_match: sa.project_id === "shepard-shield-32db7",
      vapid_key_diagnostic: {
        firebase_vapid_key_prefix: firebaseVapidKey ? firebaseVapidKey.substring(0, 20) : 'NOT SET',
        native_vapid_key_prefix: nativeVapidKey ? nativeVapidKey.substring(0, 20) : 'NOT SET',
        keys_are_identical: !!(firebaseVapidKey && nativeVapidKey && firebaseVapidKey === nativeVapidKey),
        firebase_key_length: firebaseVapidKey?.length || 0,
      },
      legacy_api_probe: legacyProbe,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});