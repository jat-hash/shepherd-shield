import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { X, LogOut, CheckCircle, Search, Baby } from "lucide-react";
import { toast } from "sonner";

export default function CheckOutByCode({ onClose, onCheckedOut }) {
  const [children, setChildren] = useState([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);

  const todayStr = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    base44.entities.NurseryChild.filter({ service_date: todayStr, checked_in: true }, "-check_in_time", 200)
      .then(setChildren)
      .catch(() => {});
  }, []);

  const filtered = children.filter(c => {
    const q = search.toLowerCase();
    return !q || c.child_name?.toLowerCase().includes(q) || c.parent_name?.toLowerCase().includes(q);
  });

  const handleCheckOut = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      await base44.entities.NurseryChild.update(selected.id, {
        checked_in: false,
        check_out_time: new Date().toISOString(),
      });
      toast.success(`${selected.child_name} checked out successfully`);
      onCheckedOut?.();
      onClose();
    } catch {
      toast.error("Failed to check out");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-[#1a2744] rounded-2xl border border-[rgba(212,168,67,0.2)] w-full max-w-sm shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(212,168,67,0.1)] sticky top-0 bg-[#1a2744] z-10">
          <div className="flex items-center gap-2">
            <LogOut className="w-5 h-5 text-[#d4a843]" />
            <h2 className="text-white font-bold">Check Out Child</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              className="w-full bg-[#0a1128] border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-white text-sm outline-none focus:border-[#d4a843]/60 placeholder-slate-500"
              value={search}
              onChange={e => { setSearch(e.target.value); setSelected(null); }}
              placeholder="Search child or parent..."
              autoFocus
            />
          </div>

          {children.length === 0 ? (
            <div className="text-center text-slate-400 py-6 text-sm">
              <Baby className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No children checked in
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {filtered.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelected(c)}
                  className={`w-full text-left rounded-xl px-4 py-3 border transition-colors ${
                    selected?.id === c.id
                      ? "bg-green-900/30 border-green-500/50"
                      : "bg-[#0a1128] border-slate-700 hover:border-[#d4a843]/40"
                  }`}
                >
                  <p className="text-white font-bold text-sm">{c.child_name}</p>
                  <p className="text-slate-400 text-xs">Parent: {c.parent_name}{c.parent_phone ? ` · ${c.parent_phone}` : ""}</p>
                  {c.allergies_notes && <p className="text-yellow-300 text-xs mt-0.5">⚠ {c.allergies_notes}</p>}
                </button>
              ))}
              {filtered.length === 0 && <p className="text-slate-500 text-sm text-center py-4">No matches found</p>}
            </div>
          )}

          {selected && (
            <div className="bg-green-900/30 border border-green-500/40 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-green-400">
                <CheckCircle className="w-4 h-4" />
                <span className="text-sm font-bold">Selected</span>
              </div>
              <p className="text-white font-bold">{selected.child_name}</p>
              <p className="text-slate-300 text-xs">Parent: {selected.parent_name}</p>
              <button
                onClick={handleCheckOut}
                disabled={loading}
                className="w-full mt-2 bg-red-600 hover:bg-red-500 text-white font-bold py-2.5 rounded-xl transition-colors disabled:opacity-50 text-sm"
              >
                {loading ? "Checking Out..." : `Check Out ${selected.child_name}`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}