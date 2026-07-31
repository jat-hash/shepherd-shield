import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { X, Baby, CheckCircle2, Phone, Search, ChevronDown, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

const AGE_GROUPS = ["Infant (0-12m)", "Toddler (1-2y)", "Pre-K (3-4y)", "Kindergarten (5y)"];

export default function ChildCheckInForm({ user, onClose, onCheckedIn }) {
  const [parent, setParent] = useState({
    parent_name: "",
    parent_phone: "",
    sponsor: "",
  });
  const [additionalParents, setAdditionalParents] = useState([]);
  const [children, setChildren] = useState([
    { child_name: "", age_group: "Toddler (1-2y)", allergies_notes: "" },
  ]);
  const [loading, setLoading] = useState(false);
  const [checkedInList, setCheckedInList] = useState([]);
  const [pastChildren, setPastChildren] = useState([]);
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

  useEffect(() => {
    base44.entities.NurseryChild.filter({ service_date: todayStr }, "-check_in_time", 200)
      .then(setCheckedInToday)
      .catch(() => {});
  }, [todayStr]);

  // Selecting a returning child fills the parent info and adds that child
  // to the check-in queue (only once).
  const fillFromChild = (child) => {
    setParent({
      parent_name: child.parent_name || "",
      parent_phone: child.parent_phone || "",
      sponsor: child.sponsor || "",
    });
    setAdditionalParents(child.additional_parents || []);
    setChildren(prev => {
      // Avoid adding the same child twice
      const exists = prev.some(c => c.child_name === (child.child_name || ""));
      if (exists) {
        toast.info(`${child.child_name || "That child"} is already in the list`);
        return prev;
      }
      return [...prev, {
        child_name: child.child_name || "",
        age_group: child.age_group || "Toddler (1-2y)",
        allergies_notes: child.allergies_notes || "",
      }];
    });
    setShowDropdown(false);
    setSearch("");
  };

  const updateChild = (idx, field, value) => {
    setChildren(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  };

  const addChild = () => {
    setChildren(prev => [...prev, { child_name: "", age_group: "Toddler (1-2y)", allergies_notes: "" }]);
  };

  const removeChild = (idx) => {
    setChildren(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);
  };

  // Auto-fill parent info when a returning child's name is typed into the
  // first child row.
  const lookupParent = (name) => {
    const trimmed = (name || "").trim().toLowerCase();
    if (!trimmed) return;
    const match = pastChildren.find(c => (c.child_name || "").trim().toLowerCase() === trimmed);
    if (match) {
      setParent(p => ({
        ...p,
        parent_name: p.parent_name || match.parent_name || "",
        parent_phone: p.parent_phone || match.parent_phone || "",
        sponsor: p.sponsor || match.sponsor || "",
      }));
      setAdditionalParents(prev => prev.length > 0 ? prev : (match.additional_parents || []));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!parent.parent_name) {
      toast.error("Parent name is required");
      return;
    }
    // Filter out completely empty child rows (no name AND no allergies)
    const validChildren = children.filter(c => (c.child_name || "").trim() || (c.allergies_notes || "").trim());
    if (validChildren.length === 0) {
      toast.error("Add at least one child");
      return;
    }

    setLoading(true);
    try {
      const results = [];

      for (const child of validChildren) {
        const trimmedName = (child.child_name || "").trim();

        // Look for ANY existing record for this child+parent today.
        // If found, reactivate it instead of creating a duplicate so
        // the head count stays accurate.
        const existing = checkedInToday.find(
          t => (t.child_name || "").trim() === trimmedName && t.parent_name === parent.parent_name
        );

        if (existing) {
          // Update the existing record (whether checked in or checked out)
          // instead of creating a duplicate — refreshes check-in time and
          // resets any checkout state so the child is marked present again.
          const updated = await base44.entities.NurseryChild.update(existing.id, {
            checked_in: true,
            check_in_time: new Date().toISOString(),
            checked_in_by: checkedInBy,
            checked_out: false,
            check_out_time: null,
            checked_out_by: null,
            age_group: child.age_group,
            allergies_notes: child.allergies_notes || existing.allergies_notes || "",
            additional_parents: additionalParents.filter(p => p.name?.trim()),
            parent_phone: parent.parent_phone,
            sponsor: parent.sponsor,
          });
          results.push(updated);
        } else {
          // New child — create a fresh record
          const created = await base44.entities.NurseryChild.create({
            child_name: trimmedName,
            parent_name: parent.parent_name,
            parent_phone: parent.parent_phone,
            additional_parents: additionalParents.filter(p => p.name?.trim()),
            sponsor: parent.sponsor,
            age_group: child.age_group,
            allergies_notes: child.allergies_notes,
            checked_in: true,
            check_in_time: new Date().toISOString(),
            checked_in_by: checkedInBy,
            service_date: todayStr,
          });
          results.push(created);
        }
      }

      setCheckedInList(results);
      onCheckedIn?.(results);

      // Refresh the today list so re-check-ins are reflected
      const refreshed = await base44.entities.NurseryChild.filter({ service_date: todayStr }, "-check_in_time", 200);
      setCheckedInToday(refreshed);
    } catch {
      toast.error("Failed to check in children");
    } finally {
      setLoading(false);
    }
  };

  const resetAll = () => {
    setCheckedInList([]);
    setParent({ parent_name: "", parent_phone: "", sponsor: "" });
    setAdditionalParents([]);
    setChildren([{ child_name: "", age_group: "Toddler (1-2y)", allergies_notes: "" }]);
    base44.entities.NurseryChild.filter({ service_date: todayStr }, "-check_in_time", 200)
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

          {/* Previously Registered Children — click to auto-fill form */}
          {pastChildren.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowDropdown(v => !v)}
                className="w-full flex items-center justify-between bg-[#0a1128] border border-[#d4a843]/30 rounded-lg px-3 py-2.5 text-sm text-[#d4a843] hover:border-[#d4a843]/60 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Search className="w-3.5 h-3.5" />
                  Select returning child to auto-fill...
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
                      .map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => fillFromChild(c)}
                          className="w-full text-left px-4 py-2.5 transition-colors border-b border-[rgba(212,168,67,0.05)] last:border-0 hover:bg-[rgba(212,168,67,0.08)] flex items-center justify-between"
                        >
                          <div>
                            <p className="text-white text-sm font-medium">{c.child_name?.trim() || `Child of ${c.parent_name}`}</p>
                            <p className="text-slate-400 text-xs">{c.parent_name}{c.parent_phone ? ` · ${c.parent_phone}` : ""} · {c.age_group}</p>
                          </div>
                        </button>
                      ))}
                    {pastChildren.filter(c => !search || (c.child_name || "").toLowerCase().includes(search.toLowerCase()) || (c.parent_name || "").toLowerCase().includes(search.toLowerCase())).length === 0 && (
                      <p className="text-slate-500 text-sm text-center py-4">No matches found</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            {/* ── Parent Section (shared) ── */}
            <div className="space-y-3 pb-3 border-b border-[rgba(212,168,67,0.1)]">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Parent / Guardian Name *</label>
                <input
                  className="w-full bg-[#0a1128] border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#d4a843]/60"
                  value={parent.parent_name}
                  onChange={e => setParent(p => ({ ...p, parent_name: e.target.value }))}
                  placeholder="Parent's full name"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Parent Phone</label>
                <input
                  className="w-full bg-[#0a1128] border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#d4a843]/60"
                  value={parent.parent_phone}
                  onChange={e => setParent(p => ({ ...p, parent_phone: e.target.value }))}
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
                  value={parent.sponsor}
                  onChange={e => setParent(p => ({ ...p, sponsor: e.target.value }))}
                  placeholder="(optional) sponsoring member or family"
                />
              </div>
            </div>

            {/* ── Children Section ── */}
            <div className="space-y-3">
              <p className="text-xs text-[#d4a843] font-semibold uppercase tracking-wide">Children ({children.length})</p>

              {children.map((child, idx) => (
                <div key={idx} className="bg-[#0a1128]/40 rounded-xl border border-slate-700/50 p-3 space-y-2 relative">
                  {children.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeChild(idx)}
                      className="absolute top-2 right-2 text-red-400 hover:text-red-300 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Child {children.length > 1 ? idx + 1 : ""} Name</label>
                    <input
                      className="w-full bg-[#0a1128] border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#d4a843]/60"
                      value={child.child_name}
                      onChange={e => updateChild(idx, "child_name", e.target.value)}
                      onBlur={e => idx === 0 && lookupParent(e.target.value)}
                      placeholder="First and last name"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Age Group</label>
                    <select
                      className="w-full bg-[#0a1128] border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#d4a843]/60"
                      value={child.age_group}
                      onChange={e => updateChild(idx, "age_group", e.target.value)}
                    >
                      {AGE_GROUPS.map(g => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Allergies / Special Notes</label>
                    <textarea
                      className="w-full bg-[#0a1128] border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#d4a843]/60 resize-none"
                      value={child.allergies_notes}
                      onChange={e => updateChild(idx, "allergies_notes", e.target.value)}
                      placeholder="Any allergies or special needs..."
                      rows={2}
                    />
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={addChild}
                className="w-full flex items-center justify-center gap-2 bg-[#0a1128]/50 border border-dashed border-[#d4a843]/30 rounded-lg px-3 py-2.5 text-sm text-[#d4a843] hover:border-[#d4a843]/60 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Another Child
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] font-bold py-3 rounded-xl transition-colors disabled:opacity-50 text-sm"
            >
              {loading ? "Checking In..." : `Check In ${children.filter(c => (c.child_name || "").trim() || (c.allergies_notes || "").trim()).length || "Child"}${children.filter(c => (c.child_name || "").trim() || (c.allergies_notes || "").trim()).length !== 1 ? "ren" : ""}`}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}