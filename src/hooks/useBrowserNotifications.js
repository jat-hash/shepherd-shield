import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

/**
 * useBrowserNotifications
 *
 * Fires native OS-level browser notifications for in-app events. Uses the
 * Service Worker's showNotification when available (reliable when the page is
 * backgrounded — the notification still displays even when the tab is not
 * focused), with a `new Notification()` fallback.
 *
 * This is the single source of truth for native browser notifications across
 * the app. The Notification entity subscription in BrowserNotificationDispatcher
 * calls `notify()` for every created notification (chats, DMs, assignments,
 * incidents, reminders), replacing the inline native-notification calls that
 * used to live in NotificationToast and AlertNotificationSystem.
 */

const VIBRATE = {
  dm: [400, 120, 400, 120, 400],
  general: [400, 120, 400, 120, 400],
  assignment: [200, 100, 200],
  incident: [400, 150, 400, 150, 400],
  emergency: [1000, 200, 1000, 200, 1000, 200, 1000],
};

function deriveType(notification) {
  const type = notification.type || "general";
  if (type === "incident") return "incident";
  if (type.startsWith("assignment")) return "assignment";
  if (notification.dm_channel) return "dm";
  return "general";
}

function routeFor(notification, nType) {
  if (notification.dm_channel) {
    return `/Communications?channel=${encodeURIComponent(notification.dm_channel)}`;
  }
  if (nType === "assignment" || notification.assignment_id) return "/Assignments";
  if (nType === "incident") return "/Incidents";
  return "/Communications";
}

export function useBrowserNotifications() {
  const navigate = useNavigate();

  const notify = useCallback(
    async (notification) => {
      if (!notification) return;
      if (!("Notification" in window) || window.Notification?.permission !== "granted") return;

      const nType = deriveType(notification);
      const route = routeFor(notification, nType);
      const prefix = nType === "incident" ? "🚨" : nType === "assignment" ? "🔔" : "💬";

      const title = `${prefix} ${notification.title || "Shepherd Shield"}`;
      const options = {
        body: notification.message || "",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: `shepherd-${nType}-${notification.id || Date.now()}`,
        requireInteraction: true,
        renotify: true,
        vibrate: VIBRATE[nType] || VIBRATE.general,
        data: {
          url: route,
          dm_channel: notification.dm_channel || "",
          type: nType,
        },
      };

      // SW-based display works reliably when the tab is backgrounded.
      try {
        if ("serviceWorker" in navigator) {
          const reg = await navigator.serviceWorker.ready;
          await reg.showNotification(title, options);
          return;
        }
      } catch (_) {
        // fall through to the page-level Notification constructor
      }
      try {
        const n = new window.Notification(title, options);
        n.onclick = () => {
          window.focus();
          navigate(route);
          n.close();
        };
      } catch (_) {}
    },
    [navigate]
  );

  return { notify };
}