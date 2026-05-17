/**
 * MinimizedAppBar
 *
 * When minimized:
 * - App content is hidden but stays mounted (state/subscriptions alive)
 * - A persistent browser notification is shown so the user can tap it
 *   from the notification shade while using other apps to jump back
 * - A floating pill at the bottom of the screen shows status when in-browser
 */
import { useState, useEffect, useRef } from "react";
import { Shield, ChevronUp, AlertTriangle, Minimize2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

// Show a persistent notification the user can tap from outside the browser
function showPersistentNotification(activeAlert, unreadCount) {
  if (!("serviceWorker" in navigator) || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  navigator.serviceWorker.ready.then(reg => {
    const title = activeAlert
      ? `🚨 ${activeAlert.alert_type} — Shepherd Shield`
      : "Shepherd Shield — Running";
    const body = activeAlert
      ? activeAlert.message
      : unreadCount > 0
        ? `${unreadCount} unread notification${unreadCount > 1 ? "s" : ""} — Tap to open`
        : "App is running in the background — Tap to open";

    reg.showNotification(title, {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: "shepherd-minimized",       // tag ensures only ONE persistent notification
      renotify: false,
      silent: true,                    // no sound/vibration for the persistent one
      requireInteraction: true,        // stays until user taps or app is restored
      data: { url: "/" },
    });
  }).catch(() => {});
}

function clearPersistentNotification() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.ready.then(reg => {
    reg.getNotifications({ tag: "shepherd-minimized" })
      .then(notifs => notifs.forEach(n => n.close()))
      .catch(() => {});
  }).catch(() => {});
}

export default function MinimizedAppBar({ children }) {
  const [minimized, setMinimized] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeAlert, setActiveAlert] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const persistentRef = useRef(null);

  // Clock
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Unread notifications
  useEffect(() => {
    const unsub = base44.entities.Notification.subscribe((event) => {
      if (event.type === "create" && !event.data?.read) setUnreadCount(c => c + 1);
    });
    return () => unsub();
  }, []);

  // Emergency alerts
  useEffect(() => {
    base44.entities.EmergencyAlert.filter({ is_active: true })
      .then(alerts => setActiveAlert(alerts[0] || null))
      .catch(() => {});

    const unsub = base44.entities.EmergencyAlert.subscribe((event) => {
      if (event.type === "create" && event.data?.is_active) {
        setActiveAlert(event.data);
        setMinimized(false); // always pop up for emergencies
      } else if (event.type === "update" || event.type === "delete") {
        base44.entities.EmergencyAlert.filter({ is_active: true })
          .then(alerts => setActiveAlert(alerts[0] || null))
          .catch(() => {});
      }
    });
    return () => unsub();
  }, []);

  // When minimized, show persistent notification; update it when alert/unread changes
  useEffect(() => {
    if (minimized) {
      showPersistentNotification(activeAlert, unreadCount);
    } else {
      clearPersistentNotification();
    }
  }, [minimized, activeAlert, unreadCount]);

  // Clear persistent notification on unmount
  useEffect(() => () => clearPersistentNotification(), []);

  const handleMinimize = () => setMinimized(true);
  const handleRestore = () => {
    setMinimized(false);
    setUnreadCount(0);
  };

  const timeStr = currentTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <>
      {/* Full app — hidden but alive when minimized */}
      <div style={{ display: minimized ? "none" : "contents" }}>
        {children}
      </div>

      {/* Minimize button — top right, only when not minimized */}
      {!minimized && (
        <button
          onClick={handleMinimize}
          title="Minimize — app keeps running, tap notification to return"
          className="fixed top-3 right-[120px] z-[10002] flex items-center gap-1 bg-[#1a2744]/80 border border-[rgba(212,168,67,0.2)] text-slate-400 text-[11px] px-2.5 py-1 rounded-full hover:text-[#d4a843] hover:border-[rgba(212,168,67,0.5)] transition-all active:scale-95 backdrop-blur-sm"
        >
          <Minimize2 className="w-3 h-3" />
          <span className="hidden sm:inline">Minimize</span>
        </button>
      )}

      {/* Minimized floating pill — visible when user is still in the browser */}
      {minimized && (
        <div className="fixed bottom-0 left-0 right-0 z-[10001] px-3 pb-3 pt-1" style={{ pointerEvents: "none" }}>
          <button
            onClick={handleRestore}
            className={`w-full flex items-center gap-3 rounded-2xl px-4 py-3 shadow-2xl active:scale-[0.98] transition-transform border ${
              activeAlert
                ? "bg-red-900/95 border-red-500/60"
                : "bg-[#141f3d] border-[rgba(212,168,67,0.3)]"
            }`}
            style={{ pointerEvents: "all" }}
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${activeAlert ? "bg-red-500" : "bg-[#d4a843]"}`}>
              {activeAlert
                ? <AlertTriangle className="w-4 h-4 text-white" />
                : <Shield className="w-4 h-4 text-[#0a1128]" />
              }
            </div>

            <div className="flex-1 text-left min-w-0">
              {activeAlert ? (
                <>
                  <p className="text-red-300 text-xs font-black uppercase tracking-wide leading-none">🚨 {activeAlert.alert_type}</p>
                  <p className="text-red-200 text-[11px] truncate mt-0.5">{activeAlert.message}</p>
                </>
              ) : (
                <>
                  <p className="text-white text-sm font-semibold leading-none">Shepherd Shield · Running</p>
                  <p className="text-slate-400 text-[11px] mt-0.5">{timeStr} — Tap to open</p>
                </>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {unreadCount > 0 && (
                <div className="min-w-5 h-5 rounded-full bg-[#d4a843] flex items-center justify-center px-1">
                  <span className="text-[#0a1128] text-[10px] font-black">{unreadCount > 9 ? "9+" : unreadCount}</span>
                </div>
              )}
              <div className="w-6 h-6 rounded-full bg-[rgba(212,168,67,0.15)] flex items-center justify-center">
                <ChevronUp className="w-3.5 h-3.5 text-[#d4a843]" />
              </div>
            </div>
          </button>
        </div>
      )}
    </>
  );
}