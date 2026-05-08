import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

const VIBRATE_PATTERNS = {
  "Fire":           [200, 100, 200, 100, 200, 300, 500, 100, 500, 100, 500, 300, 200, 100, 200, 100, 200],
  "Medical":        [500, 200, 500, 200],
  "Active Shooter": [800, 200, 800, 200, 800, 200],
  "Disturbance":    [300, 200, 300, 200, 300, 200],
};

const BG_COLORS = {
  "Fire":           ["rgba(220,60,0,0.98)",  "rgba(10,0,0,0.98)"],
  "Medical":        ["rgba(0,80,180,0.98)",  "rgba(10,0,0,0.98)"],
  "Active Shooter": ["rgba(180,0,0,0.98)",   "rgba(10,0,0,0.98)"],
  "Disturbance":    ["rgba(140,80,0,0.98)",  "rgba(10,0,0,0.98)"],
};

export default function EmergencyOverlay({ alert, onDismiss }) {
  const { user } = useAuth();
  const [dismissing, setDismissing] = useState(false);
  const [flash, setFlash] = useState(false);
  const intervalRefs = useRef({ flash: null, vibrate: null, torch: null });
  const torchTrackRef = useRef(null);
  const torchStreamRef = useRef(null);
  const [hasAcknowledged, setHasAcknowledged] = useState(false);

  // Check if current user has already acknowledged this alert
  useEffect(() => {
    if (!alert || !user) return;
    
    const checkAcknowledgment = async () => {
      try {
        const existing = await base44.entities.SafetyCheckIn.filter({
          alert_id: alert.id,
          user_email: user.email
        });
        if (existing.length > 0) {
          setHasAcknowledged(true);
        }
      } catch (e) {
        console.warn("Could not check acknowledgment status:", e);
      }
    };
    
    checkAcknowledgment();
  }, [alert?.id, user?.email]);

  useEffect(() => {
    if (!alert || hasAcknowledged) return;

    const pattern = VIBRATE_PATTERNS[alert.alert_type] || VIBRATE_PATTERNS["Fire"];
    const patternDuration = pattern.reduce((a, b) => a + b, 0) + 500;

    // 1. Screen flash
    intervalRefs.current.flash = setInterval(() => setFlash(f => !f), 400);

    // 2. Vibration loop - use larger amplitude pattern for better feedback
    if (navigator.vibrate) {
      try {
        navigator.vibrate(pattern);
        intervalRefs.current.vibrate = setInterval(() => {
          try {
            navigator.vibrate(pattern);
          } catch (e) {
            console.warn("Vibration failed:", e);
          }
        }, patternDuration);
      } catch (e) {
        console.warn("Could not start vibration:", e);
      }
    }

    // 3. Torch flash - request camera permission and control flashlight
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: "environment",
          torch: true
        } 
      })
        .then(stream => {
          torchStreamRef.current = stream;
          const track = stream.getVideoTracks()[0];
          if (!track) {
            stream.getTracks().forEach(t => t.stop());
            return;
          }
          
          torchTrackRef.current = track;
          let on = true;
          intervalRefs.current.torch = setInterval(() => {
            try {
              track.applyConstraints({ advanced: [{ torch: on }] })
                .catch(e => console.warn("Torch constraint failed:", e));
              on = !on;
            } catch (e) {
              console.warn("Torch toggle error:", e);
            }
          }, 400);
        })
        .catch(err => {
          console.warn("Camera/torch access denied or unavailable:", err.message);
        });
    }

    return () => {
      // Cleanup all
      clearInterval(intervalRefs.current.flash);
      clearInterval(intervalRefs.current.vibrate);
      clearInterval(intervalRefs.current.torch);
      if (navigator.vibrate) navigator.vibrate(0);
      if (torchTrackRef.current) {
        torchTrackRef.current.applyConstraints({ advanced: [{ torch: false }] }).catch(() => {});
        torchTrackRef.current = null;
      }
      if (torchStreamRef.current) {
        torchStreamRef.current.getTracks().forEach(t => t.stop());
        torchStreamRef.current = null;
      }
      setFlash(false);
    };
  }, [alert?.id, hasAcknowledged]);

  if (!alert) return null;

  // Hide if current user already acknowledged
  if (hasAcknowledged) return null;

  const [bgOn, bgOff] = BG_COLORS[alert.alert_type] || BG_COLORS["Fire"];

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
      style={{ background: flash ? bgOn : bgOff, transition: "background 0.1s" }}
    >
      <div className="max-w-sm w-full mx-4 rounded-2xl border-4 border-white shadow-2xl overflow-hidden"
        style={{ background: "rgba(180,0,0,0.95)" }}>

        {/* Header */}
        <div className="bg-red-900 p-5 flex items-center gap-3">
          <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center shrink-0 animate-bounce">
            <AlertTriangle className="w-9 h-9 text-red-600" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white uppercase tracking-wider">🚨 EMERGENCY</h2>
            <p className="text-red-200 text-sm">Your Acknowledgment Required</p>
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
            onClick={async () => {
              if (dismissing || !user) return;
              setDismissing(true);
              try {
                // Create individual SafetyCheckIn record
                await base44.entities.SafetyCheckIn.create({
                  alert_id: alert.id,
                  user_email: user.email,
                  user_name: user.full_name || user.email,
                  status: "safe"
                });
                setHasAcknowledged(true);
                onDismiss();
              } catch (e) {
                console.warn("Could not acknowledge alert:", e);
              }
              setDismissing(false);
            }}
            disabled={dismissing}
            className="w-full bg-white text-red-700 font-black text-lg py-5 rounded-xl active:bg-red-50 transition-colors disabled:opacity-60"
          >
            {dismissing ? "⏳ ACKNOWLEDGING..." : "✅ ACKNOWLEDGE & STOP"}
          </button>

          <p className="text-center text-red-300 text-xs">
            🔴 Vibrating — tap ACKNOWLEDGE to stop
          </p>
        </div>
      </div>
    </div>
  );
}