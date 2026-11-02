import { useState } from "react";
import { CheckCircle2, Circle, Wrench, AlertTriangle } from "lucide-react";
import EquipmentCheckDialog from "@/components/equipment/EquipmentCheckDialog";

const conditionColors = {
  Good: "bg-emerald-500/20 text-emerald-400",
  Fair: "bg-amber-500/20 text-amber-400",
  "Needs Repair": "bg-orange-500/20 text-orange-400",
  "Out of Service": "bg-red-500/20 text-red-400",
};

function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function MonthlyMaintenanceChecklist({ items, loading, onChanged }) {
  const [onlyDue, setOnlyDue] = useState(false);
  const [activeItem, setActiveItem] = useState(null);

  const now = new Date();
  const monthKey = dateKey(now).slice(0, 7);
  const monthLabel = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const equipment = [...items].sort(
    (a, b) =>
      (a.category || "").localeCompare(b.category || "") ||
      (a.name || "").localeCompare(b.name || "")
  );

  const isDone = (item) =>
    !!item.last_inspection_date && String(item.last_inspection_date).slice(0, 7) === monthKey;

  const doneCount = equipment.filter(isDone).length;
  const percent = equipment.length ? Math.round((doneCount / equipment.length) * 100) : 0;
  const issueCount = equipment.filter(i => isDone(i) && (i.last_check_missed?.length || 0) > 0).length;
  const shown = onlyDue ? equipment.filter(i => !isDone(i)) : equipment;

  return (
    <div className="space-y-4">
      <div className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.15)] p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">{monthLabel}</p>
            <p className="text-lg font-bold text-white mt-0.5">
              {doneCount} of {equipment.length} checked
            </p>
            {issueCount > 0 && (
              <p className="flex items-center gap-1 text-[11px] text-amber-400 mt-1">
                <AlertTriangle className="w-3 h-3" />
                {issueCount} item{issueCount > 1 ? "s" : ""} need attention
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-[#d4a843]">{percent}%</p>
          </div>
        </div>
        <div className="mt-3 h-2 rounded-full bg-[#0a1128] overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${percent === 100 ? "bg-emerald-500" : "bg-[#d4a843]"}`}
            style={{ width: `${percent}%` }}
          />
        </div>
        <button
          onClick={() => setOnlyDue(!onlyDue)}
          className={`mt-3 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all ${
            onlyDue ? "bg-[#d4a843] text-[#0a1128]" : "bg-[#0a1128] text-slate-400"
          }`}
        >
          Show only not done
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-[#d4a843] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : shown.length === 0 ? (
        <div className="text-center py-12">
          <Wrench className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">
            {equipment.length === 0
              ? "No equipment added yet"
              : "All equipment checked this month"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map(item => {
            const done = isDone(item);
            const issues = done ? item.last_check_missed?.length || 0 : 0;
            return (
              <button
                key={item.id}
                onClick={() => setActiveItem(item)}
                className={`w-full text-left flex items-start gap-3 rounded-xl border p-3.5 transition-all ${
                  done
                    ? "bg-emerald-500/5 border-emerald-500/30"
                    : "bg-[#1a2744] border-[rgba(212,168,67,0.1)] hover:border-[#d4a843]/30"
                }`}
              >
                <span className="mt-0.5 shrink-0">
                  {done ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <Circle className="w-5 h-5 text-slate-500" />
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className={`text-sm font-bold ${done ? "text-slate-300" : "text-white"}`}>
                      {item.name}
                    </h3>
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#d4a843]/15 text-[#d4a843]">
                      {item.category}
                    </span>
                    {item.condition && (
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${conditionColors[item.condition] || "bg-slate-500/20 text-slate-300"}`}>
                        {item.condition}
                      </span>
                    )}
                    {issues > 0 && (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-400">
                        <AlertTriangle className="w-2.5 h-2.5" />
                        {issues} issue{issues > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {done ? `Checked ${item.last_inspection_date}` : "Not checked this month — tap to run the checklist"}
                    {item.assigned_to && ` • ${item.assigned_to}`}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <EquipmentCheckDialog
        item={activeItem}
        open={!!activeItem}
        onClose={() => setActiveItem(null)}
        onChecked={onChanged}
      />
    </div>
  );
}