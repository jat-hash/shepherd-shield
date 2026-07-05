import React, { useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useBrowserNotifications } from "@/hooks/useBrowserNotifications";

/**
 * Centralized native browser notification dispatcher. Subscribes to the
 * Notification entity for the current user and fires a native OS-level
 * browser notification for every newly created record — covering chats, DMs,
 * assignments, incidents, and reminders in one place. Replaces the scattered
 * inline native-notification calls that previously lived in NotificationToast
 * and AlertNotificationSystem (which would otherwise duplicate these alerts).
 */
export default function BrowserNotificationDispatcher() {
  const { user } = useAuth();
  const { notify } = useBrowserNotifications();

  useEffect(() => {
    if (!user?.email) return;
    const unsub = base44.entities.Notification.subscribe((event) => {
      if (event.type !== "create") return;
      if (event.data?.user_email !== user.email) return;
      notify(event.data);
    });
    return () => unsub();
  }, [user?.email, notify]);

  return null;
}