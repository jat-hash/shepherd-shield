import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ClipboardList, Baby, LogOut, AlertTriangle, Users } from "lucide-react";

export default function DailySummary() {
  const [allToday, setAllToday] = useState([]);
  const todayStr = new Date().toISOString().slice(0, 10);

  const load = () => {
    base44.entities.NurseryChild.filter({ service_date: todayStr }, "-check_in_time", 200)
      .then(setAllToday)
      .catch(() => {});
  };

  useEffect(() => {
    load();
    const unsub = base44.entities.NurseryChild.subscribe(() => load());
    return unsub;
  }, []);

  const totalCheckIns = allToday.length;
  const active = allToday.filter(c => c.checked_in);
  const checkedOut = allToday.filter(c => !c.checked_in);
  const withAllergies = active.filter(c => c.allergies_notes);

  return (
    <div className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.15)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[rgba(212,168,67,0.1)]">
        <ClipboardList className="w-4 h-4 text-[#d4a843]" />
        <p className="text-xs uppercase tracking-widest text-[#d4a843] font-semibold">Daily Summary</p>
        <span className="ml-auto text-xs text-slate-500">
          {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
        </span>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 divide-x divide-[rgba(212,168,67,0.08)] border-b border-[rgba(212,168,67,0.08)]">
        <div className="px-4 py-3 text-center">
          <p className="text-xl font-bold text-[#d4a843]">{totalCheckIns}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Total Check-ins</p>
        </div>
        <div className="px-4 py-3 text-center">
          <p className="text-xl font-bold text-green-400">{active.length}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Currently In</p>
        </div>
        <div className="px-4 py-3 text-center">
          <p className="text-xl font-bold text-slate-400">{checkedOut.length}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Checked Out</p>
        </div>
      </div>

      {/* Active Children List */}
      {active.length > 0 ? (
        <div className="divide-y divide-[rgba(212,168,67,0.05)]">
          {active.map(child => (
            <div key={child.id} className="flex items-center justify-between px-4 py-2.5 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Baby className="w-3.5 h-3.5 text-[#d4a843] shrink-0" />
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium truncate">{child.child_name}</p>
                  <p className="text-slate-400 text-xs truncate">{child.parent_name} · {child.age_group}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {child.allergies_notes && (
                  <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" title={child.allergies_notes} />
                )}
                <span className="text-xs text-slate-500 font-mono">
                  {child.check_in_time
                    ? new Date(child.check_in_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                    : "—"}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-4 py-6 text-center text-slate-500 text-sm">
          <Users className="w-6 h-6 mx-auto mb-1.5 opacity-30" />
          {totalCheckIns > 0 ? "All children have been checked out" : "No check-ins yet today"}
        </div>
      )}
    </div>
  );
}