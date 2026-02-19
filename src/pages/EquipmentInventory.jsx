import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Wrench, CheckCircle, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const CATEGORIES = ["Radio", "First Aid", "Safety Gear", "Camera", "Signage", "Other"];
const CONDITIONS = ["Good", "Fair", "Needs Repair", "Out of Service"];

const conditionColors = {
  Good: "bg-emerald-500/20 text-emerald-400",
  Fair: "bg-amber-500/20 text-amber-400",
  "Needs Repair": "bg-orange-500/20 text-orange-400",
  "Out of Service": "bg-red-500/20 text-red-400",
};

export default function EquipmentInventory() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [detailItem, setDetailItem] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [form, setForm] = useState({ name: "", category: "Radio", serial_number: "", assigned_to: "", condition: "Good", last_inspection_date: "", maintenance_notes: "", inspection_photo: "" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const all = await base44.entities.Equipment.list("-created_date", 200);
    setItems(all);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = categoryFilter === "all" ? items : items.filter(i => i.category === categoryFilter);

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setForm(prev => ({ ...prev, inspection_photo: file_url }));
  };

  const handleSave = async () => {
    setSaving(true);
    await base44.entities.Equipment.create(form);
    setSaving(false);
    setFormOpen(false);
    setForm({ name: "", category: "Radio", serial_number: "", assigned_to: "", condition: "Good", last_inspection_date: "", maintenance_notes: "", inspection_photo: "" });
    load();
  };

  const markInspected = async (id) => {
    await base44.entities.Equipment.update(id, { last_inspection_date: new Date().toISOString().split("T")[0] });
    setDetailItem(null);
    load();
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 lg:ml-60 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Equipment</h1>
        <Button onClick={() => setFormOpen(true)} className="bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] font-bold text-sm gap-1">
          <Plus className="w-4 h-4" /> Add Item
        </Button>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {["all", ...CATEGORIES].map(c => (
          <button key={c} onClick={() => setCategoryFilter(c)} className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${categoryFilter === c ? "bg-[#d4a843] text-[#0a1128]" : "bg-[#1a2744] text-slate-400"}`}>
            {c === "all" ? "All" : c}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-[#d4a843] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <Wrench className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">No equipment found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(item => (
            <button key={item.id} onClick={() => setDetailItem(item)} className="w-full text-left bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-4 hover:border-[#d4a843]/30 transition-all">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">{item.name}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {item.assigned_to ? `Assigned: ${item.assigned_to}` : "Unassigned"}
                    {item.serial_number && ` • SN: ${item.serial_number}`}
                  </p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${conditionColors[item.condition]}`}>{item.condition}</span>
              </div>
              {item.last_inspection_date && (
                <p className="text-[10px] text-slate-500 mt-2">Last inspected: {item.last_inspection_date}</p>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Add Form */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="bg-[#1a2744] border-slate-700 text-white max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-[#d4a843]">Add Equipment</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-slate-300 text-xs">Name</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="bg-[#0a1128] border-slate-700 text-white mt-1" placeholder="e.g. Radio #12" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-slate-300 text-xs">Category</Label>
                <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                  <SelectTrigger className="bg-[#0a1128] border-slate-700 text-white mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-[#1a2744] border-slate-700">
                    {CATEGORIES.map(c => <SelectItem key={c} value={c} className="text-white">{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-slate-300 text-xs">Condition</Label>
                <Select value={form.condition} onValueChange={v => setForm({ ...form, condition: v })}>
                  <SelectTrigger className="bg-[#0a1128] border-slate-700 text-white mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-[#1a2744] border-slate-700">
                    {CONDITIONS.map(c => <SelectItem key={c} value={c} className="text-white">{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-slate-300 text-xs">Serial Number</Label>
              <Input value={form.serial_number} onChange={e => setForm({ ...form, serial_number: e.target.value })} className="bg-[#0a1128] border-slate-700 text-white mt-1" />
            </div>
            <div>
              <Label className="text-slate-300 text-xs">Assigned To</Label>
              <Input value={form.assigned_to} onChange={e => setForm({ ...form, assigned_to: e.target.value })} className="bg-[#0a1128] border-slate-700 text-white mt-1" />
            </div>
            <div>
              <Label className="text-slate-300 text-xs">Maintenance Notes</Label>
              <Textarea value={form.maintenance_notes} onChange={e => setForm({ ...form, maintenance_notes: e.target.value })} className="bg-[#0a1128] border-slate-700 text-white mt-1" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFormOpen(false)} className="text-slate-400">Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.name} className="bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] font-bold">
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail */}
      <Dialog open={!!detailItem} onOpenChange={() => setDetailItem(null)}>
        <DialogContent className="bg-[#1a2744] border-slate-700 text-white max-w-md">
          <DialogHeader><DialogTitle className="text-[#d4a843]">{detailItem?.name}</DialogTitle></DialogHeader>
          {detailItem && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-slate-500 text-xs">Category</span><p className="text-white">{detailItem.category}</p></div>
                <div><span className="text-slate-500 text-xs">Condition</span><p className={conditionColors[detailItem.condition]?.split(" ")[1]}>{detailItem.condition}</p></div>
                <div><span className="text-slate-500 text-xs">Serial #</span><p className="text-white">{detailItem.serial_number || "N/A"}</p></div>
                <div><span className="text-slate-500 text-xs">Assigned To</span><p className="text-white">{detailItem.assigned_to || "Unassigned"}</p></div>
              </div>
              {detailItem.last_inspection_date && (
                <p className="text-xs text-slate-400">Last inspection: {detailItem.last_inspection_date}</p>
              )}
              {detailItem.maintenance_notes && (
                <div><span className="text-slate-500 text-xs">Notes</span><p className="text-sm text-slate-300">{detailItem.maintenance_notes}</p></div>
              )}
              <Button onClick={() => markInspected(detailItem.id)} className="w-full bg-emerald-600 hover:bg-emerald-500 font-bold gap-2">
                <CheckCircle className="w-4 h-4" /> Mark Inspected
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}