import { useState } from "react";
import { CheckCircle2, Wrench, AlertTriangle, History } from "lucide-react";

export default function MaintenanceLogList({ logs, loading }) {
  const [filter, setFilter] = useState("all");

  const names = Array.from(
    new Map(logs.map(l => [l.equipment_id || l.equipment_name, l.equipment_name])).entries()
  ).sort((a, b) => String(a[1]).localeCompare(String(b[1])));

  const shown = filter === "all" ? logs : logs.filter(l => (l.equipment_id || l.equipment_name) === filter);

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <div className="w-6 h-6 border-2 border-[#d4a843] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="text-center py-10">
        <History className="w-10 h-10 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-500 text-sm">Nothing logged yet</p>
        <p className="text-slate-600 text-[11px] mt-1">Checks and services you record will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {names.length > 1 && (
        <select
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="w-full bg-[#0a1128] border border-slate-700 rounded-lg text-xs text-white px-3 py-2"
        >
          <option value="all">All equipment ({logs.length})</option>
          {names.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
      )}

      {shown.map(log => {
        const serviced = log.action === "Serviced";
        const missed = log.tasks_missed?.length || 0;
        const done = log.tasks_completed?.length || 0;
        return (
          <div key={log.id} className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-3.5">
            <div className="flex items-start gap-3">
              {serviced ? (
                <Wrench className="w-4 h-4 text-[#d4a843] mt-0.5 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-white">{log.equipment_name}</h3>
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                      serviced
                        ? "bg-[#d4a843]/20 text-[#d4a843]"
                        : "bg-emerald-500/20 text-emerald-400"
                    }`}
                  >
                    {log.action}
                  </span>
                  {missed > 0 && (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-400">
                      <AlertTriangle className="w-2.5 h-2.5" />
                      {missed} issue{missed > 1 ? "s" : ""}
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-slate-400 mt-1">
                  {log.performed_at ? new Date(log.performed_at).toLocaleString() : ""}
                  {log.performed_by ? ` • ${log.performed_by}` : ""}
                  {done > 0 ? ` • ${done} task${done > 1 ? "s" : ""} done` : ""}
                </p>

                {missed > 0 && (
                  <p className="text-[11px] text-amber-400/90 mt-1">
                    Needs attention: {log.tasks_missed.join(", ")}
                  </p>
                )}

                {log.notes && (
                  <p className="text-[11px] text-slate-300 mt-1.5 bg-[#0a1128] rounded p-2 border border-slate-700">
                    {log.notes}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}