/**
 * MinimizedAppBar
 * 
 * A Google Maps-style minimized app preview.
 * When minimized, the full app UI is hidden and a compact floating bar 
 * sits at the bottom of the screen. Tapping it restores the full app.
 */
import { useState, useEffect } from "react";
import { Shield, ChevronUp, Bell, AlertTriangle } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function MinimizedAppBar({ children }) {
  const [minimized, setMinimized] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeAlert, setActiveAlert] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Keep clock ticking
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  // Watch unread notifications
  useEffect(() => {
    const unsub = base44.entities.Notification.subscribe((event) => {
      if (event.type === "create" && !event.data?.read) {
        setUnreadCount(c => c + 1);
      }
    });
    return () => unsub();
  }, []);

  // Watch active emergency alerts
  useEffect(() => {
    base44.entities.EmergencyAlert.filter({ is_active: true })
      .then(alerts => setActiveAlert(alerts[0] || null))
      .catch(() => {});

    const unsub = base44.entities.EmergencyAlert.subscribe((event) => {
      if (event.type === "create" && event.data?.is_active) {
        setActiveAlert(event.data);
        // Auto-expand if emergency fires while minimized
        setMinimized(false);
      } else if (event.type === "update" || event.type === "delete") {
        base44.entities.EmergencyAlert.filter({ is_active: true })
          .then(alerts => setActiveAlert(alerts[0] || null))
          .catch(() => {});
      }
    });
    return () => unsub();
  }, []);

  const timeStr = currentTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <>
      {/* Full app — hidden (not unmounted) when minimized */}
      <div style={{ display: minimized ? "none" : "contents" }}>
        {children}
      </div>

      {/* Minimize button — shown only when NOT minimized, floats bottom-left */}
      {!minimized && (
        <button
          onClick={() => setMinimized(true)}
          title="Minimize app"
          className="fixed bottom-6 left-4 z-[10000] flex items-center gap-1.5 bg-[#1a2744]/90 border border-[rgba(212,168,67,0.25)] text-slate-400 text-xs px-3 py-1.5 rounded-full shadow-lg backdrop-blur-sm hover:text-[#d4a843] hover:border-[rgba(212,168,67,0.5)] transition-all active:scale-95"
        >
          <ChevronUp className="w-3 h-3 rotate-180" />
          Minimize
        </button>
      )}

      {/* Minimized bar — Google Maps style floating pill */}
      {minimized && (
        <div
          className="fixed bottom-0 left-0 right-0 z-[10001] px-3 pb-3 pt-1"
          style={{ pointerEvents: "none" }}
        >
          <button
            onClick={() => setMinimized(false)}
            className="w-full flex items-center gap-3 bg-[#141f3d] border border-[rgba(212,168,67,0.3)] rounded-2xl px-4 py-3 shadow-2xl active:scale-[0.98] transition-transform"
            style={{ pointerEvents: "all" }}
          >
            {/* App icon */}
            <div className="w-8 h-8 rounded-full bg-[#d4a843] flex items-center justify-center shrink-0">
              <Shield className="w-4 h-4 text-[#0a1128]" />
            </div>

            {/* Text content */}
            <div className="flex-1 text-left min-w-0">
              {activeAlert ? (
                <>
                  <p className="text-red-400 text-xs font-black uppercase tracking-wide leading-none flex items-center gap-1">
                    <span className="animate-pulse">🚨</span> {activeAlert.alert_type}
                  </p>
                  <p className="text-red-300 text-[11px] truncate mt-0.5">{activeAlert.message}</p>
                </>
              ) : (
                <>
                  <p className="text-white text-sm font-semibold leading-none">Shepherd Shield</p>
                  <p className="text-slate-400 text-[11px] mt-0.5">{timeStr} — Tap to open</p>
                </>
              )}
            </div>

            {/* Right side indicators */}
            <div className="flex items-center gap-2 shrink-0">
              {activeAlert && (
                <div className="w-6 h-6 rounded-full bg-red-600 flex items-center justify-center animate-pulse">
                  <AlertTriangle className="w-3.5 h-3.5 text-white" />
                </div>
              )}
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