import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { AlertTriangle, ClipboardCheck } from "lucide-react";
import { overdueInfo } from "@/lib/equipmentMaintenance";
import OverdueServiceList from "@/components/equipment/OverdueServiceList";
import MaintenanceLogList from "@/components/equipment/MaintenanceLogList";
import EquipmentCheckDialog from "@/components/equipment/EquipmentCheckDialog";

export default function EquipmentMaintenanceLog({ items = [], loading, onChanged }) {
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [activeItem, setActiveItem] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setLogsLoading(true);

    const load = () =>
      base44.entities.EquipmentServiceLog.list("-created_date", 200)
        .then(data => { if (alive) setLogs(data || []); })
        .catch(() => {})
        .finally(() => { if (alive) setLogsLoading(false); });

    load();
    const unsub = base44.entities.EquipmentServiceLog.subscribe(() => load());
    return () => { alive = false; unsub(); };
  }, [refreshKey]);

  const overdue = items
    .map(item => ({ item, info: overdueInfo(item) }))
    .filter(entry => entry.info)
    .sort((a, b) => (b.info.days ?? 99999) - (a.info.days ?? 99999));

  return (
    <div className="space-y-4">
      <div
        className={`rounded-xl border p-4 ${
          overdue.length
            ? "bg-red-500/5 border-red-500/30"
            : "bg-[#1a2744] border-[rgba(212,168,67,0.15)]"
        }`}
      >
        <p className="text-xs uppercase tracking-wide text-slate-400">Maintenance Overview</p>
        <p className={`text-lg font-bold mt-0.5 ${overdue.length ? "text-red-400" : "text-emerald-400"}`}>
          {overdue.length
            ? `${overdue.length} item${overdue.length > 1 ? "s" : ""} overdue for service`
            : "All maintenance up to date"}
        </p>
        <p className="text-[11px] text-slate-500 mt-1">
          {items.length} item{items.length === 1 ? "" : "s"} tracked • {logs.length} logged check
          {logs.length === 1 ? "" : "s"} and service{logs.length === 1 ? "" : "s"}
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-2 border-[#d4a843] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        overdue.length > 0 && (
          <div>
            <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-red-400 mb-2">
              <AlertTriangle className="w-3.5 h-3.5" />
              Overdue
            </h2>
            <OverdueServiceList entries={overdue} onSelect={setActiveItem} />
          </div>
        )
      )}

      <div>
        <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">
          <ClipboardCheck className="w-3.5 h-3.5" />
          Check &amp; Service History
        </h2>
        <MaintenanceLogList logs={logs} loading={logsLoading} />
      </div>

      <EquipmentCheckDialog
        item={activeItem}
        open={!!activeItem}
        onClose={() => setActiveItem(null)}
        onChecked={() => { onChanged?.(); setRefreshKey(k => k + 1); }}
      />
    </div>
  );
}