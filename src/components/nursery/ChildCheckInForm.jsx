import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { X, Baby } from "lucide-react";
import { toast } from "sonner";

function generateCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

export default function ChildCheckInForm({ user, onClose, onCheckedIn }) {
  const [form, setForm] = useState({
    child_name: "",
    parent_name: "",
    parent_phone: "",
    age_group: "Toddler (1-2y)",
    allergies_notes: "",
  });
  const [loading, setLoading] = useState(false);

  const todayStr = new Date().toISOString().slice(0, 10);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.child_name || !form.parent_name) {
      toast.error("Child name and parent name are required");
      return;
    }
    setLoading(true);
    const code = generateCode();
    try {
      const child = await base44.entities.NurseryChild.create({
        ...form,
        check_in_code: code,
        checked_in: true,
        check_in_time: new Date().toISOString(),
        checked_in_by: user?.display_name || user?.full_name || user?.email,
        service_date: todayStr,
      });
      toast.success(`Checked in! Parent code: ${code}`, { duration: 8000 });
      onCheckedIn?.(child);
      onClose();
    } catch {
      toast.error("Failed to check in child");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-[#1a2744] rounded-2xl border border-[rgba(212,168,67,0.2)] w-full max-w-md shadow-2xl">
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
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Child's Name *</label>
            <input
              className="w-full bg-[#0a1128] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-[#d4a843]/60"
              value={form.child_name}
              onChange={e => setForm(f => ({ ...f, child_name: e.target.value }))}
              placeholder="First and last name"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Age Group</label>
            <select
              className="w-full bg-[#0a1128] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-[#d4a843]/60"
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
              className="w-full bg-[#0a1128] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-[#d4a843]/60"
              value={form.parent_name}
              onChange={e => setForm(f => ({ ...f, parent_name: e.target.value }))}
              placeholder="Parent's full name"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Parent Phone</label>
            <input
              className="w-full bg-[#0a1128] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-[#d4a843]/60"
              value={form.parent_phone}
              onChange={e => setForm(f => ({ ...f, parent_phone: e.target.value }))}
              placeholder="(optional)"
              type="tel"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Allergies / Notes</label>
            <textarea
              className="w-full bg-[#0a1128] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-[#d4a843]/60 resize-none"
              value={form.allergies_notes}
              onChange={e => setForm(f => ({ ...f, allergies_notes: e.target.value }))}
              placeholder="Any allergies or special notes..."
              rows={2}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] font-bold py-3 rounded-xl transition-colors disabled:opacity-50"
          >
            {loading ? "Checking In..." : "Check In & Generate Code"}
          </button>
        </form>
      </div>
    </div>
  );
}