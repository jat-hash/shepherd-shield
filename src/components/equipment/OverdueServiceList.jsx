import { AlertTriangle } from "lucide-react";

export default function OverdueServiceList({ entries, onSelect }) {
  return (
    <div className="space-y-2">
      {entries.map(({ item, info }) => (
        <button
          key={item.id}
          onClick={() => onSelect(item)}
          className="w-full text-left flex items-start gap-3 rounded-xl border border-red-500/40 bg-red-500/5 p-3.5 hover:border-red-500/70 transition-all"
        >
          <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-white">{item.name}</h3>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#d4a843]/15 text-[#d4a843]">
                {item.category}
              </span>
              {item.condition && item.condition !== "Good" && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-orange-500/20 text-orange-400">
                  {item.condition}
                </span>
              )}
            </div>
            <p className="text-[11px] text-red-400 font-medium mt-1">
              {info.label}
              {info.due ? ` • due ${info.due}` : ""}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {item.last_inspection_date
                ? `Last checked ${item.last_inspection_date}`
                : "No check on record"}
              {item.assigned_to ? ` • ${item.assigned_to}` : ""} • tap to run checklist
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}