/**
 * EmergencyOverrideFlash
 * 
 * A non-dismissible, persistent full-screen flash overlay that fires when:
 *   1. There is an active EmergencyAlert
 *   2. The current user has emergency_override enabled in their profile
 * 
 * Only a team leader (admin) can acknowledge the alert to clear it for everyone.
 * Regular users see the flash but cannot stop it — only the acknowledgment by an admin clears it.
 */
import { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { ShieldAlert, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const BG_ON  = "rgba(220,10,10,0.88)";
const BG_OFF = "rgba(10,0,0,0.92)";

export default function EmergencyOverrideFlash({ alert }) {
  const { user } = useAuth();
  const [flash, setFlash] = useState(false);
  const [ackCount, setAckCount] = useState(0);
  const [acknowledging, setAcknowledging] = useState(false);
  const [alreadyAcked, setAlreadyAcked] = useState(false);
  const intervalRef = useRef(null);
  const vibRef = useRef(null);

  // Poll acknowledgment count so users can see progress
  useEffect(() => {
    if (!alert?.id) return;
    const load = async () => {
      try {
        const acks = await base44.entities.SafetyCheckIn.filter({ alert_id: alert.id, status: "safe" });
        setAckCount(acks.length);
        // Check if current user already acked
        if (user?.email && acks.some(a => a.user_email === user.email)) {
          setAlreadyAcked(true);
        }
      } catch (_) {}
    };
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [alert?.id, user?.email]);

  // Flash + vibrate loop
  useEffect(() => {
    if (!alert) return;

    intervalRef.current = setInterval(() => setFlash(f => !f), 350);

    if (navigator.vibrate) {
      const pat = [400, 150, 400, 150, 800];
      const dur = pat.reduce((a, b) => a + b, 0) + 200;
      navigator.vibrate(pat);
      vibRef.current = setInterval(() => navigator.vibrate(pat), dur);
    }

    return () => {
      clearInterval(intervalRef.current);
      clearInterval(vibRef.current);
      if (navigator.vibrate) navigator.vibrate(0);
      setFlash(false);
    };
  }, [alert?.id]);

  const handleAcknowledge = async () => {
    if (!user || acknowledging) return;
    setAcknowledging(true);
    try {
      // Create safety check-in record
      await base44.entities.SafetyCheckIn.create({
        alert_id: alert.id,
        user_email: user.email,
        user_name: user.full_name || user.email,
        status: "safe"
      });

      // If admin, also resolve the alert entirely
      if (user.role === "admin") {
        await base44.entities.EmergencyAlert.update(alert.id, { is_active: false });
        toast.success("Emergency alert resolved and cleared for all users.");
      } else {
        setAlreadyAcked(true);
        toast.success("You've acknowledged the alert. Waiting for a team leader to clear it.");
      }
    } catch (e) {
      toast.error("Failed to acknowledge — try again.");
    } finally {
      setAcknowledging(false);
    }
  };

  if (!alert) return null;

  const isAdmin = user?.role === "admin";

  return (
    <div
      className="fixed inset-0 z-[99999] flex flex-col items-center justify-center select-none"
      style={{ background: flash ? BG_ON : BG_OFF, transition: "background 0.08s" }}
    >
      {/* Strobing border ring */}
      <div
        className="absolute inset-4 rounded-3xl pointer-events-none border-4"
        style={{ borderColor: flash ? "rgba(255,255,255,0.9)" : "rgba(220,10,10,0.4)", transition: "border-color 0.08s" }}
      />

      <div className="relative z-10 max-w-sm w-full mx-5 space-y-4">
        {/* Icon + Title */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white mb-3 animate-bounce shadow-2xl">
            <ShieldAlert className="w-12 h-12 text-red-600" />
          </div>
          <h1 className="text-3xl font-black text-white uppercase tracking-widest drop-shadow-lg">
            🚨 EMERGENCY
          </h1>
          <p className="text-red-200 text-sm font-bold uppercase tracking-wider mt-1">
            {alert.alert_type}
          </p>
        </div>

        {/* Alert card */}
        <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-4 text-center">
          <p className="text-white text-base font-semibold leading-snug">{alert.message}</p>
          {alert.triggered_by && (
            <p className="text-red-300 text-xs mt-2">Triggered by: {alert.triggered_by}</p>
          )}
        </div>

        {/* Acknowledgment count */}
        <div className="flex items-center justify-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-green-400" />
          <span className="text-green-300 text-sm font-semibold">
            {ackCount} team member{ackCount !== 1 ? "s" : ""} acknowledged
          </span>
        </div>

        {/* Acknowledge button */}
        {alreadyAcked ? (
          <div className="w-full bg-green-700/40 border border-green-500/50 rounded-2xl py-5 text-center">
            <p className="text-green-300 font-bold text-lg">✅ You acknowledged</p>
            <p className="text-green-400/70 text-xs mt-1">
              {isAdmin ? "Resolving alert..." : "Waiting for team leader to clear"}
            </p>
          </div>
        ) : (
          <button
            onClick={handleAcknowledge}
            disabled={acknowledging}
            className="w-full bg-white text-red-700 font-black text-xl py-5 rounded-2xl shadow-2xl active:scale-95 transition-transform disabled:opacity-60"
          >
            {acknowledging
              ? "⏳ Acknowledging..."
              : isAdmin
              ? "✅ ACKNOWLEDGE & CLEAR ALL"
              : "✅ ACKNOWLEDGE ALERT"}
          </button>
        )}

        {/* Leader-only note */}
        {!isAdmin && (
          <p className="text-center text-red-300/70 text-xs leading-relaxed">
            🔴 This alert is active until a team leader clears it.{"\n"}
            You must acknowledge to confirm your safety.
          </p>
        )}
        {isAdmin && !alreadyAcked && (
          <p className="text-center text-yellow-300/80 text-xs">
            ⚡ As a team leader, acknowledging will stop the alert for everyone.
          </p>
        )}
      </div>
    </div>
  );
}