import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Firebase Cloud Messaging requires the web push certificate key configured
    // in the Firebase Console — NOT the app's own native Web Push VAPID key pair.
    // These are two different keys: Firebase manages its web push cert privately,
    // while VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY are a self-generated pair for
    // sendWebPush (native Web Push). Passing the wrong key to getToken() causes
    // Firebase to reject the subscription silently.
    const firebaseVapidKey = Deno.env.get('FIREBASE_VAPID_KEY');
    const nativeVapidKey = Deno.env.get('VAPID_PUBLIC_KEY');
    const publicKey = firebaseVapidKey || nativeVapidKey;
    if (!publicKey) {
      return Response.json({ error: 'No VAPID key configured — set FIREBASE_VAPID_KEY from Firebase Console > Project Settings > Cloud Messaging > Web Push certificate' }, { status: 500 });
    }
    console.log(`getVapidPublicKey: using ${firebaseVapidKey ? 'FIREBASE_VAPID_KEY' : 'VAPID_PUBLIC_KEY (fallback — may not match Firebase web push cert)'}`);

    return Response.json({ public_key: publicKey });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});