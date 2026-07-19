import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { X, Baby, CheckCircle2, Phone, Search, ChevronDown, UserPlus, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

export default function ChildCheckInForm({ user, onClose, onCheckedIn }) {
  const [form, setForm] = useState({
    child_name: "",
    parent_name: "",
    parent_phone: "",
    sponsor: "",
    age_group: "Toddler (1-2y)",
    allergies_notes: "",
  });
  const [additionalParents, setAdditionalParents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [checkedInList, setCheckedInList] = useState([]);
  const [pastChildren, setPastChildren] = useState([]);
  const [selectedChildren, setSelectedChildren] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [search, setSearch] = useState("");
  const [checkedInToday, setCheckedInToday] = useState([]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const checkedInBy = user?.display_name || user?.full_name || user?.email;

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

  // Fetch today's checked-in children so we can badge returning kids who are
  // already in the nursery, and auto-check-out stale records before re-check-in
  // so the head count stays accurate.
  useEffect(() => {
    base44.entities.NurseryChild.filter({ service_date: todayStr, checked_in: true }, "-check_in_time", 200)
      .then(setCheckedInToday)
      .catch(() => {});
  }, [todayStr]);

  const childKey = (c) => `${c.child_name}|${c.parent_name}`;
  const isChildSelected = (c) => selectedChildren.some(s => childKey(s) === childKey(c));
  const isAlreadyInToday = (c) => checkedInToday.some(t => childKey(t) === childKey(c));

  const toggleChild = (child) => {
    setSelectedChildren(prev =>
      isChildSelected(child)
        ? prev.filter(c => childKey(c) !== childKey(child))
        : [...prev, child]
    );
  };

  const handleBulkCheckIn = async () => {
    if (selectedChildren.length === 0) return;
    setLoading(true);
    try {
      // Auto-check-out any existing active records for these children so
      // the head count stays accurate when a parent is re-checked-in.
      const staleIds = checkedInToday
        .filter(t => selectedChildren.some(s => childKey(s) === childKey(t)))
        .map(t => t.id);
      if (staleIds.length > 0) {
        await base44.entities.NurseryChild.bulkUpdate(
          staleIds.map(id => ({
            id,
            checked_in: false,
            check_out_time: new Date().toISOString(),
            checked_out_by: `${checkedInBy} (auto re-check-in)`,
          }))
        );
      }

      const records = selectedChildren.map(c => ({
        child_name: c.child_name || "",
        parent_name: c.parent_name || "",
        parent_phone: c.parent_phone || "",
        sponsor: c.sponsor || "",
        age_group: c.age_group || "Toddler (1-2y)",
        allergies_notes: c.allergies_notes || "",
        checked_in: true,
        check_in_time: new Date().toISOString(),
        checked_in_by: checkedInBy,
        service_date: todayStr,
      }));
      const created = await base44.entities.NurseryChild.bulkCreate(records);
      setCheckedInList(created);
      onCheckedIn?.(created);
    } catch {
      toast.error("Failed to check in children");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.parent_name) {
      toast.error("Parent name is required");
      return;
    }
    setLoading(true);
    try {
      // Auto-check-out any existing active record for the same child+parent today
      const stale = checkedInToday.find(t => t.child_name === form.child_name && t.parent_name === form.parent_name);
      if (stale) {
        await base44.entities.NurseryChild.update(stale.id, {
          checked_in: false,
          check_out_time: new Date().toISOString(),
          checked_out_by: `${checkedInBy} (auto re-check-in)`,
        });
      }

      const child = await base44.entities.NurseryChild.create({
        ...form,
        additional_parents: additionalParents.filter(p => p.name?.trim()),
        checked_in: true,
        check_in_time: new Date().toISOString(),
        checked_in_by: checkedInBy,
        service_date: todayStr,
      });
      setCheckedInList([child]);
      onCheckedIn?.(child);
    } catch {
      toast.error("Failed to check in child");
    } finally {
      setLoading(false);
    }
  };

  const resetAll = () => {
    setCheckedInList([]);
    setSelectedChildren([]);
    setForm({ child_name: "", parent_name: "", parent_phone: "", sponsor: "", age_group: "Toddler (1-2y)", allergies_notes: "" });
    setAdditionalParents([]);
    base44.entities.NurseryChild.filter({ service_date: todayStr, checked_in: true }, "-check_in_time", 200)
      .then(setCheckedInToday)
      .catch(() => {});
  };

  // ── Confirmation Screen ──────────────────────────────────────────
  if (checkedInList.length > 0) {
    const multiple = checkedInList.length > 1;
    return (
      <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
        <div className="bg-[#1a2744] rounded-2xl border border-green-500/30 w-full max-w-sm shadow-2xl text-center">
          <div className="px-6 pt-6 pb-2">
            <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
            <h2 className="text-white font-bold text-lg">
              {multiple ? `${checkedInList.length} Children Checked In!` : "Checked In!"}
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              {multiple ? "All children are now in the nursery" : checkedInList[0].child_name?.trim() ? `${checkedInList[0].child_name} is now in the nursery` : `${checkedInList[0].parent_name}'s child is now in the nursery`}
            </p>
          </div>

          <div className="mx-6 mb-4 text-left space-y-2 text-sm max-h-48 overflow-y-auto">
            {checkedInList.map((child, idx) => (
              <div key={idx} className="space-y-1 pb-2 border-b border-[rgba(212,168,67,0.08)] last:border-0">
                <div className="flex justify-between">
                  <span className="text-slate-400">{multiple ? "Child" : "Parent"}</span>
                  <span className="text-white">{multiple ? (child.child_name?.trim() || `Child of ${child.parent_name}`) : child.parent_name}</span>
                </div>
                {multiple && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Parent</span>
                    <span className="text-white">{child.parent_name}</span>
                  </div>
                )}
                {child.additional_parents?.map((p, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Parent</span>
                      <span className="text-white">{p.name}</span>
                    </div>
                    {p.phone && (
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Phone</span>
                        <span className="text-white flex items-center gap-1"><Phone className="w-3 h-3" />{p.phone}</span>
                      </div>
                    )}
                  </div>
                ))}
                {child.parent_phone && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Phone</span>
                    <span className="text-white flex items-center gap-1"><Phone className="w-3 h-3" />{child.parent_phone}</span>
                  </div>
                )}
                {child.sponsor && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Sponsor</span>
                    <span className="text-white">{child.sponsor}</span>
                  </div>
                )}
                {child.allergies_notes && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Notes</span>
                    <span className="text-yellow-300 text-right max-w-[60%]">⚠ {child.allergies_notes}</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="px-6 pb-5 flex gap-2">
            <button
              onClick={resetAll}
              className="flex-1 bg-[#141f3d] hover:bg-[#1a2744] text-white font-semibold py-2.5 rounded-xl transition-colors text-sm border border-[rgba(212,168,67,0.15)]"
            >
              Check In More
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
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(212,168,67,0.1)] sticky top-0 bg-[#1a2744] z-10">
          <div className="flex items-center gap-2">
            <Baby className="w-5 h-5 text-[#d4a843]" />
            <h2 className="text-white font-bold">Check In Children</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-3">

          {/* Previously Registered Children — Multi-Select Dropdown */}
          {pastChildren.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowDropdown(v => !v)}
                className="w-full flex items-center justify-between bg-[#0a1128] border border-[#d4a843]/30 rounded-lg px-3 py-2.5 text-sm text-[#d4a843] hover:border-[#d4a843]/60 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Search className="w-3.5 h-3.5" />
                  Select returning children...
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
                      .filter(c => !search || (c.child_name || "").toLowerCase().includes(search.toLowerCase()) || (c.parent_name || "").toLowerCase().includes(search.toLowerCase()))
                      .map(c => {
                        const selected = isChildSelected(c);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => toggleChild(c)}
                            className={`w-full text-left px-4 py-2.5 transition-colors border-b border-[rgba(212,168,67,0.05)] last:border-0 flex items-center justify-between ${selected ? "bg-[rgba(212,168,67,0.12)]" : "hover:bg-[rgba(212,168,67,0.08)]"}`}
                          >
                            <div>
                              <p className="text-white text-sm font-medium">{c.child_name?.trim() || `Child of ${c.parent_name}`}</p>
                              <p className="text-slate-400 text-xs">{c.parent_name}{c.parent_phone ? ` · ${c.parent_phone}` : ""} · {c.age_group}</p>
                              {isAlreadyInToday(c) && (
                                <span className="inline-block mt-1 text-[9px] font-bold bg-green-700 text-green-200 px-1.5 py-0.5 rounded">IN NOW</span>
                              )}
                            </div>
                            {selected && <CheckCircle2 className="w-4 h-4 text-[#d4a843] flex-shrink-0" />}
                          </button>
                        );
                      })}
                    {pastChildren.filter(c => !search || (c.child_name || "").toLowerCase().includes(search.toLowerCase()) || (c.parent_name || "").toLowerCase().includes(search.toLowerCase())).length === 0 && (
                      <p className="text-slate-500 text-sm text-center py-4">No matches found</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Selected Children + Bulk Check-In */}
          {selectedChildren.length > 0 && (
            <div className="bg-[#0a1128]/50 rounded-xl border border-[#d4a843]/20 p-3 space-y-2">
              <p className="text-xs text-[#d4a843] font-semibold uppercase tracking-wide">Selected ({selectedChildren.length})</p>
              {selectedChildren.map((c, idx) => (
                <div key={idx} className="flex items-center justify-between bg-[#1a2744] rounded-lg px-3 py-2">
                  <div>
                    <p className="text-white text-sm font-medium">{c.child_name?.trim() || `Child of ${c.parent_name}`}</p>
                    <p className="text-slate-400 text-xs">{c.parent_name} · {c.age_group}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleChild(c)}
                    className="text-red-400 hover:text-red-300 p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={handleBulkCheckIn}
                disabled={loading}
                className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-2.5 rounded-xl transition-colors disabled:opacity-50 text-sm mt-1"
              >
                {loading ? "Checking In..." : `Check In ${selectedChildren.length} ${selectedChildren.length === 1 ? "Child" : "Children"}`}
              </button>
            </div>
          )}

          {/* Divider */}
          <div className="flex items-center gap-2 py-1">
            <div className="flex-1 h-px bg-[rgba(212,168,67,0.1)]"></div>
            <span className="text-xs text-slate-500 flex items-center gap-1"><UserPlus className="w-3 h-3" /> New Child</span>
            <div className="flex-1 h-px bg-[rgba(212,168,67,0.1)]"></div>
          </div>

          {/* Manual Entry Form for New Children */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Child's Name</label>
              <input
                className="w-full bg-[#0a1128] border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#d4a843]/60"
                value={form.child_name}
                onChange={e => setForm(f => ({ ...f, child_name: e.target.value }))}
                placeholder="First and last name"
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

            {/* Additional Parents */}
            {additionalParents.length > 0 && (
              <div className="space-y-2">
                {additionalParents.map((p, idx) => (
                  <div key={idx} className="flex gap-2 items-start">
                    <div className="flex-1 space-y-2">
                      <input
                        className="w-full bg-[#0a1128] border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#d4a843]/60"
                        value={p.name}
                        onChange={e => setAdditionalParents(prev => prev.map((pp, i) => i === idx ? { ...pp, name: e.target.value } : pp))}
                        placeholder="Additional parent name"
                      />
                      <input
                        className="w-full bg-[#0a1128] border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#d4a843]/60"
                        value={p.phone}
                        onChange={e => setAdditionalParents(prev => prev.map((pp, i) => i === idx ? { ...pp, phone: e.target.value } : pp))}
                        placeholder="(optional) phone"
                        type="tel"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setAdditionalParents(prev => prev.filter((_, i) => i !== idx))}
                      className="text-red-400 hover:text-red-300 p-2 mt-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => setAdditionalParents(prev => [...prev, { name: "", phone: "" }])}
              className="w-full flex items-center justify-center gap-2 bg-[#0a1128]/50 border border-dashed border-[#d4a843]/30 rounded-lg px-3 py-2.5 text-sm text-[#d4a843] hover:border-[#d4a843]/60 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Another Parent
            </button>

            <div>
              <label className="text-xs text-slate-400 mb-1 block">Sponsor</label>
              <input
                className="w-full bg-[#0a1128] border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#d4a843]/60"
                value={form.sponsor}
                onChange={e => setForm(f => ({ ...f, sponsor: e.target.value }))}
                placeholder="(optional) sponsoring member or family"
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
              {loading ? "Checking In..." : "Check In New Child"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}