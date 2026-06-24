import { useEffect, useRef, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { AlertTriangle, Bell, Info, CheckCircle } from "lucide-react";
import { triggerNotificationEffect } from "@/lib/notificationEffects";

// --- Browser Notification ---
function showBrowserNotification(message, priority) {
  if (!("Notification" in window) || window.Notification?.permission !== "granted") return;
  const icons = { high: "🚨", medium: "⚠️", low: "🔔" };
  try {
    new window.Notification(`${icons[priority] || "🔔"} Shepherd Shield Alert`, {
      body: message,
      icon: "/icon-192.png",
      tag: `alert-${Date.now()}`,
      requireInteraction: priority === "high" || priority === "medium",
    });
  } catch (_) {}
}

// --- Toast Component ---
function AlertToast({ alert, onDismiss }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setTimeout(() => setVisible(true), 10);
    // All toasts stay open until user explicitly dismisses them
  }, []);

  const handleAcknowledge = () => {
    setVisible(false);
    setTimeout(onDismiss, 300);
  };

  const { priority, message } = alert;

  const styles = {
    low: "bg-slate-700 border-slate-500 text-slate-100",
    medium: "bg-orange-900 border-orange-500 text-orange-100",
    high: "bg-red-900 border-red-500 text-red-100",
  };

  const icons = {
    low: <Info className="w-4 h-4 text-slate-300 shrink-0" />,
    medium: <Bell className="w-4 h-4 text-orange-300 shrink-0" />,
    high: <AlertTriangle className="w-4 h-4 text-red-300 shrink-0 animate-bounce" />,
  };

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-xl border shadow-2xl max-w-sm transition-all duration-300 ${styles[priority] || styles.low} ${
        visible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8"
      }`}
    >
      {icons[priority] || icons.low}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold uppercase tracking-wider opacity-70 mb-0.5">
          {priority === "high" ? "🚨 HIGH PRIORITY" : priority === "medium" ? "⚠️ Alert" : "Notification"}
        </p>
        {(() => {
          const urlMatch = message?.match(/https?:\/\/[^\s]+/);
          if (urlMatch) {
            const url = urlMatch[0];
            const text = message.replace(url, "").trim();
            return (
              <>
                {text && <p className="text-sm leading-snug">{text}</p>}
                <a href={url} target="_blank" rel="noreferrer"
                  className="text-xs underline opacity-80 hover:opacity-100 flex items-center gap-1 mt-1">
                  🔗 {url.length > 40 ? url.slice(0, 40) + "..." : url}
                </a>
              </>
            );
          }
          return <p className="text-sm leading-snug">{message}</p>;
        })()}
      </div>
      {/* Every alert requires an explicit Acknowledge tap — no silent dismiss.
          Color of the ACK button reflects priority. */}
      {(() => {
        const ackStyles = {
          high:   "bg-red-500 hover:bg-red-400 text-white",
          medium: "bg-orange-500 hover:bg-orange-400 text-white",
          low:    "bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128]",
        };
        return (
          <button
            onClick={handleAcknowledge}
            className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg whitespace-nowrap ${ackStyles[priority] || ackStyles.low}`}
          >
            <CheckCircle className="w-3 h-3" /> ACK
          </button>
        );
      })()}
    </div>
  );
}



// --- Main Component ---
export default function AlertNotificationSystem({ onUnreadCountChange }) {
  const { user } = useAuth();
  const [toasts, setToasts] = useState([]);
  const seenIdsRef = useRef(new Set());
  const seededRef = useRef(false);
  const mountTimeRef = useRef(new Date().toISOString());
  const unreadCountRef = useRef(0);
  const pollRef = useRef(null);

  // Permission is requested only via the Dashboard banner button (an explicit
  // user gesture) — never on mount, so we don't re-trigger the native prompt on
  // every refresh/page-load.

  const triggerAlert = useCallback((notification) => {
    const { id, message, priority = "low" } = notification;

    if (seenIdsRef.current.has(id)) return;
    seenIdsRef.current.add(id);

    unreadCountRef.current += 1;
    onUnreadCountChange?.(unreadCountRef.current);

    // AlertNotificationSystem owns effects for assignment/incident/emergency types only
    const effectType = priority === "high" ? "emergency" : priority === "medium" ? "alert" : "assignment";
    triggerNotificationEffect(effectType);

    // Browser notification (respects system DND)
    if (priority === "medium" || priority === "high") {
      showBrowserNotification(message, priority);
    }

    const toastId = `${id}-${Date.now()}`;
    setToasts(prev => [...prev, { ...notification, _toastId: toastId }]);
  }, [onUnreadCountChange]);

  const poll = useCallback(async () => {
    if (!user?.email || !seededRef.current) return;
    try {
      const notifications = await base44.entities.Notification.filter(
        { user_email: user.email, read: false },
        "-created_date",
        20
      );
      notifications.forEach(n => {
        if (!seenIdsRef.current.has(n.id)) {
          // Only alert for non-general notifications created after this session started
          // 'general' (DM/team messages) are owned by NotificationToast
          if (n.type !== "general" && n.created_date && new Date(n.created_date) >= new Date(mountTimeRef.current)) {
            triggerAlert({
              id: n.id,
              message: n.message || n.title,
              priority: n.type?.includes("reminder") ? "medium" : n.type?.includes("assignment") ? "medium" : "high",
              type: n.type,
            });
          } else {
            seenIdsRef.current.add(n.id);
          }
        }
      });
    } catch (_) {}
  }, [user?.email, triggerAlert]);

  useEffect(() => {
    if (!user?.email) return;

    let cancelled = false;

    // Subscribe IMMEDIATELY so we never miss a real-time event during the seed fetch
    // AlertNotificationSystem ONLY handles non-general types (assignments, incidents, emergencies)
    const unsub = base44.entities.Notification.subscribe((event) => {
      if (event.type === "create" && event.data?.user_email === user.email && event.data?.type !== "general") {
        triggerAlert({
          id: event.data.id,
          message: event.data.message || event.data.title,
          priority: event.data.type?.includes("reminder") ? "medium" : event.data.type?.includes("assignment") ? "medium" : "high",
          type: event.data.type,
        });
      }
    });

    // Seed existing IDs so they never re-fire — subscribe is already live above
    base44.entities.Notification.filter({ user_email: user.email, read: false }, "-created_date", 500)
      .then(existing => {
        existing.forEach(n => seenIdsRef.current.add(n.id));
        seededRef.current = true;
        if (!cancelled) pollRef.current = setInterval(poll, 60000);
      })
      .catch(() => { seededRef.current = true; });

    const handleVisibility = () => {
      if (document.visibilityState === "visible") poll();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      unsub();
      clearInterval(pollRef.current);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [user?.email, poll, triggerAlert]);

  const dismissToast = useCallback((toastId, notifId) => {
    setToasts(prev => prev.filter(t => t._toastId !== toastId));
    // Mark as read in DB so it never reappears
    if (notifId) {
      base44.entities.Notification.update(notifId, { read: true }).catch(() => {});
    }
    unreadCountRef.current = Math.max(0, unreadCountRef.current - 1);
    onUnreadCountChange?.(unreadCountRef.current);
  }, [onUnreadCountChange]);

  return (
    <>
      <div className="fixed top-20 right-4 z-[9998] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t._toastId} className="pointer-events-auto">
            <AlertToast
              alert={t}
              onDismiss={() => dismissToast(t._toastId, t.id)}
            />
          </div>
        ))}
      </div>
    </>
  );
}