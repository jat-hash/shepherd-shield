import { useEffect, useRef, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { X, AlertTriangle, Bell, Info } from "lucide-react";

// --- Sound Generator ---
function playSound(priority) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const master = ctx.createGain();
    master.connect(ctx.destination);

    if (priority === "low") {
      // Soft click
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(master);
      osc.type = "sine"; osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.12);
    } else if (priority === "medium") {
      // Two-tone notification
      [0, 0.18].forEach((offset, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(master);
        osc.type = "triangle";
        osc.frequency.setValueAtTime(i === 0 ? 660 : 880, ctx.currentTime + offset);
        gain.gain.setValueAtTime(0.3, ctx.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.18);
        osc.start(ctx.currentTime + offset);
        osc.stop(ctx.currentTime + offset + 0.18);
      });
    } else if (priority === "high") {
      // Urgent alarm — repeating bursts
      for (let i = 0; i < 3; i++) {
        const offset = i * 0.22;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(master);
        osc.type = "square";
        osc.frequency.setValueAtTime(440, ctx.currentTime + offset);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + offset + 0.1);
        gain.gain.setValueAtTime(0.4, ctx.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.2);
        osc.start(ctx.currentTime + offset);
        osc.stop(ctx.currentTime + offset + 0.2);
      }
    }

    setTimeout(() => ctx.close(), 2000);
  } catch (_) {}
}

// --- Browser Notification ---
function showBrowserNotification(message, priority) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const icons = { high: "🚨", medium: "⚠️", low: "🔔" };
  try {
    new Notification(`${icons[priority] || "🔔"} Shepherd Shield Alert`, {
      body: message,
      icon: "/icon-192.png",
      tag: `alert-${Date.now()}`,
      requireInteraction: priority === "high",
    });
  } catch (_) {}
}

// --- Toast Component ---
function AlertToast({ alert, onDismiss }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setTimeout(() => setVisible(true), 10);
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 300);
    }, priority === "high" ? 6000 : 4000);
    return () => clearTimeout(timer);
  }, []);

  const { priority, message, type } = alert;

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
        <p className="text-sm leading-snug">{message}</p>
      </div>
      <button onClick={() => { setVisible(false); setTimeout(onDismiss, 300); }} className="opacity-60 hover:opacity-100">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// --- Screen Flash ---
function ScreenFlash({ active }) {
  if (!active) return null;
  return (
    <div
      className="fixed inset-0 pointer-events-none z-[9999] animate-ping"
      style={{ background: "rgba(220, 38, 38, 0.25)", animationDuration: "0.4s", animationIterationCount: 2 }}
    />
  );
}

// --- Main Component ---
export default function AlertNotificationSystem({ onUnreadCountChange }) {
  const { user } = useAuth();
  const [toasts, setToasts] = useState([]);
  const [screenFlash, setScreenFlash] = useState(false);
  const seenIdsRef = useRef(new Set());
  const unreadCountRef = useRef(0);
  const pollRef = useRef(null);

  // Request browser notification permission on mount
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  const triggerAlert = useCallback((notification) => {
    const { id, message, priority = "low", type } = notification;

    if (seenIdsRef.current.has(id)) return;
    seenIdsRef.current.add(id);

    // Increment unread count
    unreadCountRef.current += 1;
    onUnreadCountChange?.(unreadCountRef.current);

    // Sound
    playSound(priority);

    // Vibrate
    if (navigator.vibrate) {
      if (priority === "high") navigator.vibrate([300, 100, 300, 100, 300]);
      else if (priority === "medium") navigator.vibrate([200, 100, 200]);
      else navigator.vibrate([100]);
    }

    // Browser notification for medium/high
    if (priority === "medium" || priority === "high") {
      showBrowserNotification(message, priority);
    }

    // Screen flash for high
    if (priority === "high") {
      setScreenFlash(true);
      setTimeout(() => setScreenFlash(false), 1200);
    }

    // In-app toast
    const toastId = `${id}-${Date.now()}`;
    setToasts(prev => [...prev, { ...notification, _toastId: toastId }]);
  }, [onUnreadCountChange]);

  const poll = useCallback(async () => {
    if (!user?.email) return;
    try {
      const notifications = await base44.entities.Notification.filter(
        { user_email: user.email, read: false },
        "-created_date",
        20
      );
      notifications.forEach(n => {
        if (!seenIdsRef.current.has(n.id)) {
          triggerAlert({
            id: n.id,
            message: n.message || n.title,
            priority: n.type === "general" ? "low" : n.type?.includes("reminder") ? "medium" : "high",
            type: n.type,
          });
        }
      });
    } catch (_) {
      // Silently fail
    }
  }, [user?.email, triggerAlert]);

  useEffect(() => {
    if (!user?.email) return;

    // Seed seen IDs with already-existing notifications so we don't spam on load
    base44.entities.Notification.filter({ user_email: user.email, read: false }, "-created_date", 50)
      .then(existing => {
        existing.forEach(n => seenIdsRef.current.add(n.id));
      })
      .catch(() => {});

    // Also subscribe to real-time changes
    const unsub = base44.entities.Notification.subscribe((event) => {
      if (event.type === "create" && event.data?.user_email === user.email) {
        triggerAlert({
          id: event.id,
          message: event.data.message || event.data.title,
          priority: event.data.type === "general" ? "low" : event.data.type?.includes("reminder") ? "medium" : "high",
          type: event.data.type,
        });
      }
    });

    // Polling fallback every 4 seconds
    pollRef.current = setInterval(poll, 4000);

    return () => {
      unsub();
      clearInterval(pollRef.current);
    };
  }, [user?.email, poll, triggerAlert]);

  const dismissToast = useCallback((toastId) => {
    setToasts(prev => prev.filter(t => t._toastId !== toastId));
  }, []);

  return (
    <>
      <ScreenFlash active={screenFlash} />

      {/* Toast Stack — top right */}
      <div className="fixed top-20 right-4 z-[9998] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t._toastId} className="pointer-events-auto">
            <AlertToast
              alert={t}
              onDismiss={() => dismissToast(t._toastId)}
            />
          </div>
        ))}
      </div>
    </>
  );
}