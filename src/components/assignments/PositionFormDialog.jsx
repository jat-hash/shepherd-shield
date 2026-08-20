import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Check, Trash2 } from "lucide-react";

// Reusable create / edit / delete dialog for Position records.
// `position` = null  → create new;  `position` = object  → edit + delete.
export default function PositionFormDialog({ open, onClose, onSaved, position, users = [] }) {
  const isEdit = !!position?.id;
  const [form, setForm] = useState({
    name: "",
    description: "",
    default_radio_channel: "",
    area_responsibilities: [],
    default_assigned_email: "",
    default_assigned_name: "",
  });
  const [newResp, setNewResp] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (position) {
      setForm({
        name: position.name || "",
        description: position.description || "",
        default_radio_channel: position.default_radio_channel || "",
        area_responsibilities: position.area_responsibilities || [],
        default_assigned_email: position.default_assigned_email || "",
        default_assigned_name: position.default_assigned_name || "",
      });
    } else {
      setForm({
        name: "",
        description: "",
        default_radio_channel: "",
        area_responsibilities: [],
        default_assigned_email: "",
        default_assigned_name: "",
      });
    }
    setNewResp("");
  }, [open, position]);

  const addResp = () => {
    const v = newResp.trim();
    if (!v) return;
    setForm(f => ({ ...f, area_responsibilities: [...f.area_responsibilities, v] }));
    setNewResp("");
  };

  const removeResp = (r) =>
    setForm(f => ({ ...f, area_responsibilities: f.area_responsibilities.filter(x => x !== r) }));

  const handleAssigneeSelect = (email) => {
    const u = users.find(u => u.email === email);
    setForm(f => ({
      ...f,
      default_assigned_email: email,
      default_assigned_name: u?.data?.display_name || u?.display_name || u?.full_name || email,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let saved;
      if (isEdit) {
        saved = await base44.entities.Position.update(position.id, form);
      } else {
        saved = await base44.entities.Position.create(form);
      }
      onSaved?.(saved, isEdit ? position : null);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this position? Existing assignments keep their saved position name.")) return;
    setDeleting(true);
    try {
      await base44.entities.Position.delete(position.id);
      onSaved?.(null, position);
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[#1a2744] border-slate-700 text-white w-[calc(100vw-2rem)] max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#d4a843]">{isEdit ? "Edit" : "Create New"} Position</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-slate-300 text-xs">Position Name</Label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="bg-[#0a1128] border-slate-700 text-white mt-1" placeholder="e.g. Main Entrance 1" />
          </div>

          <div>
            <Label className="text-slate-300 text-xs">Description</Label>
            <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="bg-[#0a1128] border-slate-700 text-white mt-1" rows={2} />
          </div>

          <div>
            <Label className="text-slate-300 text-xs">Default Radio Channel</Label>
            <Input value={form.default_radio_channel} onChange={e => setForm({ ...form, default_radio_channel: e.target.value })} className="bg-[#0a1128] border-slate-700 text-white mt-1" placeholder="e.g. CH 2" />
          </div>

          {users.length > 0 && (
            <div>
              <Label className="text-slate-300 text-xs">Default Assigned To</Label>
              <Select value={form.default_assigned_email} onValueChange={handleAssigneeSelect}>
                <SelectTrigger className="bg-[#0a1128] border-slate-700 text-white mt-1"><SelectValue placeholder="Optional default member" /></SelectTrigger>
                <SelectContent className="bg-[#1a2744] border-slate-700">
                  {users.map(u => <SelectItem key={u.id} value={u.email} className="text-white">{u.data?.display_name || u.display_name || u.full_name || u.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label className="text-slate-300 text-xs">Area Responsibilities</Label>
            <div className="flex gap-2 mt-1">
              <Input value={newResp} onChange={e => setNewResp(e.target.value)} onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addResp())} className="bg-[#0a1128] border-slate-700 text-white" placeholder="Add responsibility..." />
              <Button onClick={addResp} size="icon" className="bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128]">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            {form.area_responsibilities.length > 0 && (
              <div className="mt-2 space-y-1">
                {form.area_responsibilities.map((resp, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-xs text-slate-300 bg-[#0a1128] rounded px-2 py-1">
                    <span className="flex items-center gap-1.5"><Check className="w-3 h-3 text-emerald-400" />{resp}</span>
                    <button type="button" onClick={() => removeResp(resp)} className="text-red-400 hover:text-red-300">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:justify-between w-full">
          {isEdit && (
            <Button variant="ghost" onClick={handleDelete} disabled={deleting} className="text-red-400 hover:text-red-300 hover:bg-red-900/20 gap-1 sm:mr-auto">
              <Trash2 className="w-4 h-4" />
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          )}
          <div className="flex gap-2 sm:ml-auto">
            <Button variant="outline" onClick={onClose} className="border-[#d4a843] text-[#0a1128] hover:bg-[#e0bb5e]">Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.name} className="bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] font-bold">
              {saving ? "Saving..." : isEdit ? "Save" : "Create Position"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}