import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Bell, ExternalLink, MessageSquare, Mail, CheckCircle, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { triggerNotificationEffect } from "@/lib/notificationEffects";

function getNotificationRoute(notification) {
  const type = notification.type || "";
  const msg = (notification.message || "").toLowerCase();
  const title = (notification.title || "").toLowerCase();

  if (notification.assignment_id || type.includes("assignment")) return "/Assignments";

  if (type === "general") {
    // DM: has a channel field — deep link directly
    if (notification.dm_channel) {
      return `/Communications?channel=${encodeURIComponent(notification.dm_channel)}`;
    }
    // Incident keywords (check first — broad match on title emojis and keywords)
    if (
      title.includes("incident") || msg.includes("incident") ||
      title.includes("document added") || title.includes("attachment") ||
      msg.includes("attachment") || msg.includes("status changed") ||
      (title.includes("alert") && msg.includes("reported")) ||
      title.includes("severity") || msg.includes("severity") ||
      msg.includes("reported at") || msg.includes("incident report")
    ) {
      return "/Incidents";
    }
    // Equipment keywords
    if (title.includes("equipment") || msg.includes("equipment") || msg.includes("checked out") || msg.includes("returned")) {
      return "/EquipmentInventory";
    }
    // Check-in/out keywords
    if (title.includes("check-in") || title.includes("check-out") || msg.includes("checked in") || msg.includes("checked out for their assignment")) {
      return "/Assignments";
    }
    // DM fallback by keyword
    if (msg.includes("direct message") || title.includes("message from") || title.includes("direct message")) {
      return "/Communications?tab=dm";
    }
    // General channel message
    if (msg.includes("message") || title.includes("message")) {
      return "/Communications";
    }
    return null;
  }
  return null;
}

function extractUrl(text) {
  if (!text) return null;
  const match = text.match(/https?:\/\/[^\s]+/);
  return match ? match[0] : null;
}

function getIcon(notification) {
  const type = notification.type || "";
  const isDM = !!(notification.dm_channel || (notification.title || "").toLowerCase().includes("message from"));
  if (type.includes("assignment")) return <Bell className="w-4 h-4 text-[#d4a843] shrink-0" />;
  if (type === "general") return isDM
    ? <Mail className="w-5 h-5 text-blue-300 shrink-0 animate-bounce" />
    : <MessageSquare className="w-5 h-5 text-[#d4a843] shrink-0 animate-bounce" />;
  return <MessageSquare className="w-5 h-5 text-[#d4a843] shrink-0" />;
}

