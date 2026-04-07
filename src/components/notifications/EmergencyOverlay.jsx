import React, { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

function playEmergencyAlarm(ctxRef, intervalRef) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    ctxRef.current = ctx;

    const playBurst = () => {
      try {
        for (let i = 0; i < 4; i++) {
          const offset = i * 0.25;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = "square";
          osc.frequency.setValueAtTime(i % 2 === 0 ? 880 : 440, ctx.currentTime + offset);
          gain.gain.setValueAtTime(0.5, ctx.currentTime + offset);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.22);
          osc.start(ctx.currentTime + offset);
          osc.stop(ctx.currentTime + offset + 0.22);
        }
      } catch (_) {}
    };

    playBurst();
    intervalRef.current = setInterval(playBurst, 1800);
  } catch (_) {}
}

export default function EmergencyOverlay({ alert, onDismiss }) {
  const audioCtxRef = useRef(null);
  const alarmIntervalRef = useRef(null);
  const vibrateIntervalRef = useRef(null);

  useEffect(() => {
    if (alert) {
      playEmergencyAlarm(audioCtxRef, alarmIntervalRef);

      if ('vibrate' in navigator) {
        navigator.vibrate([400, 150, 400, 150, 400]);
        vibrateIntervalRef.current = setInterval(() => {
          navigator.vibrate([400, 150, 400, 150, 400]);
        }, 2000);
      }
    }

    return () => {
      if (alarmIntervalRef.current) clearInterval(alarmIntervalRef.current);
      if (vibrateIntervalRef.current) clearInterval(vibrateIntervalRef.current);
      if (audioCtxRef.current) audioCtxRef.current.close().catch(() => {});
      if (navigator.vibrate) navigator.vibrate(0);
    };
  }, [alert]);

  const handleAcknowledge = () => {
    if (alarmIntervalRef.current) clearInterval(alarmIntervalRef.current);
    if (vibrateIntervalRef.current) clearInterval(vibrateIntervalRef.current);
    if (audioCtxRef.current) audioCtxRef.current.close().catch(() => {});
    if (navigator.vibrate) navigator.vibrate(0);
    onDismiss();
  };

  if (!alert) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center p-4 animate-pulse">

      <div className="max-w-2xl w-full bg-red-600 rounded-2xl border-4 border-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-red-700 p-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center animate-bounce">
              <AlertTriangle className="w-10 h-10 text-red-600" />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-white uppercase tracking-wider">
                🚨 EMERGENCY ALERT
              </h2>
              <p className="text-red-200 text-sm mt-1">Immediate Action Required</p>
            </div>
          </div>
  
        </div>

        {/* Content */}
        <div className="p-8 space-y-6">
          <div className="bg-white rounded-xl p-6">
            <h3 className="text-2xl font-bold text-red-600 mb-2">
              {alert.alert_type}
            </h3>
            <p className="text-gray-800 text-lg leading-relaxed">
              {alert.message}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-red-700 rounded-lg p-4">
              <p className="text-red-200 text-xs uppercase tracking-wider mb-1">Triggered By</p>
              <p className="text-white font-semibold">{alert.triggered_by || "System"}</p>
            </div>
            <div className="bg-red-700 rounded-lg p-4">
              <p className="text-red-200 text-xs uppercase tracking-wider mb-1">Time</p>
              <p className="text-white font-semibold">
                {new Date(alert.created_date).toLocaleTimeString()}
              </p>
            </div>
          </div>

          {/* Action Button - MUST acknowledge to stop alarm */}
          <Button
            onClick={handleAcknowledge}
            className="w-full bg-white text-red-600 hover:bg-red-50 font-bold text-lg py-6 rounded-xl animate-pulse"
          >
            ✅ TAP TO ACKNOWLEDGE &amp; STOP ALARM
          </Button>
          <p className="text-center text-red-200 text-xs">You must acknowledge this alert to stop the alarm</p>
        </div>
      </div>
    </div>
  );
}