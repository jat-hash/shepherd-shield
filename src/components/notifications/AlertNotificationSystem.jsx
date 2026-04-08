import { useEffect, useRef, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { X, AlertTriangle, Bell, Info, CheckCircle } from "lucide-react";

// --- Sound Generator ---
function playSound(priority) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const master = ctx.createGain();
    master.gain.setValueAtTime(1.0, ctx.currentTime);
    master.connect(ctx.destination);

    if (priority === "low") {
      // Ascending 3-note ding — clearly audible
      [0, 0.18, 0.36].forEach((offset, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(master);
        osc.type = "sine";
        osc.frequency.setValueAtTime([784, 988, 1175][i], ctx.currentTime + offset);
        gain.gain.setValueAtTime(0.5, ctx.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.25);
        osc.start(ctx.currentTime + offset);
        osc.stop(ctx.currentTime + offset + 0.25);
      });
    } else if (priority === "medium") {
      // Urgent double-pulse beep — like a warning klaxon
      [0, 0.25, 0.5, 0.75].forEach((offset, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(master);
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(i % 2 === 0 ? 700 : 950, ctx.currentTime + offset);
        gain.gain.setValueAtTime(0.7, ctx.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.2);
        osc.start(ctx.currentTime + offset);
        osc.stop(ctx.currentTime + offset + 0.2);
      });
    } else if (priority === "high") {
      // Loud wailing siren — alternating frequency sweep
      for (let i = 0; i < 6; i++) {
        const offset = i * 0.2;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(master);
        osc.type = "square";
        const freqStart = i % 2 === 0 ? 440 : 880;
        const freqEnd = i % 2 === 0 ? 880 : 440;
        osc.frequency.setValueAtTime(freqStart, ctx.currentTime + offset);
        osc.frequency.exponentialRampToValueAtTime(freqEnd, ctx.currentTime + offset + 0.18);
        gain.gain.setValueAtTime(0.9, ctx.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.18);
        osc.start(ctx.currentTime + offset);
        osc.stop(ctx.currentTime + offset + 0.18);
      }
    }

    setTimeout(() => ctx.close(), 3000);
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
    // High priority requires manual acknowledgment — no auto-dismiss
    if (alert.priority !== "high") {
      const timer = setTimeout(() => {
        setVisible(false);
        setTimeout(onDismiss, 300);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAcknowledge = () => {
    setVisible(false);
    setTimeout(onDismiss, 300);
  };

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
      {priority === "high" ? (
        <button
          onClick={handleAcknowledge}
          className="flex items-center gap-1 bg-red-500 hover:bg-red-400 text-white text-xs font-bold px-2 py-1 rounded-lg whitespace-nowrap"
        >
          <CheckCircle className="w-3 h-3" /> ACK
        </button>
      ) : (
        <button onClick={() => { setVisible(false); setTimeout(onDismiss, 300); }} className="opacity-60 hover:opacity-100">
          <X className="w-4 h-4" />
        </button>
      )}
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

// --- Continuous Alarm ---
function startContinuousAlarm() {
  const interval = setInterval(() => playSound("high"), 1500);
  return interval;
}

// --- Main Component ---
export default function AlertNotificationSystem({ onUnreadCountChange }) {
  const { user } = useAuth();
  const [toasts, setToasts] = useState([]);
  const [screenFlash, setScreenFlash] = useState(false);
  const seenIdsRef = useRef(new Set());
  const unreadCountRef = useRef(0);
  const pollRef = useRef(null);
  const alarmIntervalRef = useRef(null);
  const activeHighAlarmsRef = useRef(new Set());

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

    // Continuous alarm for high priority until acknowledged
    if (priority === "high") {
      activeHighAlarmsRef.current.add(id);
      if (!alarmIntervalRef.current) {
        alarmIntervalRef.current = startContinuousAlarm();
      }
    }

    // Vibrate — all priorities
    if (navigator.vibrate) {
      if (priority === "high") {
        // Initial strong burst
        navigator.vibrate([500, 150, 500, 150, 500, 150, 500]);
        // Keep looping until acknowledged
        const vibrateLoop = setInterval(() => {
          if (activeHighAlarmsRef.current.size > 0) {
            navigator.vibrate([400, 120, 400, 120, 400]);
          } else {
            clearInterval(vibrateLoop);
          }
        }, 2000);
      } else if (priority === "medium") {
        navigator.vibrate([300, 100, 300, 100, 300]);
      } else {
        // Low — two short pulses so it's noticeable
        navigator.vibrate([150, 80, 150]);
      }
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

    // Polling fallback every 60 seconds (real-time subscriptions handle the rest)
    pollRef.current = setInterval(poll, 60000);

    // Poll immediately when tab regains focus
    const handleVisibility = () => {
      if (document.visibilityState === "visible") poll();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      unsub();
      clearInterval(pollRef.current);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [user?.email, poll, triggerAlert]);

  const dismissToast = useCallback((toastId, notifId, priority) => {
    setToasts(prev => prev.filter(t => t._toastId !== toastId));
    // If this was a high-priority alarm, remove from active set
    if (priority === "high" && notifId) {
      activeHighAlarmsRef.current.delete(notifId);
      if (activeHighAlarmsRef.current.size === 0 && alarmIntervalRef.current) {
        clearInterval(alarmIntervalRef.current);
        alarmIntervalRef.current = null;
        if (navigator.vibrate) navigator.vibrate(0); // stop vibration
      }
    }
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
              onDismiss={() => dismissToast(t._toastId, t.id, t.priority)}
            />
          </div>
        ))}
      </div>
    </>
  );
}