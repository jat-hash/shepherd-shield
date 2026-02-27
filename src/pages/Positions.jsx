import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Pencil, Trash2, Check, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export default function Positions() {
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editData, setEditData] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    area_responsibilities: [],
    default_radio_channel: "",
    is_active: true,
    auto_rotate: false
  });
  const [newResponsibility, setNewResponsibility] = useState("");
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assigningPosition, setAssigningPosition] = useState(null);
  const [selectedMemberEmail, setSelectedMemberEmail] = useState("");

  useEffect(() => {
    loadPositions();
    base44.auth.me().then(u => {
      setCurrentUser(u);
      base44.functions.invoke('listUsers').then(res => setUsers(res.data?.users || [])).catch(() => {});
    }).catch(() => {});
  }, []);

  const loadPositions = async () => {
    setLoading(true);
    const data = await base44.entities.Position.list("-created_date");
    setPositions(data);
    setLoading(false);
  };

  const openForm = (position = null) => {
    if (position) {
      setEditData(position);
      setForm({
        name: position.name || "",
        description: position.description || "",
        area_responsibilities: position.area_responsibilities || [],
        default_radio_channel: position.default_radio_channel || "",
        is_active: position.is_active ?? true,
        auto_rotate: position.auto_rotate ?? false
      });
    } else {
      setEditData(null);
      setForm({
        name: "",
        description: "",
        area_responsibilities: [],
        default_radio_channel: "",
        is_active: true,
        auto_rotate: false
      });
    }
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Position name is required");
      return;
    }

    try {
      if (editData) {
        await base44.entities.Position.update(editData.id, form);
        toast.success("Position updated");
      } else {
        await base44.entities.Position.create(form);
        toast.success("Position created");
      }
      loadPositions();
      setFormOpen(false);
    } catch (error) {
      toast.error("Failed to save position");
    }
  };

  const handleDelete = async () => {
    try {
      await base44.entities.Position.delete(deleteId);
      toast.success("Position deleted");
      loadPositions();
      setDeleteOpen(false);
      setDeleteId(null);
    } catch (error) {
      toast.error("Failed to delete position");
    }
  };

  const addResponsibility = () => {
    if (newResponsibility.trim()) {
      setForm({
        ...form,
        area_responsibilities: [...form.area_responsibilities, newResponsibility.trim()]
      });
      setNewResponsibility("");
    }
  };

  const removeResponsibility = (index) => {
    setForm({
      ...form,
      area_responsibilities: form.area_responsibilities.filter((_, i) => i !== index)
    });
  };

  const handleAssignMember = async () => {
    if (!assigningPosition) return;
    const member = users.find(u => u.email === selectedMemberEmail);
    try {
      await base44.entities.Position.update(assigningPosition.id, {
        default_assigned_email: selectedMemberEmail || null,
        default_assigned_name: member?.full_name || selectedMemberEmail || null
      });
      toast.success(selectedMemberEmail ? "Member assigned to position" : "Member removed from position");
      setAssignDialogOpen(false);
      setAssigningPosition(null);
      setSelectedMemberEmail("");
      loadPositions();
    } catch (error) {
      toast.error("Failed to assign member");
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 lg:ml-60 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Position Management</h1>
          <p className="text-slate-400 text-sm mt-1">Manage security team positions and responsibilities</p>
        </div>
        {currentUser?.role === 'admin' && (
          <Button onClick={() => openForm()} className="bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] font-bold gap-2">
            <Plus className="w-4 h-4" /> Add Position
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-[#d4a843] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : positions.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-slate-500 text-sm">No positions yet. Create your first position.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {positions.map(pos => (
            <div key={pos.id} className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white">{pos.name}</h3>
                    {pos.auto_rotate && (
                      <span className="text-[9px] bg-[#d4a843]/20 text-[#d4a843] px-2 py-0.5 rounded-full font-semibold">
                        AUTO-ROTATE
                      </span>
                    )}
                    {!pos.is_active && (
                      <span className="text-[9px] bg-slate-700 text-slate-400 px-2 py-0.5 rounded-full font-semibold">
                        INACTIVE
                      </span>
                    )}
                  </div>
                  {pos.description && (
                    <p className="text-xs text-slate-400 mt-1">{pos.description}</p>
                  )}
                  {pos.default_radio_channel && (
                    <p className="text-xs text-[#d4a843] mt-1">Radio: {pos.default_radio_channel}</p>
                  )}
                  {pos.area_responsibilities?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {pos.area_responsibilities.map((resp, i) => (
                        <span key={i} className="text-[10px] bg-[#0a1128] text-slate-300 px-2 py-0.5 rounded border border-slate-700">
                          {resp}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {currentUser?.role === 'admin' && (
                  <div className="flex gap-1 ml-3">
                    <Button onClick={() => openForm(pos)} size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-[#d4a843]">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button onClick={() => { setDeleteId(pos.id); setDeleteOpen(true); }} size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-red-400">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Assigned Member */}
              <div className="mt-3 pt-3 border-t border-slate-700/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  {pos.default_assigned_name ? (
                    <span className="text-xs text-slate-200">{pos.default_assigned_name}</span>
                  ) : (
                    <span className="text-xs text-slate-500 italic">No member assigned</span>
                  )}
                </div>
                {currentUser?.role === 'admin' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setAssigningPosition(pos);
                      setSelectedMemberEmail(pos.default_assigned_email || "");
                      setAssignDialogOpen(true);
                    }}
                    className="h-6 text-xs text-[#d4a843] hover:text-[#e0bb5e] hover:bg-white/5"
                  >
                    {pos.default_assigned_email ? "Change" : "Assign Member"}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="bg-[#1a2744] border-slate-700 text-white max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#d4a843]">{editData ? "Edit Position" : "Create Position"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-slate-300 text-xs">Position Name *</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="bg-[#0a1128] border-slate-700 text-white mt-1" placeholder="e.g. Main Entrance 1" />
            </div>

            <div>
              <Label className="text-slate-300 text-xs">Description</Label>
              <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="bg-[#0a1128] border-slate-700 text-white mt-1" rows={2} placeholder="Brief description of the position..." />
            </div>

            <div>
              <Label className="text-slate-300 text-xs">Default Radio Channel</Label>
              <Input value={form.default_radio_channel} onChange={e => setForm({ ...form, default_radio_channel: e.target.value })} className="bg-[#0a1128] border-slate-700 text-white mt-1" placeholder="e.g. CH 2" />
            </div>

            <div>
              <Label className="text-slate-300 text-xs">Area Responsibilities</Label>
              <div className="flex gap-2 mt-1">
                <Input value={newResponsibility} onChange={e => setNewResponsibility(e.target.value)} onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addResponsibility())} className="bg-[#0a1128] border-slate-700 text-white" placeholder="Add responsibility..." />
                <Button onClick={addResponsibility} size="icon" className="bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128]">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {form.area_responsibilities.length > 0 && (
                <div className="mt-2 space-y-1">
                  {form.area_responsibilities.map((resp, i) => (
                    <div key={i} className="flex items-center justify-between text-xs text-slate-300 bg-[#0a1128] rounded px-2 py-1.5 border border-slate-700">
                      <div className="flex items-center gap-2">
                        <Check className="w-3 h-3 text-emerald-400" />
                        {resp}
                      </div>
                      <button onClick={() => removeResponsibility(i)} className="text-red-400 hover:text-red-300">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-6 pt-2">
              <div className="flex items-center gap-2">
                <Checkbox checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} className="border-slate-600 data-[state=checked]:bg-[#d4a843] data-[state=checked]:border-[#d4a843]" />
                <Label className="text-slate-300 text-xs cursor-pointer" onClick={() => setForm({ ...form, is_active: !form.is_active })}>Active Position</Label>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox checked={form.auto_rotate} onCheckedChange={v => setForm({ ...form, auto_rotate: v })} className="border-slate-600 data-[state=checked]:bg-[#d4a843] data-[state=checked]:border-[#d4a843]" />
                <Label className="text-slate-300 text-xs cursor-pointer" onClick={() => setForm({ ...form, auto_rotate: !form.auto_rotate })}>Auto-Rotate</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} className="border-[#d4a843] text-[#0a1128] hover:bg-[#e0bb5e]">Cancel</Button>
            <Button onClick={handleSave} className="bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] font-bold">
              {editData ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Member Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="bg-[#1a2744] border-slate-700 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[#d4a843]">Assign Member — {assigningPosition?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-slate-300 text-xs">Select Team Member</Label>
              <Select value={selectedMemberEmail} onValueChange={setSelectedMemberEmail}>
                <SelectTrigger className="bg-[#0a1128] border-slate-700 text-white mt-1">
                  <SelectValue placeholder="Choose a member" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a2744] border-slate-700">
                  <SelectItem value="__none__" className="text-slate-400">— No member —</SelectItem>
                  {users.map(u => (
                    <SelectItem key={u.id} value={u.email} className="text-white">
                      {u.full_name || u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)} className="border-[#d4a843] text-[#0a1128] hover:bg-[#e0bb5e]">Cancel</Button>
            <Button
              onClick={() => {
                const email = selectedMemberEmail === "__none__" ? "" : selectedMemberEmail;
                const member = users.find(u => u.email === email);
                base44.entities.Position.update(assigningPosition.id, {
                  default_assigned_email: email || null,
                  default_assigned_name: member?.full_name || email || null
                }).then(() => {
                  toast.success(email ? "Member assigned" : "Member removed");
                  setAssignDialogOpen(false);
                  setAssigningPosition(null);
                  setSelectedMemberEmail("");
                  loadPositions();
                }).catch(() => toast.error("Failed to assign member"));
              }}
              className="bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] font-bold"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="bg-[#1a2744] border-slate-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#d4a843]">Delete Position?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              This will permanently delete this position. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[#d4a843] text-[#0a1128] hover:bg-[#e0bb5e]">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-white">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}