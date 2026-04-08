import { useEffect, useRef, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

// ── Sound Engine (Web Audio API) ─────────────────────────────────────────────
function playSound(priority) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    if (priority === "low") {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.15, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      o.start(); o.stop(ctx.currentTime + 0.15);

    } else if (priority === "medium") {
      [0, 0.18].forEach(delay => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = 660;
        o.type = "sine";
        g.gain.setValueAtTime(0.3, ctx.currentTime + delay);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.25);
        o.start(ctx.currentTime + delay);
        o.stop(ctx.currentTime + delay + 0.25);
      });

    } else if (priority === "high") {
      [0, 0.22, 0.44, 0.66].forEach((delay, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = "square";
        o.frequency.value = i % 2 === 0 ? 880 : 660;
        g.gain.setValueAtTime(0.45, ctx.currentTime + delay);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.2);
        o.start(ctx.currentTime + delay);
        o.stop(ctx.currentTime + delay + 0.2);
      });
    }
  } catch (e) {
    // silent
  }
}

// ── Browser Notification ──────────────────────────────────────────────────────
function sendBrowserNotification(message) {
  if ('Notification' in window && Notification.permission === "granted") {
    new Notification("🚨 New Alert", { body: message, icon: "/favicon.ico" });
  }
}

// ── Screen Flash ──────────────────────────────────────────────────────────────
function flashScreen() {
  const div = document.createElement("div");
  div.style.cssText = `
    position:fixed;inset:0;z-index:99999;pointer-events:none;
    background:rgba(220,38,38,0.35);
    animation:urgentFlash 0.8s ease-out forwards;
  `;
  if (!document.getElementById("urgent-flash-style")) {
    const style = document.createElement("style");
    style.id = "urgent-flash-style";
    style.textContent = `@keyframes urgentFlash{0%{opacity:1}100%{opacity:0}}`;
    document.head.appendChild(style);
  }
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 900);
}

// ── Toast Component ───────────────────────────────────────────────────────────
function Toast({ notif, onDismiss }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => { setVisible(false); setTimeout(onDismiss, 300); }, 4000);
    return () => clearTimeout(t);
  }, []);

  const colors = {
    low: "bg-slate-700 border-slate-500",
    medium: "bg-orange-600 border-orange-400",
    high: "bg-red-600 border-red-400",
  };

  const icons = { low: "🔔", medium: "⚠️", high: "🚨" };

  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-xl border shadow-2xl text-white max-w-sm w-full cursor-pointer transition-all duration-300 ${colors[notif.priority] || colors.low} ${visible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8"}`}
      style={{ transition: "opacity 0.3s, transform 0.3s" }}
      onClick={onDismiss}
    >
      <span className="text-xl flex-shrink-0">{icons[notif.priority] || "🔔"}</span>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm uppercase tracking-wide mb-0.5">
          {notif.priority === "high" ? "URGENT ALERT" : notif.priority === "medium" ? "Alert" : "Notification"}
        </div>
        <div className="text-sm opacity-90 leading-snug">{notif.message}</div>
      </div>
      <button className="opacity-60 hover:opacity-100 text-xs ml-1" onClick={e => { e.stopPropagation(); onDismiss(); }}>✕</button>
    </div>
  );
}

// ── Badge (exported for layout use) ──────────────────────────────────────────
export function useAlertBadge() {
  return window.__alertBadgeCount || 0;
}

// ── Main System ───────────────────────────────────────────────────────────────
export default function UrgentAlertSystem() {
  const { user } = useAuth();
  const [toasts, setToasts] = useState([]);
  const seenIds = useRef(new Set());
  const initialized = useRef(false);
  const badgeRef = useRef(0);

  // Request browser notification permission on mount
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const handleNewNotification = useCallback((notif) => {
    if (seenIds.current.has(notif.id)) return;
    seenIds.current.add(notif.id);

    // Derive priority from existing type field if no priority field
    const priority = notif.priority || (
      notif.type === "assignment_new" ? "medium" :
      notif.type === "assignment_reminder" ? "high" :
      notif.type === "assignment_change" ? "medium" : "low"
    );

    const enriched = { ...notif, priority };

    // Sound
    playSound(priority);

    // Browser notification
    if (priority === "medium" || priority === "high") {
      sendBrowserNotification(notif.message || notif.title);
    }

    // Screen flash
    if (priority === "high") {
      flashScreen();
    }

    // Toast
    setToasts(prev => [...prev, { ...enriched, _toastId: Date.now() + Math.random() }]);

    // Badge
    badgeRef.current += 1;
    window.__alertBadgeCount = badgeRef.current;
    window.dispatchEvent(new CustomEvent("alert:badge", { detail: badgeRef.current }));
  }, []);

  // Real-time subscription to Notification entity
  useEffect(() => {
    if (!user?.email) return;

    // Subscribe to new notifications for this user
    const unsub = base44.entities.Notification.subscribe((event) => {
      if (event.type === "create" && event.data?.user_email === user.email && !event.data?.read) {
        handleNewNotification(event.data);
      }
    });

    // Also do initial poll to seed seen IDs (don't trigger alerts for existing ones)
    base44.entities.Notification.filter({ user_email: user.email }, "-created_date", 50)
      .then(existing => {
        existing.forEach(n => seenIds.current.add(n.id));
        initialized.current = true;
      })
      .catch(() => {});

    return () => unsub();
  }, [user?.email, handleNewNotification]);

  // Polling fallback every 4 seconds for anything the subscription might miss
  useEffect(() => {
    if (!user?.email) return;

    const poll = async () => {
      if (!initialized.current) return;
      try {
        const recent = await base44.entities.Notification.filter(
          { user_email: user.email, read: false },
          "-created_date",
          10
        );
        recent.forEach(n => {
          if (!seenIds.current.has(n.id)) {
            handleNewNotification(n);
          }
        });
      } catch (e) {
        // silent
      }
    };

    const interval = setInterval(poll, 4000);
    return () => clearInterval(interval);
  }, [user?.email, handleNewNotification]);

  const dismissToast = useCallback((toastId) => {
    setToasts(prev => prev.filter(t => t._toastId !== toastId));
    badgeRef.current = Math.max(0, badgeRef.current - 1);
    window.__alertBadgeCount = badgeRef.current;
    window.dispatchEvent(new CustomEvent("alert:badge", { detail: badgeRef.current }));
  }, []);

  return (
    <div className="fixed top-4 right-4 z-[99998] flex flex-col gap-2 items-end pointer-events-none">
      {toasts.map(t => (
        <div key={t._toastId} className="pointer-events-auto">
          <Toast notif={t} onDismiss={() => dismissToast(t._toastId)} />
        </div>
      ))}
    </div>
  );
}