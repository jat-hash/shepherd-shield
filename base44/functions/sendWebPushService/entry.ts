import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Service-role version of sendWebPush — identical push delivery logic but
// WITHOUT the auth.me() gate, so it can be invoked from scheduled automations
// and other service-role contexts (where there is no user session).
// Use sendWebPush for user-triggered calls; use this for background/scheduled calls.

// ─── base64url helpers ───
function b64urlEncode(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str) {
  let s = String(str).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function strToBytes(s) { return new TextEncoder().encode(s); }
function concatBytes(arrs) {
  let len = 0; for (const a of arrs) len += a.length;
  const out = new Uint8Array(len);
  let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}

// ─── HKDF (RFC 5869) over HMAC-SHA256 ───
async function hmacSha256(key, data) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}
async function hkdfExtract(salt, ikm) {
  const s = salt.length === 0 ? new Uint8Array(32) : salt;
  return hmacSha256(s, ikm);
}
async function hkdfExpand(prk, info, length) {
  const n = Math.ceil(length / 32);
  let t = new Uint8Array(0);
  let okm = new Uint8Array(0);
  for (let i = 1; i <= n; i++) {
    t = await hmacSha256(prk, concatBytes([t, info, new Uint8Array([i])]));
    okm = concatBytes([okm, t]);
  }
  return okm.slice(0, length);
}

// ─── ECDSA signature → raw r||s (64 bytes) for JWS ES256 ───
function derToRaw(sig) {
  if (sig.length === 64) return sig;
  const der = sig;
  if (der[0] !== 0x30) {
    if (der.length === 64) return der;
    throw new Error('Invalid ECDSA signature (len=' + der.length + ')');
  }
  const rLen = der[3];
  let r = der.slice(4, 4 + rLen);
  if (r[0] === 0x00) r = r.slice(1);
  const sOffset = 4 + rLen;
  const sLen = der[sOffset + 1];
  let s = der.slice(sOffset + 2, sOffset + 2 + sLen);
  if (s[0] === 0x00) s = s.slice(1);
  const rPadded = new Uint8Array(32); rPadded.set(r, 32 - r.length);
  const sPadded = new Uint8Array(32); sPadded.set(s, 32 - s.length);
  return concatBytes([rPadded, sPadded]);
}

// ─── Web Push payload encryption (RFC 8291 / RFC 8188 aes128gcm) ───
async function encryptPayload(payloadObj, p256dhB64, authB64) {
  const userPub = b64urlDecode(p256dhB64);
  const authSecret = b64urlDecode(authB64);

  const ecdhKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const ecdhPubBytes = new Uint8Array(await crypto.subtle.exportKey('raw', ecdhKeys.publicKey));

  const userPubKey = await crypto.subtle.importKey('raw', userPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: userPubKey }, ecdhKeys.privateKey, 256));

  const prk = await hkdfExtract(authSecret, sharedSecret);
  const info = concatBytes([strToBytes('WebPush: info\0'), ecdhPubBytes, userPub]);
  const ikm = await hkdfExpand(prk, info, 32);
  const cek = await hkdfExpand(ikm, strToBytes('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdfExpand(ikm, strToBytes('Content-Encoding: nonce\0'), 12);

  const plaintext = concatBytes([strToBytes(JSON.stringify(payloadObj)), new Uint8Array([0x02])]);

  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, plaintext));

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const rs = new Uint8Array([0x00, 0x00, 0x10, 0x00]);
  const header = concatBytes([salt, rs, new Uint8Array([ecdhPubBytes.length]), ecdhPubBytes]);

  return concatBytes([header, ciphertext]);
}

// ─── Key pair verification ───
async function verifyKeyPair(publicKeyB64, privateKeyB64) {
  try {
    const pubBytes = b64urlDecode(publicKeyB64);
    const x = pubBytes.slice(1, 33);
    const y = pubBytes.slice(33, 65);
    const d = b64urlDecode(privateKeyB64);

    const privKey = await crypto.subtle.importKey('jwk', {
      kty: 'EC', crv: 'P-256',
      x: b64urlEncode(x), y: b64urlEncode(y), d: b64urlEncode(d),
      ext: true,
    }, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);

    const pubKey = await crypto.subtle.importKey('raw', pubBytes,
      { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']);

    const testMsg = strToBytes('vapid-key-pair-check');
    const derSig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privKey, testMsg);
    const isValid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pubKey, derSig, testMsg);
    return isValid;
  } catch (e) {
    console.error('Key pair verification error:', e.message);
    return false;
  }
}

