/**
 * MinimizedAppBar
 *
 * Google Maps-style minimize:
 * - "Minimize" button in the top-right header area
 * - When minimized, app content hides but stays mounted (state preserved)
 * - A floating pill at the TOP of the screen is always visible
 * - Uses Picture-in-Picture (PiP) canvas so the pill stays visible even when
 *   the user switches to another app (Chrome/Android supports this)
 * - Background keepalive: pings subscriptions every 15s to ensure incident
 *   alerts and location updates keep arriving even when the page is hidden
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { Shield, AlertTriangle, Minimize2, Maximize2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

// ── Background Keepalive ──────────────────────────────────────────────────────
// Keeps a periodic ping so the browser doesn't freeze JS timers when hidden.
function useBackgroundKeepalive(minimized) {
  const pingRef = useRef(null);

  useEffect(() => {
    // Always run keepalive, but ramp up frequency when minimized
    const interval = minimized ? 15_000 : 60_000;

    const ping = () => {
      // Touch the entities to keep WebSocket subscriptions alive
      base44.entities.EmergencyAlert.filter({ is_active: true }, undefined, 1).catch(() => {});
      base44.entities.Incident.filter({ status: "Open" }, "-created_date", 1).catch(() => {});
    };

    clearInterval(pingRef.current);
    pingRef.current = setInterval(ping, interval);

    // Also ping immediately when page becomes visible again
    const onVisible = () => {
      if (document.visibilityState === "visible") ping();
    };
    document.addEventListener("visibilitychange", onVisible);

    // Request a Wake Lock so the browser doesn't suspend JS (best-effort)
    let wakeLock = null;
    if (minimized && "wakeLock" in navigator) {
      navigator.wakeLock.request("screen").then(wl => { wakeLock = wl; }).catch(() => {});
    }

    return () => {
      clearInterval(pingRef.current);
      document.removeEventListener("visibilitychange", onVisible);
      if (wakeLock) wakeLock.release().catch(() => {});
    };
  }, [minimized]);
}

// ── Picture-in-Picture floating overlay ──────────────────────────────────────
// Renders a small canvas with status text into PiP so it floats above other apps.
function usePictureInPicture(minimized, alertText, unreadCount) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const pipWindowRef = useRef(null);
  const rafRef = useRef(null);

  const drawCanvas = useCallback((canvas, text, badge) => {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background pill
    const r = 18;
    ctx.fillStyle = "#141f3d";
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, r);
    ctx.fill();

    // Border
    ctx.strokeStyle = badge > 0 ? "#dc2626" : "rgba(212,168,67,0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(1, 1, canvas.width - 2, canvas.height - 2, r);
    ctx.stroke();

    // Shield icon placeholder (circle)
    ctx.fillStyle = "#d4a843";
    ctx.beginPath();
    ctx.arc(28, canvas.height / 2, 12, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#0a1128";
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("S", 28, canvas.height / 2);

    // Text
    ctx.fillStyle = badge > 0 ? "#fca5a5" : "#f1f5f9";
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const displayText = text.length > 28 ? text.slice(0, 28) + "…" : text;
    ctx.fillText(displayText, 48, canvas.height / 2 - 4);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "11px sans-serif";
    ctx.fillText("Tap to open Shepherd Shield", 48, canvas.height / 2 + 11);

    // Badge
    if (badge > 0) {
      ctx.fillStyle = "#dc2626";
      ctx.beginPath();
      ctx.arc(canvas.width - 20, 14, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "white";
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(badge > 9 ? "9+" : String(badge), canvas.width - 20, 14);
    }
  }, []);

  useEffect(() => {
    if (!minimized) {
      // Exit PiP when restoring
      if (document.pictureInPictureElement) {
        document.exitPictureInPicture().catch(() => {});
      }
      cancelAnimationFrame(rafRef.current);
      return;
    }

    // Set up canvas → video → PiP
    const canvas = document.createElement("canvas");
    canvas.width = 340;
    canvas.height = 64;
    canvasRef.current = canvas;

    const stream = canvas.captureStream(4); // 4 fps is plenty
    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    videoRef.current = video;

    video.play().then(async () => {
      try {
        // Only request PiP on a user gesture — we call this from button click
        // so it should be fine in most browsers
        if (document.pictureInPictureEnabled && !document.pictureInPictureElement) {
          await video.requestPictureInPicture();
          pipWindowRef.current = document.pictureInPictureElement;
        }
      } catch (_) {
        // PiP not supported or blocked — silent fail, in-app pill still shows
      }
    }).catch(() => {});

    // Animate canvas
    const animate = () => {
      if (canvasRef.current) drawCanvas(canvas, alertText, unreadCount);
      rafRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(rafRef.current);
      stream.getTracks().forEach(t => t.stop());
      if (document.pictureInPictureElement === video) {
        document.exitPictureInPicture().catch(() => {});
      }
    };
  }, [minimized]);

  // Update canvas text when data changes without restarting
  useEffect(() => {
    if (canvasRef.current && minimized) {
      drawCanvas(canvasRef.current, alertText, unreadCount);
    }
  }, [alertText, unreadCount, minimized, drawCanvas]);
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function MinimizedAppBar({ children, onMinimizeChange }) {
  const [minimized, setMinimized] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeAlert, setActiveAlert] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  const alertText = activeAlert
    ? `🚨 ${activeAlert.alert_type}: ${activeAlert.message}`
    : `Shepherd Shield · ${currentTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

  useBackgroundKeepalive(minimized);
  usePictureInPicture(minimized, alertText, unreadCount);

  // Clock
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Notify parent so layout can adjust (e.g. hide sidebar)
  useEffect(() => {
    onMinimizeChange?.(minimized);
  }, [minimized, onMinimizeChange]);

  // Unread notifications
  useEffect(() => {
    const unsub = base44.entities.Notification.subscribe((event) => {
      if (event.type === "create" && !event.data?.read) setUnreadCount(c => c + 1);
    });
    return () => unsub();
  }, []);

  // Emergency alerts
  useEffect(() => {
    base44.entities.EmergencyAlert.filter({ is_active: true }).then(a => setActiveAlert(a[0] || null)).catch(() => {});
    const unsub = base44.entities.EmergencyAlert.subscribe((event) => {
      if (event.type === "create" && event.data?.is_active) {
        setActiveAlert(event.data);
        setMinimized(false); // always pop up for emergencies
      } else if (event.type === "update" || event.type === "delete") {
        base44.entities.EmergencyAlert.filter({ is_active: true }).then(a => setActiveAlert(a[0] || null)).catch(() => {});
      }
    });
    return () => unsub();
  }, []);

  const handleMinimize = () => setMinimized(true);
  const handleRestore = () => {
    setMinimized(false);
    setUnreadCount(0);
  };

  const timeStr = currentTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <>
      {/* ── Full app content (hidden but alive when minimized) ── */}
      <div style={{ display: minimized ? "none" : "contents" }}>
        {children}
      </div>

      {/* ── Minimize button injected into top bar (portal-style fixed) ── */}
      {!minimized && (
        <button
          onClick={handleMinimize}
          title="Minimize app — keep running in background"
          className="fixed top-3 right-[120px] z-[10002] flex items-center gap-1 bg-[#1a2744]/80 border border-[rgba(212,168,67,0.2)] text-slate-400 text-[11px] px-2.5 py-1 rounded-full hover:text-[#d4a843] hover:border-[rgba(212,168,67,0.5)] transition-all active:scale-95 backdrop-blur-sm"
        >
          <Minimize2 className="w-3 h-3" />
          <span className="hidden sm:inline">Minimize</span>
        </button>
      )}

      {/* ── Minimized floating pill — stays on screen at the TOP ── */}
      {minimized && (
        <div className="fixed top-0 left-0 right-0 z-[10002] px-3 pt-2 pb-1 pointer-events-none">
          <button
            onClick={handleRestore}
            className={`w-full flex items-center gap-3 rounded-2xl px-4 py-2.5 shadow-2xl active:scale-[0.98] transition-all pointer-events-auto border ${
              activeAlert
                ? "bg-red-900/95 border-red-500/60 animate-pulse"
                : "bg-[#141f3d]/95 border-[rgba(212,168,67,0.35)]"
            } backdrop-blur-md`}
          >
            {/* App icon */}
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${activeAlert ? "bg-red-500" : "bg-[#d4a843]"}`}>
              {activeAlert
                ? <AlertTriangle className="w-4 h-4 text-white" />
                : <Shield className="w-4 h-4 text-[#0a1128]" />
              }
            </div>

            {/* Text */}
            <div className="flex-1 min-w-0 text-left">
              {activeAlert ? (
                <>
                  <p className="text-red-300 text-[11px] font-black uppercase tracking-wider leading-none">🚨 {activeAlert.alert_type}</p>
                  <p className="text-red-200 text-[11px] truncate mt-0.5">{activeAlert.message}</p>
                </>
              ) : (
                <>
                  <p className="text-white text-xs font-semibold leading-none">Shepherd Shield · Running</p>
                  <p className="text-slate-400 text-[11px] mt-0.5">{timeStr} — Tap to open</p>
                </>
              )}
            </div>

            {/* Badges + restore icon */}
            <div className="flex items-center gap-2 shrink-0">
              {unreadCount > 0 && (
                <div className="min-w-5 h-5 rounded-full bg-[#d4a843] flex items-center justify-center px-1">
                  <span className="text-[#0a1128] text-[10px] font-black">{unreadCount > 9 ? "9+" : unreadCount}</span>
                </div>
              )}
              <div className="w-6 h-6 rounded-full bg-[rgba(212,168,67,0.15)] flex items-center justify-center">
                <Maximize2 className="w-3 h-3 text-[#d4a843]" />
              </div>
            </div>
          </button>
        </div>
      )}
    </>
  );
}