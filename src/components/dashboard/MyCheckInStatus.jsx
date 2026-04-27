import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { CheckCircle, XCircle, Clock } from "lucide-react";

export default function MyCheckInStatus({ user }) {
  const [status, setStatus] = useState(null); // null = loading, "in" | "out" | "none"
  const [checkInTime, setCheckInTime] = useState(null);
  const [checkOutTime, setCheckOutTime] = useState(null);

  useEffect(() => {
    if (!user?.email) return;

    const load = async () => {
      const todayLocal = new Date();
      const today = `${todayLocal.getFullYear()}-${String(todayLocal.getMonth() + 1).padStart(2, '0')}-${String(todayLocal.getDate()).padStart(2, '0')}`;

      const records = await base44.entities.PersonalCheckIn.filter(
        { user_email: user.email, check_in_date: today },
        "-check_in_time",
        10
      ).catch(() => []);

      if (!records || records.length === 0) {
        setStatus("none");
        return;
      }

      // Prefer open (no checkout) record, else most recent
      const open = records.find(r => !r.check_out_time);
      const latest = open || records[0];

      if (open) {
        setStatus("in");
        setCheckInTime(open.check_in_time);
        setCheckOutTime(null);
      } else {
        setStatus("out");
        setCheckInTime(latest.check_in_time);
        setCheckOutTime(latest.check_out_time);
      }
    };

    load();

    const unsub = base44.entities.PersonalCheckIn.subscribe(() => load());
    return unsub;
  }, [user?.email]);

  if (!status || status === "none") return null;

  const fmt = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    return isNaN(d) ? iso : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };

  return (
    <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${
      status === "in"
        ? "bg-emerald-900/20 border-emerald-500/30"
        : "bg-blue-900/20 border-blue-500/30"
    }`}>
      {status === "in" ? (
        <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
      ) : (
        <XCircle className="w-5 h-5 text-blue-400 shrink-0" />
      )}
      <div className="flex-1">
        <p className={`text-sm font-semibold ${status === "in" ? "text-emerald-300" : "text-blue-300"}`}>
          {status === "in" ? "You're checked in" : "You've checked out"}
        </p>
        <p className="text-xs text-slate-400 mt-0.5">
          {status === "in"
            ? `Since ${fmt(checkInTime)}`
            : `In: ${fmt(checkInTime)}  ·  Out: ${fmt(checkOutTime)}`}
        </p>
      </div>
      {status === "in" && (
        <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-900/40 px-2 py-1 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
          ACTIVE
        </span>
      )}
    </div>
  );
}