import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { CheckCircle2, AlertCircle, Shield } from "lucide-react";

export default function SafetyCheckInPanel() {
  const [activeAlert, setActiveAlert] = useState(null);
  const [user, setUser] = useState(null);
  const [myCheckIn, setMyCheckIn] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const u = await base44.auth.me().catch(() => null);
        if (!u || !mounted) return;
        
        setUser(u);
        
        const alerts = await base44.entities.EmergencyAlert.filter({ is_active: true });
        if (!mounted) return;
        
        if (alerts.length > 0) {
          setActiveAlert(alerts[0]);
          const existing = await base44.entities.SafetyCheckIn.filter({
            alert_id: alerts[0].id,
            user_email: u.email
          });
          if (mounted && existing.length > 0) {
            setMyCheckIn(existing[0]);
          }
        } else {
          setActiveAlert(null);
        }
      } catch (error) {
        console.error('Failed to load safety check-in:', error);
      }
    };

    load();

    const unsub = base44.entities.EmergencyAlert.subscribe((event) => {
      if (!mounted) return;
      
      if (event.type === "create" && event.data?.is_active) {
        setActiveAlert(event.data);
        setMyCheckIn(null);
      } else if (event.type === "update") {
        if (!event.data?.is_active) {
          setActiveAlert(null);
          setMyCheckIn(null);
        } else {
          setActiveAlert(event.data);
        }
      } else if (event.type === "delete") {
        setActiveAlert(null);
        setMyCheckIn(null);
      }
    });

    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  if (!activeAlert || !user) return null;

  const checkIn = async (status) => {
    setSubmitting(true);
    try {
      let latitude = null, longitude = null;
      
      try {
        const pos = await new Promise((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 })
        );
        latitude = pos.coords.latitude;
        longitude = pos.coords.longitude;
      } catch (e) {
        // Geolocation failed, continue without location
      }

      if (myCheckIn) {
        await base44.entities.SafetyCheckIn.update(myCheckIn.id, { status, latitude, longitude });
        setMyCheckIn({ ...myCheckIn, status });
      } else {
        const newCI = await base44.entities.SafetyCheckIn.create({
          alert_id: activeAlert.id,
          user_email: user.email,
          user_name: user.full_name || user.email,
          status,
          latitude,
          longitude
        });
        setMyCheckIn(newCI);
      }
    } catch (error) {
      console.error('Failed to check in:', error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-[#1a2744] rounded-xl border border-red-500/40 p-4 space-y-3 animate-pulse-once">
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4 text-red-400" />
        <h3 className="text-white font-bold text-sm">Safety Check-In</h3>
        <span className="bg-red-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">ACTIVE ALERT</span>
      </div>
      <p className="text-slate-300 text-xs">
        <span className="text-red-400 font-semibold uppercase">{activeAlert.alert_type}</span>
        {" — "}{activeAlert.message}
      </p>

      {myCheckIn ? (
        <div className={`flex items-center gap-3 p-3 rounded-lg ${
          myCheckIn.status === "safe"
            ? "bg-emerald-500/10 border border-emerald-500/20"
            : "bg-red-500/10 border border-red-500/20"
        }`}>
          {myCheckIn.status === "safe"
            ? <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            : <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          }
          <div>
            <p className={`text-sm font-semibold ${myCheckIn.status === "safe" ? "text-emerald-400" : "text-red-400"}`}>
              {myCheckIn.status === "safe" ? "You marked yourself safe" : "Help has been requested for you"}
            </p>
            <button onClick={() => setMyCheckIn(null)} className="text-slate-500 text-[10px] underline hover:text-slate-400">
              Update status
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => checkIn("safe")}
            disabled={submitting}
            className="flex items-center justify-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 text-emerald-400 font-semibold text-sm transition-all disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            I Am Safe
          </button>
          <button
            onClick={() => checkIn("need_help")}
            disabled={submitting}
            className="flex items-center justify-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 text-red-400 font-semibold text-sm transition-all disabled:opacity-50"
          >
            <AlertCircle className="w-4 h-4" />
            Need Help
          </button>
        </div>
      )}
    </div>
  );
}