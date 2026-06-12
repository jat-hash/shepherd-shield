import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { X, Baby, RefreshCw, Copy, CheckCircle2, Phone, Search, ChevronDown } from "lucide-react";
import { toast } from "sonner";

function generateCode() {
  // 6-char alphanumeric code, easy to read (no 0/O, 1/I confusion)
  const chars = "ACDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function generatePIN() {
  // 4-digit numeric PIN (1000–9999, never starts with 0)
  return String(Math.floor(1000 + Math.random() * 9000));
}

export default function ChildCheckInForm({ user, onClose, onCheckedIn }) {
  const [form, setForm] = useState({
    child_name: "",
    parent_name: "",
    parent_phone: "",
    age_group: "Toddler (1-2y)",
    allergies_notes: "",
  });
  const [code, setCode] = useState(() => generateCode());
  const [pin, setPin] = useState(() => generatePIN());
  const [loading, setLoading] = useState(false);
  const [checkedInChild, setCheckedInChild] = useState(null);
  const [pastChildren, setPastChildren] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [search, setSearch] = useState("");

  const todayStr = new Date().toISOString().slice(0, 10);

  // Load previously registered children (deduplicated by child_name+parent_name)
  useEffect(() => {
    base44.entities.NurseryChild.list("-created_date", 200).then(records => {
      const seen = new Set();
      const unique = [];
      for (const r of records) {
        const key = `${r.child_name}|${r.parent_name}`;
        if (!seen.has(key)) {
          seen.add(key);
          unique.push(r);
        }
      }
      setPastChildren(unique);
    }).catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.child_name || !form.parent_name) {
      toast.error("Child name and parent name are required");
      return;
    }
    setLoading(true);
    try {
      const child = await base44.entities.NurseryChild.create({
        ...form,
        check_in_code: code,
        pin_code: pin,
        checked_in: true,
        check_in_time: new Date().toISOString(),
        checked_in_by: user?.display_name || user?.full_name || user?.email,
        service_date: todayStr,
      });
      setCheckedInChild(child);
      onCheckedIn?.(child);
    } catch {
      toast.error("Failed to check in child");
    } finally {
      setLoading(false);
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(code).then(() => toast.success("Code copied!")).catch(() => {});
  };

  // ── Confirmation Screen ──────────────────────────────────────────
  if (checkedInChild) {
    return (
      <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
        <div className="bg-[#1a2744] rounded-2xl border border-green-500/30 w-full max-w-sm shadow-2xl text-center">
          <div className="px-6 pt-6 pb-2">
            <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
            <h2 className="text-white font-bold text-lg">Checked In!</h2>
            <p className="text-slate-400 text-sm mt-1">{checkedInChild.child_name} is now in the nursery</p>
          </div>

          {/* Security Code + PIN */}
          <div className="mx-6 my-4 space-y-3">
            <div className="bg-[#0a1128] rounded-xl border-2 border-[#d4a843] p-4">
              <p className="text-slate-400 text-xs uppercase tracking-widest mb-1">Security Code</p>
              <p className="text-[#d4a843] font-mono font-black text-3xl tracking-[0.3em]">{checkedInChild.check_in_code}</p>
              <p className="text-slate-500 text-xs mt-1">Give this code to the parent</p>
              <button
                onClick={copyCode}
                className="mt-2 flex items-center gap-1.5 text-xs text-[#d4a843] hover:text-[#e0bb5e] mx-auto transition-colors"
              >
                <Copy className="w-3.5 h-3.5" /> Copy code
              </button>
            </div>
            <div className="bg-[#0a1128] rounded-xl border-2 border-blue-500/50 p-4">
              <p className="text-slate-400 text-xs uppercase tracking-widest mb-1">4-Digit Verification PIN</p>
              <p className="text-blue-300 font-mono font-black text-3xl tracking-[0.3em]">{checkedInChild.pin_code}</p>
              <p className="text-slate-500 text-xs mt-1">Staff uses this PIN to verify pick-up requests</p>
            </div>
          </div>

          {/* Summary */}
          <div className="mx-6 mb-4 text-left space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Parent</span>
              <span className="text-white">{checkedInChild.parent_name}</span>
            </div>
            {checkedInChild.parent_phone && (
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Phone</span>
                <span className="text-white flex items-center gap-1"><Phone className="w-3 h-3" />{checkedInChild.parent_phone}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-400">Age Group</span>
              <span className="text-white">{checkedInChild.age_group}</span>
            </div>
            {checkedInChild.allergies_notes && (
              <div className="flex justify-between">
                <span className="text-slate-400">Notes</span>
                <span className="text-yellow-300 text-right max-w-[60%]">⚠ {checkedInChild.allergies_notes}</span>
              </div>
            )}
          </div>

          <div className="px-6 pb-5 flex gap-2">
            <button
              onClick={() => {
                // Reset for another check-in
                setCheckedInChild(null);
                setForm({ child_name: "", parent_name: "", parent_phone: "", age_group: "Toddler (1-2y)", allergies_notes: "" });
                setCode(generateCode());
                setPin(generatePIN());
              }}
              className="flex-1 bg-[#141f3d] hover:bg-[#1a2744] text-white font-semibold py-2.5 rounded-xl transition-colors text-sm border border-[rgba(212,168,67,0.15)]"
            >
              Check In Another
            </button>
            <button
              onClick={onClose}
              className="flex-1 bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] font-bold py-2.5 rounded-xl transition-colors text-sm"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Check-In Form ────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-[#1a2744] rounded-2xl border border-[rgba(212,168,67,0.2)] w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(212,168,67,0.1)]">
          <div className="flex items-center gap-2">
            <Baby className="w-5 h-5 text-[#d4a843]" />
            <h2 className="text-white font-bold">Check In Child</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3">

          {/* Previously Registered Children Dropdown */}
          {pastChildren.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowDropdown(v => !v)}
                className="w-full flex items-center justify-between bg-[#0a1128] border border-[#d4a843]/30 rounded-lg px-3 py-2.5 text-sm text-[#d4a843] hover:border-[#d4a843]/60 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Search className="w-3.5 h-3.5" />
                  Select a returning child...
                </span>
                <ChevronDown className={`w-4 h-4 transition-transform ${showDropdown ? "rotate-180" : ""}`} />
              </button>
              {showDropdown && (
                <div className="absolute z-10 w-full mt-1 bg-[#1a2744] border border-[rgba(212,168,67,0.2)] rounded-xl shadow-2xl max-h-56 overflow-hidden flex flex-col">
                  <div className="p-2 border-b border-[rgba(212,168,67,0.1)]">
                    <input
                      autoFocus
                      className="w-full bg-[#0a1128] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-[#d4a843]/60 placeholder-slate-500"
                      placeholder="Search by name..."
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                    />
                  </div>
                  <div className="overflow-y-auto flex-1">
                    {pastChildren
                      .filter(c => !search || c.child_name.toLowerCase().includes(search.toLowerCase()) || c.parent_name.toLowerCase().includes(search.toLowerCase()))
                      .map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setForm({
                              child_name: c.child_name,
                              parent_name: c.parent_name,
                              parent_phone: c.parent_phone || "",
                              age_group: c.age_group || "Toddler (1-2y)",
                              allergies_notes: c.allergies_notes || "",
                            });
                            setShowDropdown(false);
                            setSearch("");
                          }}
                          className="w-full text-left px-4 py-2.5 hover:bg-[rgba(212,168,67,0.08)] transition-colors border-b border-[rgba(212,168,67,0.05)] last:border-0"
                        >
                          <p className="text-white text-sm font-medium">{c.child_name}</p>
                          <p className="text-slate-400 text-xs">{c.parent_name}{c.parent_phone ? ` · ${c.parent_phone}` : ""} · {c.age_group}</p>
                        </button>
                      ))}
                    {pastChildren.filter(c => !search || c.child_name.toLowerCase().includes(search.toLowerCase()) || c.parent_name.toLowerCase().includes(search.toLowerCase())).length === 0 && (
                      <p className="text-slate-500 text-sm text-center py-4">No matches found</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Security Code + PIN Preview */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-[#0a1128] rounded-xl border border-[#d4a843]/30 px-3 py-3 flex items-center justify-between">
              <div>
                <p className="text-[9px] text-slate-400 uppercase tracking-widest">Security Code</p>
                <p className="text-[#d4a843] font-mono font-bold text-xl tracking-widest mt-0.5">{code}</p>
              </div>
              <button
                type="button"
                onClick={() => setCode(generateCode())}
                className="p-1.5 text-slate-400 hover:text-[#d4a843] transition-colors"
                title="Regenerate code"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="bg-[#0a1128] rounded-xl border border-blue-500/30 px-3 py-3 flex items-center justify-between">
              <div>
                <p className="text-[9px] text-slate-400 uppercase tracking-widest">4-Digit PIN</p>
                <p className="text-blue-300 font-mono font-bold text-xl tracking-widest mt-0.5">{pin}</p>
              </div>
              <button
                type="button"
                onClick={() => setPin(generatePIN())}
                className="p-1.5 text-slate-400 hover:text-blue-300 transition-colors"
                title="Regenerate PIN"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Child's Name *</label>
            <input
              className="w-full bg-[#0a1128] border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#d4a843]/60"
              value={form.child_name}
              onChange={e => setForm(f => ({ ...f, child_name: e.target.value }))}
              placeholder="First and last name"
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Age Group</label>
            <select
              className="w-full bg-[#0a1128] border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#d4a843]/60"
              value={form.age_group}
              onChange={e => setForm(f => ({ ...f, age_group: e.target.value }))}
            >
              {["Infant (0-12m)", "Toddler (1-2y)", "Pre-K (3-4y)", "Kindergarten (5y)"].map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Parent / Guardian Name *</label>
            <input
              className="w-full bg-[#0a1128] border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#d4a843]/60"
              value={form.parent_name}
              onChange={e => setForm(f => ({ ...f, parent_name: e.target.value }))}
              placeholder="Parent's full name"
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Parent Phone</label>
            <input
              className="w-full bg-[#0a1128] border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#d4a843]/60"
              value={form.parent_phone}
              onChange={e => setForm(f => ({ ...f, parent_phone: e.target.value }))}
              placeholder="(optional) for emergencies"
              type="tel"
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Allergies / Special Notes</label>
            <textarea
              className="w-full bg-[#0a1128] border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#d4a843]/60 resize-none"
              value={form.allergies_notes}
              onChange={e => setForm(f => ({ ...f, allergies_notes: e.target.value }))}
              placeholder="Any allergies or special needs..."
              rows={2}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] font-bold py-3 rounded-xl transition-colors disabled:opacity-50 text-sm"
          >
            {loading ? "Checking In..." : "Check In & Assign Code"}
          </button>
        </form>
      </div>
    </div>
  );
}