// ─── VAPID JWT (RFC 8292) signed with ES256 ───
async function buildVapidAuthHeader(endpoint, publicKeyB64, privateKeyB64) {
  const pubBytes = b64urlDecode(publicKeyB64);
  const x = pubBytes.slice(1, 33);
  const y = pubBytes.slice(33, 65);
  const d = b64urlDecode(privateKeyB64);

  const vapidKey = await crypto.subtle.importKey('jwk', {
    kty: 'EC', crv: 'P-256',
    x: b64urlEncode(x), y: b64urlEncode(y), d: b64urlEncode(d),
    ext: true,
  }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);

  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = {
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: 'mailto:admin@shepherd-shield.app',
  };
  const signingInput = b64urlEncode(strToBytes(JSON.stringify(header))) + '.' + b64urlEncode(strToBytes(JSON.stringify(payload)));
  const derSig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, vapidKey, strToBytes(signingInput)));
  const jwt = signingInput + '.' + b64urlEncode(derToRaw(derSig));

  return `vapid t=${jwt}, k=${publicKeyB64}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json();

    let recipientEmail, title, notifBody, notificationType, clickUrl, dmChannel;
    if (body.event && body.data) {
      if (body.event.type !== 'create') return Response.json({ success: true, skipped: true });
      const n = body.data || {};
      recipientEmail = n.user_email;
      title = n.title;
      notifBody = n.message;
      dmChannel = n.dm_channel;
      const t = n.type || '';
      notificationType = t === 'incident' ? 'incident'
        : t.startsWith('assignment') ? 'assignment'
        : n.dm_channel ? 'dm'
        : 'group_message';
      clickUrl = n.dm_channel ? `/Communications?channel=${encodeURIComponent(n.dm_channel)}`
        : (t.startsWith('assignment') || n.assignment_id) ? '/Assignments'
        : t === 'incident' ? '/Incidents'
        : '/Communications';
    } else {
      recipientEmail = body.recipient_email;
      title = body.title;
      notifBody = body.body;
      notificationType = body.notification_type || 'general';
      clickUrl = body.click_url || '/Communications';
      dmChannel = body.dm_channel;
    }

    if (!recipientEmail || !title || !notifBody) {
      return Response.json({ error: 'recipient_email, title, and body required' }, { status: 400 });
    }

    const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
    const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
    if (!publicKey || !privateKey) {
      return Response.json({ error: 'VAPID keys not configured' }, { status: 500 });
    }

    const keysMatch = await verifyKeyPair(publicKey, privateKey);
    if (!keysMatch) {
      console.error('VAPID KEY PAIR MISMATCH');
      return Response.json({ error: 'VAPID key pair mismatch' }, { status: 500 });
    }

    const subs = await base44.asServiceRole.entities.PushSubscription.filter({ user_email: recipientEmail });
    if (!subs || subs.length === 0) {
      return Response.json({ success: true, recipient: recipientEmail, sent: 0, reason: 'no subscriptions' });
    }

    const payloadObj = {
      data: {
        title: String(title),
        body: String(notifBody),
        notification_type: String(notificationType || ''),
        dm_channel: String(dmChannel || ''),
        click_url: String(clickUrl),
      },
    };

    const urgency = (notificationType === 'incident' || notificationType === 'emergency' || notificationType === 'assignment')
      ? 'high' : 'normal';

    let successCount = 0;
    let failureCount = 0;
    const deadSubIds = [];

    await Promise.all(subs.map(async (sub) => {
      try {
        const encrypted = await encryptPayload(payloadObj, sub.p256dh, sub.auth);
        const authHeader = await buildVapidAuthHeader(sub.endpoint, publicKey, privateKey);
        const res = await fetch(sub.endpoint, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/octet-stream',
            'TTL': '86400',
            'Urgency': urgency,
          },
          body: encrypted,
        });
        if (res.ok) {
          successCount++;
        } else {
          failureCount++;
          if (res.status === 404 || res.status === 410) deadSubIds.push(sub.id);
          let errBody = '';
          try { errBody = await res.text(); } catch (_) {}
          console.log(`Web Push (service) failed (${res.status}) for ${recipientEmail}: ${errBody.substring(0, 150)}`);
        }
      } catch (err) {
        failureCount++;
        console.log('Web Push (service) error:', err.message);
      }
    }));

    await Promise.all(deadSubIds.map(id =>
      base44.asServiceRole.entities.PushSubscription.delete(id).catch(() => {})
    ));

    console.log(`Web Push (service) sent to ${recipientEmail} (${subs.length} sub(s)), success: ${successCount}, failure: ${failureCount}`);
    return Response.json({ success: true, recipient: recipientEmail, sent: successCount, failure: failureCount, pruned: deadSubIds.length });
  } catch (error) {
    console.error('Error in sendWebPushService:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});