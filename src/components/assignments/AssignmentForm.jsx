import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export default function AssignmentForm({ open, onClose, onSaved, editData }) {
  const [form, setForm] = useState({
    position_name: "",
    service_date: new Date().toISOString().split("T")[0],
    start_time: "09:00",
    end_time: "12:00",
    assigned_to_email: "",
    assigned_to_name: "",
    supervisor: "",
    radio_channel: "",
    status: "Pending",
    area_responsibilities: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState([]);

  useEffect(() => {
    base44.entities.User.list().then(setUsers).catch(() => {});
  }, []);

  useEffect(() => {
    if (editData) {
      setForm({ ...form, ...editData });
    } else {
      setForm({
        position_name: "",
        service_date: new Date().toISOString().split("T")[0],
        start_time: "09:00",
        end_time: "12:00",
        assigned_to_email: "",
        assigned_to_name: "",
        supervisor: "",
        radio_channel: "",
        status: "Pending",
        area_responsibilities: "",
        notes: "",
      });
    }
  }, [editData, open]);

  const handleSave = async () => {
    setSaving(true);
    if (editData?.id) {
      await base44.entities.Assignment.update(editData.id, form);
    } else {
      await base44.entities.Assignment.create(form);
    }
    setSaving(false);
    onSaved?.();
    onClose();
  };

  const handleUserSelect = (email) => {
    const u = users.find(u => u.email === email);
    setForm({ ...form, assigned_to_email: email, assigned_to_name: u?.full_name || email });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[#1a2744] border-slate-700 text-white max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#d4a843]">{editData ? "Edit" : "New"} Assignment</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-slate-300 text-xs">Position Name</Label>
            <Input value={form.position_name} onChange={e => setForm({ ...form, position_name: e.target.value })} className="bg-[#0a1128] border-slate-700 text-white mt-1" placeholder="e.g. Main Entrance 1" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-slate-300 text-xs">Date</Label>
              <Input type="date" value={form.service_date} onChange={e => setForm({ ...form, service_date: e.target.value })} className="bg-[#0a1128] border-slate-700 text-white mt-1" />
            </div>
            <div>
              <Label className="text-slate-300 text-xs">Status</Label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                <SelectTrigger className="bg-[#0a1128] border-slate-700 text-white mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-[#1a2744] border-slate-700">
                  {["Pending", "Confirmed", "Declined"].map(s => <SelectItem key={s} value={s} className="text-white">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-slate-300 text-xs">Start Time</Label>
              <Input type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} className="bg-[#0a1128] border-slate-700 text-white mt-1" />
            </div>
            <div>
              <Label className="text-slate-300 text-xs">End Time</Label>
              <Input type="time" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} className="bg-[#0a1128] border-slate-700 text-white mt-1" />
            </div>
          </div>

          <div>
            <Label className="text-slate-300 text-xs">Assigned To</Label>
            {users.length > 0 ? (
              <Select value={form.assigned_to_email} onValueChange={handleUserSelect}>
                <SelectTrigger className="bg-[#0a1128] border-slate-700 text-white mt-1"><SelectValue placeholder="Select team member" /></SelectTrigger>
                <SelectContent className="bg-[#1a2744] border-slate-700">
                  {users.map(u => <SelectItem key={u.id} value={u.email} className="text-white">{u.full_name || u.email}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <Input value={form.assigned_to_email} onChange={e => setForm({ ...form, assigned_to_email: e.target.value, assigned_to_name: e.target.value })} className="bg-[#0a1128] border-slate-700 text-white mt-1" placeholder="Email" />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-slate-300 text-xs">Supervisor</Label>
              <Input value={form.supervisor} onChange={e => setForm({ ...form, supervisor: e.target.value })} className="bg-[#0a1128] border-slate-700 text-white mt-1" />
            </div>
            <div>
              <Label className="text-slate-300 text-xs">Radio Channel</Label>
              <Input value={form.radio_channel} onChange={e => setForm({ ...form, radio_channel: e.target.value })} className="bg-[#0a1128] border-slate-700 text-white mt-1" placeholder="e.g. CH 2" />
            </div>
          </div>

          <div>
            <Label className="text-slate-300 text-xs">Area Responsibilities</Label>
            <Textarea value={form.area_responsibilities} onChange={e => setForm({ ...form, area_responsibilities: e.target.value })} className="bg-[#0a1128] border-slate-700 text-white mt-1" placeholder="Main entrance doors, front lobby..." rows={2} />
          </div>

          <div>
            <Label className="text-slate-300 text-xs">Notes</Label>
            <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="bg-[#0a1128] border-slate-700 text-white mt-1" rows={2} />
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={onClose} className="text-slate-400">Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.position_name || !form.assigned_to_email} className="bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] font-bold">
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}