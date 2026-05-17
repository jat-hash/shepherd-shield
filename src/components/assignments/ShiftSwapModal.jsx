import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ArrowLeftRight, Search, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function ShiftSwapModal({ open, onClose, assignment, currentUser }) {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    base44.entities.User.list().then(all => {
      setUsers(all.filter(u => u.email !== assignment?.assigned_to_email));
    }).catch(() => {});
    setSearch("");
    setSelected(null);
  }, [open, assignment]);

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    return (
      (u.full_name || "").toLowerCase().includes(q) ||
      (u.email || "").toLowerCase().includes(q)
    );
  });

  const handleSwap = async () => {
    if (!selected || !assignment) return;
    setSaving(true);
    try {
      await base44.entities.Assignment.update(assignment.id, {
        assigned_to_email: selected.email,
        assigned_to_name: selected.full_name || selected.email,
      });

      // Notify both parties
      await Promise.all([
        base44.entities.Notification.create({
          user_email: selected.email,
          title: "Shift Swap: You're Now Assigned",
          message: `You have been assigned to ${assignment.position_name} on ${assignment.service_date} (${assignment.service_type || assignment.start_time}).`,
          type: "assignment_change",
          assignment_id: assignment.id,
          read: false,
        }),
        base44.entities.Notification.create({
          user_email: assignment.assigned_to_email,
          title: "Shift Swap: Assignment Transferred",
          message: `Your ${assignment.position_name} shift on ${assignment.service_date} has been reassigned to ${selected.full_name || selected.email}.`,
          type: "assignment_change",
          assignment_id: assignment.id,
          read: false,
        }),
      ]);

      toast.success(`Shift swapped to ${selected.full_name || selected.email}`);
      onClose(true);
    } catch (e) {
      toast.error("Swap failed: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!assignment) return null;

  return (
    <Dialog open={open} onOpenChange={() => onClose(false)}>
      <DialogContent className="bg-[#1a2744] border border-[rgba(212,168,67,0.2)] text-white max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#d4a843]">
            <ArrowLeftRight className="w-4 h-4" />
            Swap Shift
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Current assignment info */}
          <div className="bg-[#0a1128] rounded-lg p-3 border border-[rgba(212,168,67,0.1)] text-sm">
            <p className="font-semibold text-white">{assignment.position_name}</p>
            <p className="text-slate-400 text-xs">{assignment.service_date} · {assignment.service_type || `${assignment.start_time}–${assignment.end_time}`}</p>
            <p className="text-slate-400 text-xs mt-0.5">Currently: <span className="text-white">{assignment.assigned_to_name}</span></p>
          </div>

          <p className="text-xs text-slate-400">Select who to swap with:</p>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <Input
              placeholder="Search team member..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 bg-[#0a1128] border-[rgba(212,168,67,0.2)] text-white placeholder:text-slate-600 h-8 text-sm"
            />
          </div>

          {/* User list */}
          <div className="max-h-48 overflow-y-auto space-y-1">
            {filtered.length === 0 && (
              <p className="text-xs text-slate-600 text-center py-4">No members found</p>
            )}
            {filtered.map(u => (
              <button
                key={u.id}
                onClick={() => setSelected(u)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all border ${
                  selected?.id === u.id
                    ? "bg-[#d4a843]/20 border-[#d4a843]/40 text-[#d4a843]"
                    : "bg-[#0a1128] border-transparent text-white hover:border-[rgba(212,168,67,0.2)]"
                }`}
              >
                <div className="text-left">
                  <p className="font-medium text-xs">{u.full_name || u.email}</p>
                  {u.full_name && <p className="text-[10px] text-slate-500">{u.email}</p>}
                </div>
                {selected?.id === u.id && <Check className="w-3.5 h-3.5 shrink-0" />}
              </button>
            ))}
          </div>

          <Button
            onClick={handleSwap}
            disabled={!selected || saving}
            className="w-full bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] font-bold text-sm h-9"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><ArrowLeftRight className="w-3.5 h-3.5 mr-1.5" />Confirm Swap</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}