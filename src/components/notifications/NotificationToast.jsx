import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Bell, X, ExternalLink, MessageSquare, AlertTriangle } from "lucide-react";
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
  if (type.includes("assignment")) return <Bell className="w-4 h-4 text-[#d4a843]" />;
  if (type === "general") return <MessageSquare className="w-4 h-4 text-blue-400" />;
  return <AlertTriangle className="w-4 h-4 text-orange-400" />;
}

export default function NotificationToast({ userEmail }) {
  const [toasts, setToasts] = useState([]);
  const seenIds = useRef(new Set());
  const isFirstLoad = useRef(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!userEmail) return;

    // Pre-seed seenIds with existing notifications so we never toast them on load
    // Subscribe FIRST, then pre-seed — any notification arriving during pre-seed
    // gets added to seenIds so it won't double-fire after isFirstLoad is cleared.
    const unsub = base44.entities.Notification.subscribe((event) => {
      if (event.type !== "create") return;
      if (event.data?.user_email !== userEmail) return;
      const n = event.data;
      if (seenIds.current.has(n.id)) return;
      seenIds.current.add(n.id);
      // If still loading, mark as seen but don't toast (it's a pre-existing notification)
      if (isFirstLoad.current) return;
      addToast(n);
    });

    base44.entities.Notification.filter({ user_email: userEmail }, '-created_date', 50)
      .then(existing => {
        existing.forEach(n => seenIds.current.add(n.id));
      })
      .catch(() => {})
      .finally(() => { isFirstLoad.current = false; });

    return () => unsub();
  }, [userEmail]);

  const addToast = (notification) => {
    const isDM = !!(notification.dm_channel || (notification.title || '').toLowerCase().includes('message from'));
    triggerNotificationEffect(isDM ? 'dm' : 'assignment');
    const toastId = `${notification.id}_${Date.now()}`;
    setToasts(prev => [...prev, { ...notification, _toastId: toastId }]);
  };

  const dismissToast = (toastId) => {
    setToasts(prev => prev.filter(t => t._toastId !== toastId));
  };

  const handleClick = (toast) => {
    const url = extractUrl(toast.message);
    if (url) {
      window.open(url, "_blank");
      dismissToast(toast._toastId);
      return;
    }
    const route = getNotificationRoute(toast);
    if (route) {
      navigate(route);
      setTimeout(() => dismissToast(toast._toastId), 300);
    }
    // Don't dismiss if no route — let user see it
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3" style={{ maxWidth: '340px', width: 'calc(100vw - 48px)' }}>
      {toasts.map((toast) => {
        const url = extractUrl(toast.message);
        const route = getNotificationRoute(toast);
        const isClickable = !!(url || route);

        return (
          <div
            key={toast._toastId}
            className={`bg-[#1a2744] border border-[rgba(212,168,67,0.3)] rounded-xl shadow-2xl p-4 flex items-start gap-3 ${isClickable ? 'cursor-pointer active:bg-[#243056]' : ''}`}
            style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.6)', animation: 'slideInRight 0.3s ease-out' }}
            onClick={isClickable ? () => handleClick(toast) : undefined}
          >
            <div className="flex-shrink-0 mt-0.5">{getIcon(toast)}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white leading-tight">{toast.title}</p>
              {url ? (
                <span className="text-xs text-blue-400 flex items-center gap-1 mt-1">
                  <ExternalLink className="w-3 h-3" /> Open link
                </span>
              ) : (
                <p className="text-xs text-slate-400 mt-1 line-clamp-2">{toast.message}</p>
              )}
              {isClickable && (
                <p className="text-[10px] text-[#d4a843] mt-1">Tap to open →</p>
              )}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); dismissToast(toast._toastId); }}
              className="flex-shrink-0 text-slate-500 hover:text-white transition-colors p-0.5"
            >
              <X className="w-4 h-4" />
            </button>
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