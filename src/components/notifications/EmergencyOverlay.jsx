import { useEffect, useRef, useState, useCallback } from "react";
import { AlertTriangle } from "lucide-react";

const VIBRATE_PATTERNS = {
  "Fire":           [200, 100, 200, 100, 200, 300, 500, 100, 500, 100, 500, 300, 200, 100, 200, 100, 200],
  "Medical":        [500, 200, 500, 200],
  "Active Shooter": [800, 200, 800, 200, 800, 200],
  "Disturbance":    [300, 200, 300, 200, 300, 200],
};
function getPattern(type) {
  return VIBRATE_PATTERNS[type] || VIBRATE_PATTERNS["Fire"];
}

const BG_COLORS = {
  "Fire":           ["rgba(200,60,0,0.98)", "rgba(10,0,0,0.98)"],
  "Medical":        ["rgba(0,80,180,0.98)", "rgba(10,0,0,0.98)"],
  "Active Shooter": ["rgba(180,0,0,0.98)",  "rgba(10,0,0,0.98)"],
  "Disturbance":    ["rgba(140,80,0,0.98)", "rgba(10,0,0,0.98)"],
};
function getBg(type, flash) {
  const [a, b] = BG_COLORS[type] || BG_COLORS["Fire"];
  return flash ? a : b;
}

export default function EmergencyOverlay({ alert, onDismiss }) {
  const [flash, setFlash] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const flashRef = useRef(null);
  const vibrateRef = useRef(null);
  const torchStopRef = useRef(false);
  const torchStreamRef = useRef(null);

  // Start vibration loop — must be called from user gesture context
  const startVibration = useCallback((pattern) => {
    if (!navigator.vibrate) return;
    navigator.vibrate(pattern);
    const total = pattern.reduce((a, b) => a + b, 0) + 600;
    vibrateRef.current = setInterval(() => {
      navigator.vibrate(pattern);
    }, total);
  }, []);

  // Torch flash
  const startTorch = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      torchStreamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      const caps = track.getCapabilities?.() || {};
      if (!caps.torch) { stream.getTracks().forEach(t => t.stop()); return; }
      let on = true;
      torchStopRef.current = false;
      const loop = async () => {
        if (torchStopRef.current) {
          track.applyConstraints({ advanced: [{ torch: false }] }).catch(() => {});
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        await track.applyConstraints({ advanced: [{ torch: on }] }).catch(() => {});
        on = !on;
        setTimeout(loop, 400);
      };
      loop();
    } catch (_) {}
  }, []);

  const stopAll = useCallback(() => {
    clearInterval(flashRef.current);
    clearInterval(vibrateRef.current);
    torchStopRef.current = true;
    if (navigator.vibrate) navigator.vibrate(0);
    if (torchStreamRef.current) {
      torchStreamRef.current.getTracks().forEach(t => t.stop());
      torchStreamRef.current = null;
    }
    setFlash(false);
    setUnlocked(false);
  }, []);

  // Auto-start everything as soon as alert appears
  useEffect(() => {
    if (!alert) { stopAll(); return; }

    // Screen flash — no gesture needed
    flashRef.current = setInterval(() => setFlash(f => !f), 500);

    // Try vibration + torch immediately (works if app was already interacted with)
    const pattern = getPattern(alert.alert_type);
    startVibration(pattern);
    startTorch();
    setUnlocked(true);

    return () => {
      clearInterval(flashRef.current);
      setFlash(false);
    };
  }, [alert]);

  // Fallback: if vibration wasn't allowed yet, unlock on first tap anywhere
  const handleUnlock = useCallback(() => {
    if (!alert || unlocked) return;
    setUnlocked(true);
    startVibration(getPattern(alert.alert_type));
    startTorch();
  }, [alert, unlocked, startVibration, startTorch]);

  const handleAcknowledge = useCallback(() => {
    stopAll();
    onDismiss();
  }, [stopAll, onDismiss]);

  if (!alert) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
      style={{ background: getBg(alert.alert_type, flash), transition: "background 0.15s" }}
      onClick={handleUnlock}
    >
      {/* Fallback tap banner — only shown if auto-start failed */}
      {!unlocked && (
        <div className="absolute top-0 left-0 right-0 bg-yellow-400 text-black text-center py-3 font-bold text-base tracking-wide animate-pulse" onClick={handleUnlock}>
          👆 TAP HERE TO ACTIVATE VIBRATION
        </div>
      )}

      <div className="max-w-sm w-full mx-4 rounded-2xl border-4 border-white shadow-2xl overflow-hidden"
        style={{ background: "rgba(180,0,0,0.95)" }}>

        {/* Header */}
        <div className="bg-red-900 p-5 flex items-center gap-3">
          <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center shrink-0 animate-bounce">
            <AlertTriangle className="w-9 h-9 text-red-600" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white uppercase tracking-wider">🚨 EMERGENCY</h2>
            <p className="text-red-200 text-sm">Immediate Action Required</p>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          <div className="bg-white rounded-xl p-4">
            <h3 className="text-xl font-black text-red-600 mb-1 uppercase">{alert.alert_type}</h3>
            <p className="text-gray-800 text-sm leading-relaxed">{alert.message}</p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-red-900 rounded-lg p-3">
              <p className="text-red-300 uppercase tracking-wider mb-1">Triggered By</p>
              <p className="text-white font-semibold">{alert.triggered_by || "System"}</p>
            </div>
            <div className="bg-red-900 rounded-lg p-3">
              <p className="text-red-300 uppercase tracking-wider mb-1">Time</p>
              <p className="text-white font-semibold">
                {alert.created_date ? new Date(alert.created_date).toLocaleTimeString() : "Now"}
              </p>
            </div>
          </div>

          <button
            onClick={(e) => { e.stopPropagation(); handleAcknowledge(); }}
            className="w-full bg-white text-red-700 font-black text-lg py-5 rounded-xl active:bg-red-50 transition-colors"
          >
            ✅ ACKNOWLEDGE & STOP
          </button>

          <p className="text-center text-red-300 text-xs">
            🔴 Tap ACKNOWLEDGE to stop all alerts
          </p>
        </div>
      </div>
    </div>
  );
}