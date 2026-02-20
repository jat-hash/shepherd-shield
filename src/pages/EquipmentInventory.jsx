import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Wrench, CheckCircle, Upload, QrCode, Camera, FileText, LogIn, LogOut, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

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
  const [form, setForm] = useState({ name: "", category: "Radio", serial_number: "", qr_code: "", assigned_to: "", condition: "Good", maintenance_frequency_days: 30, equipment_manual: "", maintenance_notes: "" });
  const [saving, setSaving] = useState(false);
  const [scanMode, setScanMode] = useState(false);
  const [scannedCode, setScannedCode] = useState("");

  const load = async () => {
    setLoading(true);
    const all = await base44.entities.Equipment.list("-created_date", 200);
    setItems(all);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = categoryFilter === "all" ? items : items.filter(i => i.category === categoryFilter);

  const handleManualUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setForm(prev => ({ ...prev, equipment_manual: file_url }));
    toast.success("Manual uploaded");
  };

  const handleSave = async () => {
    setSaving(true);
    const nextMaintenance = form.maintenance_frequency_days 
      ? new Date(Date.now() + form.maintenance_frequency_days * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
      : null;
    await base44.entities.Equipment.create({
      ...form,
      next_maintenance_date: nextMaintenance,
      last_inspection_date: new Date().toISOString().split("T")[0]
    });
    setSaving(false);
    setFormOpen(false);
    setForm({ name: "", category: "Radio", serial_number: "", qr_code: "", assigned_to: "", condition: "Good", maintenance_frequency_days: 30, equipment_manual: "", maintenance_notes: "" });
    load();
    toast.success("Equipment added");
  };

  const generateQRCode = () => {
    const code = `EQ-${Date.now().toString(36).toUpperCase()}`;
    setForm(prev => ({ ...prev, qr_code: code }));
    toast.success("QR Code generated");
  };

  const handleScan = async () => {
    if (!scannedCode.trim()) return;
    const found = items.find(i => i.qr_code === scannedCode.trim() || i.serial_number === scannedCode.trim());
    if (found) {
      setDetailItem(found);
      setScanMode(false);
      setScannedCode("");
    } else {
      toast.error("Equipment not found");
    }
  };

  const handleCheckOut = async (item) => {
    const user = await base44.auth.me();
    await base44.entities.Equipment.update(item.id, {
      checked_out: true,
      checked_out_by: user.full_name || user.email,
      checked_out_at: new Date().toISOString(),
      usage_history: [
        ...(item.usage_history || []),
        { action: "check-out", user: user.full_name || user.email, timestamp: new Date().toISOString() }
      ]
    });
    toast.success("Equipment checked out");
    setDetailItem(null);
    load();
  };

  const handleCheckIn = async (item) => {
    const user = await base44.auth.me();
    await base44.entities.Equipment.update(item.id, {
      checked_out: false,
      checked_out_by: null,
      checked_out_at: null,
      usage_history: [
        ...(item.usage_history || []),
        { action: "check-in", user: user.full_name || user.email, timestamp: new Date().toISOString() }
      ]
    });
    toast.success("Equipment checked in");
    setDetailItem(null);
    load();
  };

  const markInspected = async (id, item) => {
    const today = new Date().toISOString().split("T")[0];
    const nextMaintenance = item.maintenance_frequency_days
      ? new Date(Date.now() + item.maintenance_frequency_days * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
      : null;
    await base44.entities.Equipment.update(id, { 
      last_inspection_date: today,
      next_maintenance_date: nextMaintenance
    });
    toast.success("Inspection recorded");
    setDetailItem(null);
    load();
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 lg:ml-60 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Equipment</h1>
        <div className="flex gap-2">
          <Button onClick={() => setScanMode(true)} variant="outline" className="border-[#d4a843] text-[#d4a843] hover:bg-[#d4a843]/10 text-sm gap-1">
            <QrCode className="w-4 h-4" /> Scan
          </Button>
          <Button onClick={() => setFormOpen(true)} className="bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] font-bold text-sm gap-1">
            <Plus className="w-4 h-4" /> Add
          </Button>
        </div>
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
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white">{item.name}</h3>
                    {item.checked_out && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-500/20 text-orange-400">Out</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {item.checked_out ? `Checked out by: ${item.checked_out_by}` : item.assigned_to ? `Assigned: ${item.assigned_to}` : "Available"}
                    {item.serial_number && ` • SN: ${item.serial_number}`}
                  </p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${conditionColors[item.condition]}`}>{item.condition}</span>
              </div>
              <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-500">
                {item.last_inspection_date && (
                  <span>Inspected: {item.last_inspection_date}</span>
                )}
                {item.next_maintenance_date && (
                  <span className={new Date(item.next_maintenance_date) < new Date() ? "text-orange-400" : ""}>
                    Next: {item.next_maintenance_date}
                  </span>
                )}
              </div>
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-slate-300 text-xs">Serial Number</Label>
                <Input value={form.serial_number} onChange={e => setForm({ ...form, serial_number: e.target.value })} className="bg-[#0a1128] border-slate-700 text-white mt-1" />
              </div>
              <div>
                <Label className="text-slate-300 text-xs">QR Code</Label>
                <div className="flex gap-1 mt-1">
                  <Input value={form.qr_code} onChange={e => setForm({ ...form, qr_code: e.target.value })} className="bg-[#0a1128] border-slate-700 text-white flex-1" placeholder="Auto" />
                  <Button type="button" onClick={generateQRCode} size="sm" variant="outline" className="border-slate-700 text-slate-400">
                    <QrCode className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
            <div>
              <Label className="text-slate-300 text-xs">Assigned To</Label>
              <Input value={form.assigned_to} onChange={e => setForm({ ...form, assigned_to: e.target.value })} className="bg-[#0a1128] border-slate-700 text-white mt-1" />
            </div>
            <div>
              <Label className="text-slate-300 text-xs">Maintenance Schedule (days)</Label>
              <Input type="number" value={form.maintenance_frequency_days} onChange={e => setForm({ ...form, maintenance_frequency_days: parseInt(e.target.value) || 0 })} className="bg-[#0a1128] border-slate-700 text-white mt-1" placeholder="e.g. 30" />
            </div>
            <div>
              <Label className="text-slate-300 text-xs">Equipment Manual/Guide</Label>
              <label className="mt-1 flex items-center gap-2 cursor-pointer bg-[#0a1128] border border-dashed border-slate-600 rounded-lg p-3 hover:border-[#d4a843]/40 transition-colors">
                <Upload className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-slate-400">{form.equipment_manual ? "Manual uploaded ✓" : "Upload PDF manual"}</span>
                <input type="file" accept=".pdf" className="hidden" onChange={handleManualUpload} />
              </label>
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