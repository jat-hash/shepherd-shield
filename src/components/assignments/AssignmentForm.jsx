import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Check, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import ReminderSettings from "@/components/calendar/ReminderSettings";

export default function AssignmentForm({ open, onClose, onSaved, editData }) {
  const [form, setForm] = useState({
    position_name: "",
    service_date: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })(),
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
  const [deleting, setDeleting] = useState(false);
  const [users, setUsers] = useState([]);
  const [positions, setPositions] = useState([]);
  const [selectedResponsibilities, setSelectedResponsibilities] = useState([]);
  const [showNewPosition, setShowNewPosition] = useState(false);
  const [newPosition, setNewPosition] = useState({ name: "", description: "", area_responsibilities: [], default_radio_channel: "" });
  const [newResponsibility, setNewResponsibility] = useState("");
  const [reminders, setReminders] = useState([]);

  useEffect(() => {
    base44.functions.invoke("listUsers").then(res => setUsers(res?.data?.users || [])).catch(() => {});
    base44.entities.Position.filter({ is_active: true }).then(setPositions).catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    const defaultForm = {
      position_name: "",
      service_date: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })(),
      service_type: "",
      start_time: "09:00",
      end_time: "12:00",
      assigned_to_email: "",
      assigned_to_name: "",
      supervisor: "Wilbert Ryan",
      radio_channel: "",
      status: "Pending",
      area_responsibilities: "",
      notes: "",
    };
    if (editData) {
      setForm({ ...defaultForm, ...editData });
      setSelectedResponsibilities(editData.area_responsibilities ? editData.area_responsibilities.split(", ").filter(Boolean) : []);
      setReminders(editData.reminder_minutes ? [{ id: 1, minutes: editData.reminder_minutes }] : []);
    } else {
      setForm(defaultForm);
      setSelectedResponsibilities([]);
      setReminders([]);
    }
  }, [editData, open]);

  const handleSave = async () => {
    setSaving(true);
    const reminderMinutes = reminders[0]?.minutes || 0;
    const dataToSave = {
      ...form,
      area_responsibilities: selectedResponsibilities.join(", "),
      reminder_minutes: reminderMinutes
    };
    let assignmentId;
    if (editData?.id) {
      await base44.entities.Assignment.update(editData.id, dataToSave);
      assignmentId = editData.id;
    } else {
      const result = await base44.entities.Assignment.create(dataToSave);
      assignmentId = result.id;
    }
    
    // Create or update reminder
    if (reminderMinutes > 0) {
      await base44.functions.invoke('createOrUpdateCalendarReminder', {
        event_type: 'assignment',
        event_id: assignmentId,
        user_email: form.assigned_to_email,
        reminder_minutes: reminderMinutes,
        event_title: form.position_name,
        event_date: form.service_date,
        start_time: form.start_time
      }).catch(err => console.log('Reminder setup skipped:', err.message));
    }
    
    setSaving(false);
    onClose();
    onSaved?.();
  };

  const handleUserSelect = (email) => {
    const u = users.find(u => u.email === email);
    setForm({ ...form, assigned_to_email: email, assigned_to_name: u?.data?.display_name || u?.display_name || u?.full_name || email });
  };

  const handlePositionSelect = (positionName) => {
    const pos = positions.find(p => p.name === positionName);
    if (pos) {
      const assignedUser = pos.default_assigned_email
        ? users.find(u => u.email === pos.default_assigned_email)
        : null;
      setForm({
        ...form,
        position_name: pos.name,
        radio_channel: pos.default_radio_channel || form.radio_channel,
        assigned_to_email: pos.default_assigned_email || form.assigned_to_email,
        assigned_to_name: assignedUser?.data?.display_name || assignedUser?.display_name || assignedUser?.full_name || pos.default_assigned_name || form.assigned_to_name,
      });
      setSelectedResponsibilities(pos.area_responsibilities || []);
    } else {
      setForm({ ...form, position_name: positionName });
    }
  };

  const toggleResponsibility = (resp) => {
    setSelectedResponsibilities(prev =>
      prev.includes(resp) ? prev.filter(r => r !== resp) : [...prev, resp]
    );
  };

  const handleSaveNewPosition = async () => {
    await base44.entities.Position.create(newPosition);
    const updated = await base44.entities.Position.filter({ is_active: true });
    setPositions(updated);
    setShowNewPosition(false);
    setNewPosition({ name: "", description: "", area_responsibilities: [], default_radio_channel: "" });
  };

  const addNewResponsibilityToPosition = () => {
    if (newResponsibility.trim()) {
      setNewPosition({
        ...newPosition,
        area_responsibilities: [...newPosition.area_responsibilities, newResponsibility.trim()]
      });
      setNewResponsibility("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[#1a2744] border-slate-700 text-white w-[calc(100vw-2rem)] max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#d4a843]">{editData?.id ? "Edit" : "New"} Assignment</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-slate-300 text-xs">Position Name</Label>
              <Button onClick={() => setShowNewPosition(true)} size="sm" variant="ghost" className="text-[#d4a843] hover:text-[#e0bb5e] h-6 text-xs gap-1">
                <Plus className="w-3 h-3" /> New Position
              </Button>
            </div>
            {positions.length > 0 ? (
              <Select value={form.position_name} onValueChange={handlePositionSelect}>
                <SelectTrigger className="bg-[#0a1128] border-slate-700 text-white mt-1"><SelectValue placeholder="Select or enter position" /></SelectTrigger>
                <SelectContent className="bg-[#1a2744] border-slate-700">
                  {positions.map(p => <SelectItem key={p.id} value={p.name} className="text-white">{p.name}</SelectItem>)}
                  <SelectItem value="__custom__" className="text-[#d4a843]">+ Custom Position</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Input value={form.position_name} onChange={e => setForm({ ...form, position_name: e.target.value })} className="bg-[#0a1128] border-slate-700 text-white mt-1" placeholder="e.g. Main Entrance 1" />
            )}
            {form.position_name === "__custom__" && (
              <Input value={form.position_name} onChange={e => setForm({ ...form, position_name: e.target.value })} className="bg-[#0a1128] border-slate-700 text-white mt-2" placeholder="Enter custom position name" />
            )}
          </div>

          <div>
            <Label className="text-slate-300 text-xs">Service</Label>
            <Select value={form.service_type} onValueChange={v => setForm({ ...form, service_type: v })}>
              <SelectTrigger className="bg-[#0a1128] border-slate-700 text-white mt-1"><SelectValue placeholder="Select service type" /></SelectTrigger>
              <SelectContent className="bg-[#1a2744] border-slate-700">
                <SelectItem value="Sunday AM" className="text-white">Sunday AM</SelectItem>
                <SelectItem value="Sunday PM" className="text-white">Sunday PM</SelectItem>
                <SelectItem value="Tuesday Bible Study" className="text-white">Tuesday Bible Study</SelectItem>
                <SelectItem value="Thursday Services" className="text-white">Thursday Services</SelectItem>
              </SelectContent>
            </Select>
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
                  {users.map(u => <SelectItem key={u.id} value={u.email} className="text-white">{u.data?.display_name || u.display_name || u.full_name || u.email}</SelectItem>)}
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
            {positions.find(p => p.name === form.position_name)?.area_responsibilities?.length > 0 ? (
              <div className="mt-2 space-y-2">
                {positions.find(p => p.name === form.position_name).area_responsibilities.map(resp => (
                  <div key={resp} className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedResponsibilities.includes(resp)}
                      onCheckedChange={() => toggleResponsibility(resp)}
                      className="border-slate-600 data-[state=checked]:bg-[#d4a843] data-[state=checked]:border-[#d4a843]"
                    />
                    <label className="text-xs text-slate-300 cursor-pointer" onClick={() => toggleResponsibility(resp)}>
                      {resp}
                    </label>
                  </div>
                ))}
              </div>
            ) : (
              <Textarea value={selectedResponsibilities.join(", ")} onChange={e => setSelectedResponsibilities(e.target.value.split(", "))} className="bg-[#0a1128] border-slate-700 text-white mt-1" placeholder="Main entrance doors, front lobby..." rows={2} />
            )}
          </div>

          <div>
            <Label className="text-slate-300 text-xs">Notes</Label>
            <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="bg-[#0a1128] border-slate-700 text-white mt-1" rows={2} />
          </div>

          <div>
            <ReminderSettings reminders={reminders} onRemindersChange={setReminders} />
          </div>
        </div>

        <DialogFooter className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:justify-between w-full">
          {editData?.id && (
            <Button
              variant="ghost"
              onClick={async () => {
                if (!confirm("Delete this assignment?")) return;
                setDeleting(true);
                await base44.entities.Assignment.delete(editData.id);
                setDeleting(false);
                onSaved?.();
                onClose();
              }}
              disabled={deleting}
              className="text-red-400 hover:text-red-300 hover:bg-red-900/20 gap-1 sm:mr-auto"
            >
              <Trash2 className="w-4 h-4" />
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          )}
          <div className="flex gap-2 sm:ml-auto">
            <Button variant="outline" onClick={onClose} className="flex-1 sm:flex-none border-[#d4a843] text-[#0a1128] hover:bg-[#e0bb5e]">Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.position_name || !form.assigned_to_email} className="flex-1 sm:flex-none bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] font-bold">
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      {/* New Position Dialog */}
      <Dialog open={showNewPosition} onOpenChange={setShowNewPosition}>
        <DialogContent className="bg-[#1a2744] border-slate-700 text-white w-[calc(100vw-2rem)] max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#d4a843]">Create New Position</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-3">
            <div>
              <Label className="text-slate-300 text-xs">Position Name</Label>
              <Input value={newPosition.name} onChange={e => setNewPosition({ ...newPosition, name: e.target.value })} className="bg-[#0a1128] border-slate-700 text-white mt-1" placeholder="e.g. Main Entrance 1" />
            </div>
            
            <div>
              <Label className="text-slate-300 text-xs">Description</Label>
              <Textarea value={newPosition.description} onChange={e => setNewPosition({ ...newPosition, description: e.target.value })} className="bg-[#0a1128] border-slate-700 text-white mt-1" rows={2} />
            </div>
            
            <div>
              <Label className="text-slate-300 text-xs">Default Radio Channel</Label>
              <Input value={newPosition.default_radio_channel} onChange={e => setNewPosition({ ...newPosition, default_radio_channel: e.target.value })} className="bg-[#0a1128] border-slate-700 text-white mt-1" placeholder="e.g. CH 2" />
            </div>
            
            <div>
              <Label className="text-slate-300 text-xs">Area Responsibilities</Label>
              <div className="flex gap-2 mt-1">
                <Input value={newResponsibility} onChange={e => setNewResponsibility(e.target.value)} onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addNewResponsibilityToPosition())} className="bg-[#0a1128] border-slate-700 text-white" placeholder="Add responsibility..." />
                <Button onClick={addNewResponsibilityToPosition} size="icon" className="bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128]">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {newPosition.area_responsibilities.length > 0 && (
                <div className="mt-2 space-y-1">
                  {newPosition.area_responsibilities.map((resp, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-slate-300 bg-[#0a1128] rounded px-2 py-1">
                      <Check className="w-3 h-3 text-emerald-400" />
                      {resp}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewPosition(false)} className="border-[#d4a843] text-[#0a1128] hover:bg-[#e0bb5e]">Cancel</Button>
            <Button onClick={handleSaveNewPosition} disabled={!newPosition.name} className="bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] font-bold">
              Create Position
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}