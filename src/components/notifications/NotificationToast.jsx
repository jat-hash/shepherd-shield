import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Bell, X, ExternalLink, MessageSquare, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";

function getNotificationRoute(notification) {
  const type = notification.type || "";
  const msg = (notification.message || "").toLowerCase();
  const title = (notification.title || "").toLowerCase();
  if (notification.assignment_id || type.includes("assignment")) return "/Assignments";
  // DM notifications: title like "Message from X" or message includes "direct message"
  if (type === "general" && (msg.includes("direct message") || title.includes("message from") || title.includes("direct message"))) {
    return "/Communications?tab=dm";
  }
  if (type === "general") return "/Communications";
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
    base44.entities.Notification.filter({ user_email: userEmail }, '-created_date', 50)
      .then(existing => {
        existing.forEach(n => seenIds.current.add(n.id));
        isFirstLoad.current = false;
      })
      .catch(() => { isFirstLoad.current = false; });

    const unsub = base44.entities.Notification.subscribe((event) => {
      // Only fire on brand-new creates for this user
      if (event.type !== "create") return;
      if (event.data?.user_email !== userEmail) return;
      if (isFirstLoad.current) return;
      const n = event.data;
      if (seenIds.current.has(n.id)) return;
      seenIds.current.add(n.id);
      addToast(n);
    });

    return () => unsub();
  }, [userEmail]);

  const playSound = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 660;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {}
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
  };

  const addToast = (notification) => {
    playSound();
    const toastId = `${notification.id}_${Date.now()}`;
    setToasts(prev => [...prev, { ...notification, _toastId: toastId }]);
    // Use functional update in timeout to avoid stale closure
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t._toastId !== toastId));
    }, 6000);
  };

  const dismissToast = (toastId) => {
    setToasts(prev => prev.filter(t => t._toastId !== toastId));
  };

  const handleClick = (toast) => {
    const url = extractUrl(toast.message);
    if (url) {
      window.open(url, "_blank");
    } else {
      const route = getNotificationRoute(toast);
      if (route) navigate(route);
    }
    dismissToast(toast._toastId);
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
            className="bg-[#1a2744] border border-[rgba(212,168,67,0.3)] rounded-xl shadow-2xl p-4 flex items-start gap-3"
            style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.6)', animation: 'slideInRight 0.3s ease-out' }}
          >
            <div className="flex-shrink-0 mt-0.5">{getIcon(toast)}</div>
            <div
              className={`flex-1 min-w-0 ${isClickable ? 'cursor-pointer' : ''}`}
              onClick={isClickable ? () => handleClick(toast) : undefined}
            >
              <p className="text-sm font-semibold text-white leading-tight">{toast.title}</p>
              {url ? (
                <span className="text-xs text-blue-400 flex items-center gap-1 mt-1">
                  <ExternalLink className="w-3 h-3" /> Open link
                </span>
              ) : (
                <p className="text-xs text-slate-400 mt-1 line-clamp-2">{toast.message}</p>
              )}
              {isClickable && !url && (
                <p className="text-[10px] text-[#d4a843] mt-1">
                  {route?.includes('tab=dm') ? 'Tap to open DM →' : `Tap to open →`}
                </p>
              )}
            </div>
            <button
              onClick={() => dismissToast(toast._toastId)}
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