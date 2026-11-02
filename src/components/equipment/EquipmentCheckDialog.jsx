import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Circle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { checklistForCategory } from "@/lib/equipmentChecklists";

function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function EquipmentCheckDialog({ item, open, onClose, onChecked }) {
  const [checked, setChecked] = useState([]);
  const [notes, setNotes] = useState("");
  const [checkType, setCheckType] = useState("Checked");
  const [saving, setSaving] = useState(false);

  const tasks =
    item?.inspection_checklist?.length > 0
      ? item.inspection_checklist
      : checklistForCategory(item?.category);

  useEffect(() => {
    if (!open || !item) return;
    const done = item.last_check_tasks || [];
    const list =
      item.inspection_checklist?.length > 0
        ? item.inspection_checklist
        : checklistForCategory(item.category);
    setChecked(list.map(t => done.includes(t)));
    setNotes(item.last_check_notes || "");
    setCheckType("Checked");
  }, [open, item?.id]);

  if (!item) return null;

  const doneThisMonth =
    !!item.last_inspection_date &&
    String(item.last_inspection_date).slice(0, 7) === dateKey().slice(0, 7);

  const allChecked = tasks.length > 0 && tasks.every((_, i) => checked[i]);

  const submit = async () => {
    setSaving(true);
    try {
      const me = await base44.auth.me().catch(() => null);
      const completed = tasks.filter((_, i) => checked[i]);
      const missed = tasks.filter((_, i) => !checked[i]);
      const next = new Date();
      next.setDate(next.getDate() + (item.maintenance_frequency_days || 30));

      await base44.entities.Equipment.update(item.id, {
        last_inspection_date: dateKey(),
        next_maintenance_date: dateKey(next),
        last_check_tasks: completed,
        last_check_missed: missed,
        last_check_notes: notes.trim() || null,
        last_check_by: me?.full_name || me?.email || null,
      });

      await base44.entities.EquipmentServiceLog.create({
        equipment_id: item.id,
        equipment_name: item.name,
        category: item.category || null,
        action: checkType,
        performed_by: me?.full_name || me?.email || "Unknown",
        performed_by_email: me?.email || null,
        performed_at: new Date().toISOString(),
        tasks_completed: completed,
        tasks_missed: missed,
        notes: notes.trim() || null,
      });

      toast.success(
        missed.length
          ? `${item.name} checked — ${missed.length} item(s) need attention`
          : `${item.name} check complete`
      );
      onChecked();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const undo = async () => {
    setSaving(true);
    try {
      await base44.entities.Equipment.update(item.id, {
        last_inspection_date: null,
        next_maintenance_date: null,
        last_check_tasks: [],
        last_check_missed: [],
        last_check_notes: null,
        last_check_by: null,
      });

      const me = await base44.auth.me().catch(() => null);
      const logs = await base44.entities.EquipmentServiceLog
        .filter({ equipment_id: item.id })
        .catch(() => []);
      const mineToday = (logs || []).filter(
        l => l.performed_by_email === me?.email && String(l.performed_at || "").slice(0, 10) === dateKey()
      );
      for (const entry of mineToday) {
        await base44.entities.EquipmentServiceLog.delete(entry.id).catch(() => {});
      }

      toast.info("Check cleared");
      onChecked();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="bg-[#1a2744] border-slate-700 text-white w-[calc(100vw-2rem)] max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#d4a843]">{item.name}</DialogTitle>
          <p className="text-[11px] text-slate-400">{item.category} • Monthly check</p>
        </DialogHeader>

        <div className="space-y-3">
          {doneThisMonth && (
            <div className="flex items-start gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-emerald-400 font-semibold">
                  Checked {item.last_inspection_date}
                  {item.last_check_by ? ` by ${item.last_check_by}` : ""}
                </p>
                <button onClick={undo} disabled={saving} className="text-[11px] text-slate-400 underline mt-0.5">
                  Undo this month's check
                </button>
              </div>
            </div>
          )}

          <div className="flex gap-1 p-1 bg-[#0a1128] rounded-lg border border-slate-700">
            {["Checked", "Serviced"].map(type => (
              <button
                key={type}
                onClick={() => setCheckType(type)}
                className={`flex-1 px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all ${
                  checkType === type ? "bg-[#d4a843] text-[#0a1128]" : "text-slate-400"
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            {tasks.map((task, i) => (
              <button
                key={task}
                onClick={() => setChecked(prev => prev.map((v, idx) => (idx === i ? !v : v)))}
                className={`w-full flex items-start gap-2.5 rounded-lg border p-2.5 text-left transition-all ${
                  checked[i]
                    ? "bg-emerald-500/5 border-emerald-500/30"
                    : "bg-[#0a1128] border-slate-700 hover:border-[#d4a843]/40"
                }`}
              >
                {checked[i] ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                ) : (
                  <Circle className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                )}
                <span className={`text-xs ${checked[i] ? "text-slate-300" : "text-white"}`}>{task}</span>
              </button>
            ))}
          </div>

          {tasks.length > 0 && !allChecked && (
            <p className="flex items-center gap-1.5 text-[11px] text-amber-400">
              <AlertTriangle className="w-3.5 h-3.5" />
              Unchecked items are saved as needing attention
            </p>
          )}

          <div>
            <p className="text-xs text-slate-300 mb-1">Notes / issues</p>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Radio #3 battery only holds a 2-hour charge"
              className="bg-[#0a1128] border-slate-700 text-white"
            />
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="ghost" onClick={onClose} className="flex-1 text-slate-400">
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={saving}
            className="flex-1 bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] font-bold"
          >
            {saving ? "Saving..." : doneThisMonth ? "Update Check" : "Mark Checked"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}