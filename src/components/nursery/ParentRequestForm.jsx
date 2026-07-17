import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { X, Bell, Search } from "lucide-react";
import { toast } from "sonner";

const REQUEST_TYPES = ["Parent Needed", "Diaper Change", "Feeding", "Medical", "Pick Up", "Other"];

// Nursery help requests alert Ryan, Pacheco, and all admins
const NURSERY_HELP_RECIPIENTS = [
  "wilbert.ryan@gmail.com",
  "pachecosmailbox@gmail.com",
];

export default function ParentRequestForm({ children: propChildren, user, onClose }) {
  const [form, setForm] = useState({
    parent_name: "",
    child_id: "",
    child_name: "",
    request_type: "Parent Needed",
    message: "",
  });
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [allChildren, setAllChildren] = useState(propChildren || []);
  const todayStr = new Date().toISOString().slice(0, 10);

  // Fetch ALL of today's nursery children (including checked-out) so the
  // parent/sponsor dropdown is always populated — not just checked-in kids.
  useEffect(() => {
    base44.entities.NurseryChild.filter({ service_date: todayStr }, "-check_in_time", 200)
      .then(setAllChildren)
      .catch(() => {});
  }, []);

  const parents = useMemo(() => {
    const map = new Map();
    (allChildren || []).forEach(c => {
      const key = (c.parent_name || "").trim() || "(unknown)";
      if (!map.has(key)) map.set(key, { parent_name: key, parent_phone: c.parent_phone, sponsor: c.sponsor || "", kids: [] });
      map.get(key).kids.push(c);
    });
    return Array.from(map.values()).sort((a, b) => a.parent_name.localeCompare(b.parent_name));
  }, [allChildren]);

  const filteredParents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return parents;
    return parents.filter(p =>
      p.parent_name.toLowerCase().includes(q) ||
      (p.sponsor || "").toLowerCase().includes(q)
    );
  }, [parents, search]);

  const selectedParent = parents.find(p => p.parent_name === form.parent_name);
  const parentKids = selectedParent?.kids || [];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.parent_name) { toast.error("Select a parent"); return; }
    if (parentKids.length > 1 && !form.child_name) { toast.error("Select a child"); return; }
    setLoading(true);
    try {
      await base44.entities.NurseryRequest.create({
        child_name: form.child_name,
        child_id: form.child_id,
        request_type: form.request_type,
        message: form.message,
        requested_by: user?.display_name || user?.full_name || user?.email,
        status: "Pending",
        service_date: todayStr,
      });
      // Alert ONLY Ryan, Pacheco, and the current admin user
      const recipientEmails = [...new Set([
        ...NURSERY_HELP_RECIPIENTS.map(e => e.toLowerCase()),
        (user?.email || '').toLowerCase(),
      ])];

      // Send in-app + persistent push notification (incident-level urgency
      // ensures the push is high-priority and persistent on all platforms)
      await base44.functions.invoke("sendTeamNotification", {
        title: `🍼 Nursery: ${form.request_type}`,
        message: `Parent: ${form.parent_name}${form.child_name ? ` — Child: ${form.child_name}` : ""}${form.message ? ` — ${form.message}` : ""}. Requested by nursery staff.`,
        recipient_emails: recipientEmails,
        notification_type: 'incident',
        click_url: '/NurseryDashboard',
      });
      toast.success("Request sent to team");
      onClose();
    } catch {
      toast.error("Failed to send request");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-[#1a2744] rounded-2xl border border-[rgba(212,168,67,0.2)] w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(212,168,67,0.1)]">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-[#d4a843]" />
            <h2 className="text-white font-bold">Request Parent / Help</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Search Parent / Sponsor</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
              <input
                className="w-full bg-[#0a1128] border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-white text-sm outline-none focus:border-[#d4a843]/60 placeholder:text-slate-500"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Type parent or sponsor name..."
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Select Parent / Sponsor</label>
            <select
              className="w-full bg-[#0a1128] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-[#d4a843]/60"
              value={form.parent_name}
              onChange={e => {
                const p = parents.find(pp => pp.parent_name === e.target.value);
                const kid = p?.kids?.[0];
                setForm(f => ({ ...f, parent_name: e.target.value, child_id: kid?.id || "", child_name: kid?.child_name || "" }));
              }}
            >
              <option value="">-- Select a parent / sponsor --</option>
              {filteredParents.map(p => (
                <option key={p.parent_name} value={p.parent_name}>
                  {p.parent_name}{p.sponsor ? ` · Sponsor: ${p.sponsor}` : ""}{p.parent_phone ? ` (${p.parent_phone})` : ""}
                </option>
              ))}
            </select>
            {filteredParents.length === 0 && (
              <p className="text-xs text-orange-400 mt-1">No matches found. Try a different name or sponsor.</p>
            )}
          </div>
          {parentKids.length > 1 && (
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Select Child</label>
              <select
                className="w-full bg-[#0a1128] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-[#d4a843]/60"
                value={form.child_id}
                onChange={e => {
                  const child = parentKids.find(c => c.id === e.target.value);
                  setForm(f => ({ ...f, child_id: e.target.value, child_name: child?.child_name || "" }));
                }}
              >
                <option value="">-- Select a child --</option>
                {parentKids.map(c => (
                  <option key={c.id} value={c.id}>{c.child_name?.trim() || `Child of ${c.parent_name}`}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Request Type</label>
            <select
              className="w-full bg-[#0a1128] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-[#d4a843]/60"
              value={form.request_type}
              onChange={e => setForm(f => ({ ...f, request_type: e.target.value }))}
            >
              {REQUEST_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Additional Notes</label>
            <textarea
              className="w-full bg-[#0a1128] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-[#d4a843]/60 resize-none"
              value={form.message}
              onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
              placeholder="Any extra details..."
              rows={2}
            />
          </div>
          <button
            type="submit"
            disabled={loading || !form.parent_name || (parentKids.length > 1 && !form.child_name)}
            className="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-50"
          >
            {loading ? "Sending..." : "📢 Send Request to Team"}
          </button>
        </form>
      </div>
    </div>
  );
}