import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Bell, X, ExternalLink, MessageSquare, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

function getNotificationRoute(notification) {
  const type = notification.type || "";
  const msg = notification.message || "";
  if (notification.assignment_id || type.includes("assignment")) return "/Assignments";
  if (type === "general" && (msg.toLowerCase().includes("direct message") || notification.title?.toLowerCase().includes("direct message"))) {
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
  const navigate = useNavigate();
  const isFirstLoad = useRef(true);

  useEffect(() => {
    if (!userEmail) return;

    // Load existing notifications on mount — mark them all as "seen" so we don't toast them
    base44.entities.Notification.filter({ user_email: userEmail }, '-created_date', 20)
      .then(existing => {
        existing.forEach(n => seenIds.current.add(n.id));
        isFirstLoad.current = false;
      })
      .catch(() => { isFirstLoad.current = false; });

    const unsub = base44.entities.Notification.subscribe((event) => {
      if (isFirstLoad.current) return;
      if (event.type === "create" && event.data?.user_email === userEmail) {
        const n = event.data;
        if (seenIds.current.has(n.id)) return;
        seenIds.current.add(n.id);
        showToast(n);
      }
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

  const showToast = (notification) => {
    playSound();
    const id = notification.id + '_toast_' + Date.now();
    setToasts(prev => [...prev, { ...notification, _toastId: id }]);
    // Auto-dismiss after 6 seconds
    setTimeout(() => dismissToast(id), 6000);
  };

  const dismissToast = (toastId) => {
    setToasts(prev => prev.filter(t => t._toastId !== toastId));
  };

  const handleClick = (toast) => {
    const url = extractUrl(toast.message);
    if (url) { window.open(url, "_blank"); }
    else {
      const route = getNotificationRoute(toast);
      if (route) navigate(route);
    }
    dismissToast(toast._toastId);
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none" style={{ maxWidth: '340px' }}>
      {toasts.map((toast) => {
        const url = extractUrl(toast.message);
        const route = getNotificationRoute(toast);
        const isClickable = !!(url || route);

        return (
          <div
            key={toast._toastId}
            className="pointer-events-auto bg-[#1a2744] border border-[rgba(212,168,67,0.3)] rounded-xl shadow-2xl p-4 flex items-start gap-3 animate-in slide-in-from-right duration-300"
            style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
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
                  {route === '/Communications?tab=dm' ? 'Tap to open DM →' : `Tap to go to ${route?.replace('/', '')} →`}
                </p>
              )}
            </div>
            <button
              onClick={() => dismissToast(toast._toastId)}
              className="flex-shrink-0 text-slate-500 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}