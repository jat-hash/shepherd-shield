import { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { X, Bell } from "lucide-react";
import { toast } from "sonner";

const REQUEST_TYPES = ["Parent Needed", "Diaper Change", "Feeding", "Medical", "Pick Up", "Other"];

// Nursery notifications go ONLY to these three leads
const NURSERY_LEADS = [
  "wilbert.ryan@gmail.com",
  "pachecosmailbox@gmail.com",
  "wintersjamesg@hotmail.com",
];

export default function ParentRequestForm({ children, user, onClose }) {
  const [form, setForm] = useState({
    parent_name: "",
    child_id: "",
    child_name: "",
    request_type: "Parent Needed",
    message: "",
  });
  const [loading, setLoading] = useState(false);
  const todayStr = new Date().toISOString().slice(0, 10);

  const parents = useMemo(() => {
    const map = new Map();
    (children || []).forEach(c => {
      const key = (c.parent_name || "").trim() || "(unknown)";
      if (!map.has(key)) map.set(key, { parent_name: key, parent_phone: c.parent_phone, kids: [] });
      map.get(key).kids.push(c);
    });
    return Array.from(map.values()).sort((a, b) => a.parent_name.localeCompare(b.parent_name));
  }, [children]);

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
      // Send notification ONLY to the three nursery leads; skip push to avoid
      // duplicate notifications (in-app Notification triggers browser alert)
      await base44.functions.invoke("sendTeamNotification", {
        title: `🍼 Nursery: ${form.request_type}`,
        message: `Parent: ${form.parent_name}${form.child_name ? ` — Child: ${form.child_name}` : ""}${form.message ? ` — ${form.message}` : ""}. Requested by nursery staff.`,
        recipient_emails: NURSERY_LEADS,
        skip_push: true,
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
            <label className="text-xs text-slate-400 mb-1 block">Select Parent</label>
            <select
              className="w-full bg-[#0a1128] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-[#d4a843]/60"
              value={form.parent_name}
              onChange={e => {
                const p = parents.find(pp => pp.parent_name === e.target.value);
                const kid = p?.kids?.[0];
                setForm(f => ({ ...f, parent_name: e.target.value, child_id: kid?.id || "", child_name: kid?.child_name || "" }));
              }}
            >
              <option value="">-- Select a parent --</option>
              {parents.map(p => (
                <option key={p.parent_name} value={p.parent_name}>{p.parent_name}{p.parent_phone ? ` (${p.parent_phone})` : ""}</option>
              ))}
            </select>
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
                  <option key={c.id} value={c.id}>{c.child_name}</option>
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