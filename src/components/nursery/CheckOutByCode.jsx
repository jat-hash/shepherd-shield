import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { X, LogOut, CheckCircle, Baby, ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

// Returns a display label for a child record — child_name is optional, so we
// fall back to the parent's name to keep the list readable.
const childLabel = (c) => c.child_name?.trim() || `Child of ${c.parent_name}`;

export default function CheckOutByCode({ user, onClose, onCheckedOut }) {
  const [children, setChildren] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(null); // child being checked out
  const todayStr = new Date().toISOString().slice(0, 10);
  const selectRef = useRef(null);

  useEffect(() => {
    base44.entities.NurseryChild.filter({ service_date: todayStr, checked_in: true }, "-check_in_time", 200)
      .then(setChildren)
      .catch(() => {});
  }, []);

  // Automatic checkout: selecting a child from the dropdown immediately
  // checks them out — no separate button tap required.
  const handleSelect = async (e) => {
    const id = e.target.value;
    setSelectedId(id);
    if (!id) return;

    const child = children.find(c => c.id === id);
    if (!child) return;

    setProcessing(child);
    setLoading(true);
    try {
      await base44.entities.NurseryChild.update(child.id, {
        checked_in: false,
        check_out_time: new Date().toISOString(),
        checked_out_by: user?.display_name || user?.full_name || user?.email || "Unknown",
      });
      toast.success(`${childLabel(child)} checked out successfully`);
      onCheckedOut?.();
      // Remove from local list so the dropdown stays accurate
      setChildren(prev => prev.filter(c => c.id !== child.id));
      setSelectedId("");
      // Keep focus on the select for rapid consecutive check-outs
      setTimeout(() => selectRef.current?.focus(), 50);
    } catch {
      toast.error("Failed to check out");
      setSelectedId("");
    } finally {
      setLoading(false);
      setProcessing(null);
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
          {children.length === 0 ? (
            <div className="text-center text-slate-400 py-6 text-sm">
              <Baby className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No children checked in
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-400">
                Select a child to instantly check them out — no extra button needed.
              </p>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Checked-In Children ({children.length})</label>
                <div className="relative">
                  <select
                    ref={selectRef}
                    className="w-full bg-[#0a1128] border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#d4a843]/60 appearance-none pr-9 disabled:opacity-50"
                    value={selectedId}
                    onChange={handleSelect}
                    disabled={loading}
                  >
                    <option value="">Choose a child to check out...</option>
                    {children.map(c => (
                      <option key={c.id} value={c.id}>
                        {childLabel(c)} — {c.parent_name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {processing && (
                <div className="bg-green-900/30 border border-green-500/40 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-green-400">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    <span className="text-sm font-bold">{loading ? "Checking out..." : "Checked Out"}</span>
                  </div>
                  <p className="text-white font-bold">{childLabel(processing)}</p>
                  <p className="text-slate-300 text-xs">Parent: {processing.parent_name}{processing.parent_phone ? ` · ${processing.parent_phone}` : ""}</p>
                  {processing.age_group && <p className="text-slate-300 text-xs">{processing.age_group}</p>}
                  {processing.allergies_notes && <p className="text-yellow-300 text-xs">⚠ {processing.allergies_notes}</p>}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}