import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

// Flash the rear camera torch in a loop until stopped
async function startTorchFlash(stopRef) {
  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    const track = stream.getVideoTracks()[0];
    const capabilities = track.getCapabilities?.() || {};
    if (!capabilities.torch) { stream.getTracks().forEach(t => t.stop()); return; }
    let on = true;
    while (!stopRef.current) {
      await track.applyConstraints({ advanced: [{ torch: on }] }).catch(() => {});
      on = !on;
      await new Promise(r => setTimeout(r, 300));
    }
    await track.applyConstraints({ advanced: [{ torch: false }] }).catch(() => {});
  } catch (_) {
    // Torch not supported — silently skip
  } finally {
    stream?.getTracks().forEach(t => t.stop());
  }
}

export default function EmergencyOverlay({ alert, onDismiss }) {
  const stopTorchRef = useRef(false);
  const vibrateIntervalRef = useRef(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (!alert) return;

    // Continuous vibration — SOS pattern every 2.5s
    const sosPattern = [200, 100, 200, 100, 200, 300, 500, 100, 500, 100, 500, 300, 200, 100, 200, 100, 200];
    if (navigator.vibrate) {
      navigator.vibrate(sosPattern);
      vibrateIntervalRef.current = setInterval(() => {
        if (navigator.vibrate) navigator.vibrate(sosPattern);
      }, 2500);
    }

    // Screen flash loop
    let flashInterval = setInterval(() => setFlash(f => !f), 500);

    // Torch flash in background
    stopTorchRef.current = false;
    startTorchFlash(stopTorchRef);

    return () => {
      stopTorchRef.current = true;
      clearInterval(vibrateIntervalRef.current);
      clearInterval(flashInterval);
      if (navigator.vibrate) navigator.vibrate(0);
    };
  }, [alert]);

  const handleAcknowledge = () => {
    stopTorchRef.current = true;
    clearInterval(vibrateIntervalRef.current);
    if (navigator.vibrate) navigator.vibrate(0);
    onDismiss();
  };

  if (!alert) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: flash ? "rgba(180,0,0,0.97)" : "rgba(10,5,5,0.97)" }}
    >
      <div className="max-w-lg w-full bg-red-700 rounded-2xl border-4 border-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-red-800 p-5 flex items-center gap-4">
          <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center shrink-0 animate-bounce">
            <AlertTriangle className="w-9 h-9 text-red-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white uppercase tracking-wider">🚨 EMERGENCY ALERT</h2>
            <p className="text-red-200 text-sm mt-0.5">Immediate Action Required</p>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          <div className="bg-white rounded-xl p-5">
            <h3 className="text-xl font-bold text-red-600 mb-1">{alert.alert_type}</h3>
            <p className="text-gray-800 text-base leading-relaxed">{alert.message}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-red-800 rounded-lg p-3">
              <p className="text-red-300 text-xs uppercase tracking-wider mb-1">Triggered By</p>
              <p className="text-white font-semibold">{alert.triggered_by || "System"}</p>
            </div>
            <div className="bg-red-800 rounded-lg p-3">
              <p className="text-red-300 text-xs uppercase tracking-wider mb-1">Time</p>
              <p className="text-white font-semibold">
                {alert.created_date ? new Date(alert.created_date).toLocaleTimeString() : "Now"}
              </p>
            </div>
          </div>

          <Button
            onClick={handleAcknowledge}
            className="w-full bg-white text-red-600 hover:bg-red-50 font-bold text-lg py-6 rounded-xl"
          >
            ✅ TAP TO ACKNOWLEDGE & STOP
          </Button>
          <p className="text-center text-red-200 text-xs">
            Vibration and flash will continue until you acknowledge
          </p>
        </div>
      </div>
    </div>
  );
}