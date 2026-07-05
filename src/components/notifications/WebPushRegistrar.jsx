import React from "react";
import { useAuth } from "@/lib/AuthContext";
import { useWebPushSubscription } from "@/hooks/useWebPushSubscription";

/**
 * Mounts the native Web Push subscription lifecycle for the current user.
 * Renders nothing — it only subscribes the browser (on non-FCM browsers) and
 * persists the subscription to the PushSubscription entity so the backend can
 * deliver true closed-app push via the Web Push API.
 */
export default function WebPushRegistrar() {
  const { user } = useAuth();
  useWebPushSubscription(user);
  return null;
}