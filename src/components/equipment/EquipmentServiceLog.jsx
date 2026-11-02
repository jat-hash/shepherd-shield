import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { History, CheckCircle2, Wrench, AlertTriangle } from "lucide-react";

export default function EquipmentServiceLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    const load = () =>
      base44.entities.EquipmentServiceLog.list("-created_date", 100)
        .then(data => { if (alive) setLogs(data || []); })
        .catch(() => {})
        .finally(() => { if (alive) setLoading(false); });

    load();
    const unsub = base44.entities.EquipmentServiceLog.subscribe(() => load());
    return () => { alive = false; unsub(); };
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-[#d4a843] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="text-center py-12">
        <History className="w-10 h-10 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-500 text-sm">No checks or services logged yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {logs.map(log => {
        const serviced = log.action === "Serviced";
        const missed = log.tasks_missed?.length || 0;
        const done = log.tasks_completed?.length || 0;
        return (
          <div
            key={log.id}
            className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-3.5"
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 shrink-0">
                {serviced ? (
                  <Wrench className="w-4 h-4 text-[#d4a843]" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                )}
              </span>
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
                  {log.category && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-500/20 text-slate-300">
                      {log.category}
                    </span>
                  )}
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