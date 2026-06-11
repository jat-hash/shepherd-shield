import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Users, Circle } from "lucide-react";

export default function NurseryStaffStatus() {
  const [onDuty, setOnDuty] = useState([]);
  const todayStr = new Date().toISOString().slice(0, 10);

  const load = () => {
    base44.entities.PersonalCheckIn.filter(
      { check_in_date: todayStr },
      "-check_in_time",
      50
    ).then(records => {
      // Only show staff who are checked in but NOT checked out
      setOnDuty(records.filter(r => !r.check_out_time));
    }).catch(() => {});
  };

  useEffect(() => {
    load();
    const unsub = base44.entities.PersonalCheckIn.subscribe(() => load());
    return unsub;
  }, []);

  if (onDuty.length === 0) return null;

  return (
    <div className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <Users className="w-3.5 h-3.5 text-[#d4a843]" />
        <p className="text-[10px] uppercase tracking-widest text-[#d4a843] font-semibold">Staff On Duty ({onDuty.length})</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {onDuty.map(s => (
          <div key={s.id} className="flex items-center gap-1.5 bg-green-900/30 border border-green-500/25 rounded-full px-2.5 py-1">
            <Circle className="w-2 h-2 text-green-400 fill-green-400" />
            <span className="text-xs text-white font-medium">{s.user_name}</span>
            <span className="text-[10px] text-slate-400">
              {new Date(s.check_in_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}