export default function NotificationToast({ userEmail }) {
  const [toasts, setToasts] = useState([]);
  const seenIds = useRef(new Set());
  const isFirstLoad = useRef(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!userEmail) return;

    // Subscribe immediately — isFirstLoad gate prevents toasting pre-existing notifications
    const unsub = base44.entities.Notification.subscribe((event) => {
      if (event.type !== "create") return;
      if (event.data?.user_email !== userEmail) return;
      // Only handle 'general' type (DM/team messages) — other types owned by AlertNotificationSystem
      if (event.data?.type !== "general") return;
      const n = event.data;
      if (seenIds.current.has(n.id)) return;
      seenIds.current.add(n.id);
      if (isFirstLoad.current) return;
      addToast(n);
    });

    // Seed existing IDs to suppress re-toasting on reconnect
    base44.entities.Notification.filter({ user_email: userEmail, type: "general" }, '-created_date', 50)
      .then(existing => { existing.forEach(n => seenIds.current.add(n.id)); })
      .catch(() => {})
      .finally(() => { isFirstLoad.current = false; });

    return () => unsub();
  }, [userEmail]);

  const addToast = (notification) => {
    const title = (notification.title || '').toLowerCase();
    const isDM = !!(notification.dm_channel || title.includes('message from'));
    // NotificationToast owns effects ONLY for 'general' (DM/team messages)
    // Assignment/incident/emergency effects are owned by AlertNotificationSystem to avoid double-fire
    if (notification.type === 'general') {
      const effectType = isDM ? 'dm' : 'general';
      triggerNotificationEffect(effectType);
      // Show a NATIVE browser notification too — this triggers reliable OS-level
      // vibration/audio independent of navigator.vibrate's user-activation gating
      // (which silently no-ops when the page has been idle, leaving messages with
      // no haptic while incident alerts still buzz via their native notification).
      // Mirrors what AlertNotificationSystem does for incidents/assignments.
      if ('Notification' in window && window.Notification?.permission === 'granted') {
        try {
          const n = new window.Notification(
            `${isDM ? '💬 Direct Message' : '💬 Team Message'} — Shepherd Shield`,
            {
              body: `${notification.title}${notification.message ? ': ' + notification.message : ''}`,
              icon: '/icon-192.png',
              badge: '/icon-192.png',
              tag: `msg-${notification.id}`,
              requireInteraction: true,
              vibrate: isDM ? [250, 100, 250, 100, 250] : [200, 100, 200],
              ...(notification.dm_channel ? { data: { dm_channel: notification.dm_channel } } : {}),
            }
          );
          // Tapping the native message notification jumps straight into that DM
          n.onclick = () => {
            window.focus();
            if (notification.dm_channel) {
              navigate(`/Communications?channel=${encodeURIComponent(notification.dm_channel)}`);
            } else {
              navigate('/Communications');
            }
            n.close();
            dismissToast(`${notification.id}_${Date.now()}`, notification.id);
          };
        } catch (_) {}
      }
    }
    const toastId = `${notification.id}_${Date.now()}`;
    setToasts(prev => [...prev, { ...notification, _toastId: toastId }]);
    // No auto-dismiss — stays open until user taps it
  };

  const dismissToast = (toastId, notifId) => {
    setToasts(prev => prev.filter(t => t._toastId !== toastId));
    if (notifId) {
      base44.entities.Notification.update(notifId, { read: true }).catch(() => {});
    }
  };

  const handleNavigate = (toast) => {
    const url = extractUrl(toast.message);
    if (url) {
      window.open(url, "_blank");
    } else {
      const route = getNotificationRoute(toast);
      if (route) navigate(route);
    }
    // Tapping the card navigates but does NOT dismiss — the user must
    // press the dedicated ACK button to clear the toast (mandatory acknowledgement).
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3" style={{ maxWidth: '340px', width: 'calc(100vw - 48px)' }}>
      {toasts.map((toast) => {
        const url = extractUrl(toast.message);
        const route = getNotificationRoute(toast);
        const isDM = !!(toast.dm_channel || (toast.title || "").toLowerCase().includes("message from"));
        const isClickable = !!(url || route);

        return (
          <div
            key={toast._toastId}
            className={`rounded-xl border shadow-2xl px-4 py-3 transition-all duration-300 ${isDM ? "bg-blue-950 border-blue-500 text-blue-100" : "bg-[#1a2744] border-[rgba(212,168,67,0.4)] text-white"}`}
            style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.6)', animation: 'slideInRight 0.3s ease-out' }}
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">{getIcon(toast)}</div>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-bold uppercase tracking-wider mb-0.5 ${isDM ? "text-blue-200" : "text-[#d4a843]"}`}>
                  {isDM ? "💬 Direct Message" : "💬 Team Message"}
                </p>
                <p className="text-sm font-semibold leading-tight">{toast.title}</p>
                {url ? (
                  <button onClick={() => { window.open(url, "_blank"); }} className="text-xs text-blue-400 underline flex items-center gap-1 mt-1">
                    <ExternalLink className="w-3 h-3" /> Open link
                  </button>
                ) : (
                  <p className="text-xs opacity-80 mt-1 line-clamp-2">{toast.message}</p>
                )}
              </div>
              {/* Dedicated ACK button — the only way to dismiss. Pressing it also
                  marks the notification read and (optionally) navigates. */}
              <button
                onClick={() => dismissToast(toast._toastId, toast.id)}
                className={`flex-shrink-0 mt-0.5 flex items-center gap-1 text-xs font-bold px-2 py-1.5 rounded-lg whitespace-nowrap ${isDM ? "bg-blue-500 hover:bg-blue-400 text-white" : "bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128]"}`}
              >
                <CheckCircle className="w-3 h-3" /> ACK
              </button>
            </div>
            {isClickable && (
              <button
                onClick={() => handleNavigate(toast)}
                className={`mt-2 pl-8 text-[10px] flex items-center gap-1 ${isDM ? "text-blue-300" : "text-[#d4a843]"}`}
              >
                Tap to open <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        );
      })}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}