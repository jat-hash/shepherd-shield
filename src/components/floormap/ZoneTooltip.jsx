import { X, Package, CheckCircle, AlertCircle } from "lucide-react";

export default function ZoneTooltip({ zone, equipment, position, onClose }) {
  if (!zone || !equipment) return null;

  const available = equipment.filter(e => !e.checked_out);
  const checkedOut = equipment.filter(e => e.checked_out);

  return (
    <div
      className="absolute z-50 bg-[#0a1128] border border-[#d4a843]/40 rounded-xl shadow-2xl p-4 w-64 pointer-events-auto"
      style={{ left: `${position.x}px`, top: `${position.y}px`, transform: "translate(-50%, -110%)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[#d4a843] font-bold text-sm">{zone.label}</h3>
        <button onClick={onClose} className="text-slate-500 hover:text-white">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {equipment.length === 0 ? (
        <p className="text-slate-500 text-xs">No equipment assigned to this zone.</p>
      ) : (
        <div className="space-y-1.5">
          <div className="flex gap-3 text-xs mb-2">
            <span className="flex items-center gap-1 text-emerald-400">
              <CheckCircle className="w-3 h-3" /> {available.length} available
            </span>
            <span className="flex items-center gap-1 text-orange-400">
              <AlertCircle className="w-3 h-3" /> {checkedOut.length} out
            </span>
          </div>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {equipment.map(item => (
              <div key={item.id} className="flex items-center justify-between bg-[#141f3d] rounded-lg px-2.5 py-1.5">
                <div className="flex items-center gap-2">
                  <Package className="w-3 h-3 text-slate-400" />
                  <span className="text-white text-xs">{item.name}</span>
                </div>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                  item.checked_out
                    ? "bg-orange-500/20 text-orange-400"
                    : "bg-emerald-500/20 text-emerald-400"
                }`}>
                  {item.checked_out ? "Out" : "In"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}