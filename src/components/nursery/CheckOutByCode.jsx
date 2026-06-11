import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { X, LogOut, CheckCircle } from "lucide-react";
import { toast } from "sonner";

export default function CheckOutByCode({ onClose, onCheckedOut }) {
  const [code, setCode] = useState("");
  const [found, setFound] = useState(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);

  const lookupCode = async () => {
    if (!code.trim()) return;
    setChecking(true);
    setFound(null);
    try {
      const results = await base44.entities.NurseryChild.filter({
        check_in_code: code.trim().toUpperCase(),
        checked_in: true,
      });
      if (results.length === 0) {
        toast.error("No active check-in found for that code");
      } else {
        setFound(results[0]);
      }
    } catch {
      toast.error("Failed to look up code");
    } finally {
      setChecking(false);
    }
  };

  const handleCheckOut = async () => {
    if (!found) return;
    setLoading(true);
    try {
      await base44.entities.NurseryChild.update(found.id, {
        checked_in: false,
        check_out_time: new Date().toISOString(),
      });
      toast.success(`${found.child_name} checked out successfully`);
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
      <div className="bg-[#1a2744] rounded-2xl border border-[rgba(212,168,67,0.2)] w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(212,168,67,0.1)]">
          <div className="flex items-center gap-2">
            <LogOut className="w-5 h-5 text-[#d4a843]" />
            <h2 className="text-white font-bold">Check Out by Code</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Enter Parent Code</label>
            <div className="flex gap-2">
              <input
                className="flex-1 bg-[#0a1128] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-[#d4a843]/60 uppercase tracking-widest font-bold text-center"
                value={code}
                onChange={e => { setCode(e.target.value.toUpperCase()); setFound(null); }}
                onKeyDown={e => e.key === "Enter" && lookupCode()}
                placeholder="XXXXX"
                maxLength={5}
              />
              <button
                onClick={lookupCode}
                disabled={checking || !code.trim()}
                className="bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] font-bold px-4 rounded-lg text-sm disabled:opacity-50"
              >
                {checking ? "..." : "Find"}
              </button>
            </div>
          </div>

          {found && (
            <div className="bg-green-900/30 border border-green-500/40 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-green-400">
                <CheckCircle className="w-4 h-4" />
                <span className="text-sm font-bold">Child Found</span>
              </div>
              <p className="text-white font-bold">{found.child_name}</p>
              <p className="text-slate-300 text-xs">Parent: {found.parent_name}</p>
              <p className="text-slate-400 text-xs">Age: {found.age_group}</p>
              {found.allergies_notes && (
                <p className="text-yellow-300 text-xs">⚠ {found.allergies_notes}</p>
              )}
              <button
                onClick={handleCheckOut}
                disabled={loading}
                className="w-full mt-2 bg-red-600 hover:bg-red-500 text-white font-bold py-2.5 rounded-xl transition-colors disabled:opacity-50 text-sm"
              >
                {loading ? "Checking Out..." : `Check Out ${found.child_name}`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}