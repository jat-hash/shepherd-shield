import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Parse the request body to determine which VAPID key the caller needs.
    // FCM (firebase.jsx getToken) needs the Firebase web push certificate key.
    // Native Web Push (useWebPushSubscription) needs the standalone VAPID pair.
    // Subscribing with the wrong key makes later sendWebPush calls fail with 400
    // BadWebPushRequest because the VAPID JWT signature won't match.
    let usage = 'fcm';
    try {
      const body = await req.json();
      if (body?.usage === 'native') usage = 'native';
    } catch (_) { /* GET or empty body → default to fcm */ }

    const firebaseVapidKey = Deno.env.get('FIREBASE_VAPID_KEY');
    const nativeVapidKey = Deno.env.get('VAPID_PUBLIC_KEY');

    const publicKey = usage === 'native'
      ? nativeVapidKey
      : (firebaseVapidKey || nativeVapidKey);

    if (!publicKey) {
      const msg = usage === 'native'
        ? 'VAPID_PUBLIC_KEY not configured — needed for native Web Push'
        : 'No VAPID key configured — set FIREBASE_VAPID_KEY from Firebase Console > Project Settings > Cloud Messaging > Web Push certificate';
      return Response.json({ error: msg }, { status: 500 });
    }
    console.log(`getVapidPublicKey: usage=${usage}, key=${usage === 'native' ? 'VAPID_PUBLIC_KEY' : (firebaseVapidKey ? 'FIREBASE_VAPID_KEY' : 'VAPID_PUBLIC_KEY (fallback)')}`);

    return Response.json({ public_key: publicKey, usage });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});