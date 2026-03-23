import { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Wrench, CheckCircle, Upload, QrCode, Camera, FileText, LogIn, LogOut, Calendar, Pencil, Printer, WifiOff } from "lucide-react";
import useOfflineData from "@/hooks/useOfflineData";
import QRScanner from "@/components/equipment/QRScanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";

const CATEGORIES = ["Radio", "First Aid", "Safety Gear", "Camera", "Signage", "Other"];
const CONDITIONS = ["Good", "Fair", "Needs Repair", "Out of Service"];

const conditionColors = {
  Good: "bg-emerald-500/20 text-emerald-400",
  Fair: "bg-amber-500/20 text-amber-400",
  "Needs Repair": "bg-orange-500/20 text-orange-400",
  "Out of Service": "bg-red-500/20 text-red-400",
};

export default function EquipmentInventory() {
  const [formOpen, setFormOpen] = useState(false);
  const [detailItem, setDetailItem] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [form, setForm] = useState({ name: "", category: "Radio", serial_number: "", qr_code: "", assigned_to: "", condition: "Good", maintenance_frequency_days: 30, equipment_manual: "", maintenance_notes: "" });
  const [saving, setSaving] = useState(false);
  const [scanMode, setScanMode] = useState(false);
  const [cameraMode, setCameraMode] = useState(false);
  const [scannedCode, setScannedCode] = useState("");
  const [currentUser, setCurrentUser] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [qrPrintItem, setQrPrintItem] = useState(null);
  const qrRef = useRef(null);

  const fetchFn = useCallback(() => base44.entities.Equipment.list("-created_date", 200), []);
  const { data: items, loading, isOffline, reload: load } = useOfflineData("equipment", fetchFn, []);

  useEffect(() => { 
    base44.auth.me().then(setCurrentUser).catch(() => {});
    const unsub = base44.entities.Equipment.subscribe(() => load());
    return unsub;
  }, []);

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

  const handleScan = async (code) => {
    const searchCode = (code || scannedCode).trim();
    if (!searchCode) return;
    const found = items.find(i => i.qr_code === searchCode || i.serial_number === searchCode);
    if (found) {
      // Close scan dialog first, then open detail after a short delay
      // to let QRScanner unmount cleanly before showing result
      setCameraMode(false);
      setScannedCode("");
      setTimeout(() => {
        setScanMode(false);
        setDetailItem(found);
      }, 300);
    } else {
      toast.error("Equipment not found");
      setCameraMode(false);
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

  const handleEditSave = async () => {
    setSaving(true);
    await base44.entities.Equipment.update(detailItem.id, editForm);
    setSaving(false);
    setEditMode(false);
    setDetailItem({ ...detailItem, ...editForm });
    load();
    toast.success("Equipment updated");
  };

  const handlePrintQR = (item) => {
    setQrPrintItem(item);
    setTimeout(() => {
      const printWindow = window.open('', '_blank');
      const svgEl = document.getElementById('qr-print-svg');
      if (!svgEl || !printWindow) return;
      const svgHTML = svgEl.outerHTML;
      printWindow.document.write(`
        <html><head><title>QR - ${item.name}</title>
        <style>
          body { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; font-family: sans-serif; background: white; }
          .label { font-size: 18px; font-weight: bold; margin-top: 12px; }
          .sub { font-size: 13px; color: #555; margin-top: 4px; }
          svg { width: 200px; height: 200px; }
        </style></head>
        <body>
          ${svgHTML}
          <div class="label">${item.name}</div>
          ${item.serial_number ? `<div class="sub">SN: ${item.serial_number}</div>` : ''}
          <div class="sub">${item.qr_code}</div>
          <script>window.onload = () => { window.print(); window.close(); }</script>
        </body></html>
      `);
      printWindow.document.close();
    }, 100);
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
    <div className="max-w-2xl mx-auto px-3 py-4 lg:px-4 lg:py-6 lg:ml-60 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-lg sm:text-xl font-bold text-white">Equipment</h1>
          {isOffline && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-400">
              <WifiOff className="w-3 h-3" /> Offline
            </span>
          )}
        </div>
        <div className="flex gap-1 sm:gap-2">
          <Button onClick={() => { setScanMode(true); setCameraMode(true); }} variant="outline" className="border-[#d4a843] text-[#d4a843] hover:bg-[#d4a843]/10 text-xs sm:text-sm gap-1 h-8 sm:h-10 px-2 sm:px-3">
            <Camera className="w-3 h-3 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Check In / Out</span>
          </Button>
          {currentUser?.role === 'admin' && (
            <Button onClick={() => setFormOpen(true)} className="bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] font-bold text-xs sm:text-sm gap-1 h-8 sm:h-10 px-2 sm:px-4">
              <Plus className="w-3 h-3 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Add</span>
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar">
        {["all", ...CATEGORIES].map(c => (
          <button key={c} onClick={() => setCategoryFilter(c)} className={`px-2.5 sm:px-3 py-1.5 rounded-full text-[10px] sm:text-xs font-medium whitespace-nowrap transition-all ${categoryFilter === c ? "bg-[#d4a843] text-[#0a1128]" : "bg-[#1a2744] text-slate-400"}`}>
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

      {/* Hidden QR for printing */}
      {qrPrintItem && (
        <div className="hidden">
          <QRCodeSVG id="qr-print-svg" value={qrPrintItem.qr_code || qrPrintItem.id} size={200} />
        </div>
      )}

      {/* Detail */}
      <Dialog open={!!detailItem} onOpenChange={() => { setDetailItem(null); setEditMode(false); }}>
        <DialogContent className="bg-[#1a2744] border-slate-700 text-white max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#d4a843] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {detailItem?.name}
                {detailItem?.checked_out && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-500/20 text-orange-400">Checked Out</span>
                )}
              </div>
              {currentUser?.role === 'admin' && !editMode && (
                <Button size="sm" variant="ghost" className="text-slate-400 hover:text-white h-7 px-2" onClick={() => { setEditForm({ ...detailItem }); setEditMode(true); }}>
                  <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>
          {detailItem && (
            <div className="space-y-4">
              {editMode ? (
                <div className="space-y-3">
                  <div>
                    <Label className="text-slate-300 text-xs">Name</Label>
                    <Input value={editForm.name || ""} onChange={e => setEditForm({...editForm, name: e.target.value})} className="bg-[#0a1128] border-slate-700 text-white mt-1" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-slate-300 text-xs">Category</Label>
                      <Select value={editForm.category} onValueChange={v => setEditForm({...editForm, category: v})}>
                        <SelectTrigger className="bg-[#0a1128] border-slate-700 text-white mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-[#1a2744] border-slate-700">
                          {CATEGORIES.map(c => <SelectItem key={c} value={c} className="text-white">{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-slate-300 text-xs">Condition</Label>
                      <Select value={editForm.condition} onValueChange={v => setEditForm({...editForm, condition: v})}>
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
                      <Input value={editForm.serial_number || ""} onChange={e => setEditForm({...editForm, serial_number: e.target.value})} className="bg-[#0a1128] border-slate-700 text-white mt-1" />
                    </div>
                    <div>
                      <Label className="text-slate-300 text-xs">QR Code</Label>
                      <Input value={editForm.qr_code || ""} onChange={e => setEditForm({...editForm, qr_code: e.target.value})} className="bg-[#0a1128] border-slate-700 text-white mt-1" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-slate-300 text-xs">Assigned To</Label>
                    <Input value={editForm.assigned_to || ""} onChange={e => setEditForm({...editForm, assigned_to: e.target.value})} className="bg-[#0a1128] border-slate-700 text-white mt-1" />
                  </div>
                  <div>
                    <Label className="text-slate-300 text-xs">Maintenance Schedule (days)</Label>
                    <Input type="number" value={editForm.maintenance_frequency_days || ""} onChange={e => setEditForm({...editForm, maintenance_frequency_days: parseInt(e.target.value) || 0})} className="bg-[#0a1128] border-slate-700 text-white mt-1" />
                  </div>
                  <div>
                    <Label className="text-slate-300 text-xs">Maintenance Notes</Label>
                    <Textarea value={editForm.maintenance_notes || ""} onChange={e => setEditForm({...editForm, maintenance_notes: e.target.value})} className="bg-[#0a1128] border-slate-700 text-white mt-1" rows={2} />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button variant="ghost" onClick={() => setEditMode(false)} className="text-slate-400 flex-1">Cancel</Button>
                    <Button onClick={handleEditSave} disabled={saving || !editForm.name} className="bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] font-bold flex-1">
                      {saving ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </div>
              ) : (
              <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-slate-500 text-xs">Category</span><p className="text-white">{detailItem.category}</p></div>
                <div><span className="text-slate-500 text-xs">Condition</span><p className={`font-semibold ${detailItem.condition === "Good" ? "text-emerald-400" : detailItem.condition === "Fair" ? "text-amber-400" : "text-red-400"}`}>{detailItem.condition}</p></div>
                {detailItem.serial_number && <div><span className="text-slate-500 text-xs">Serial</span><p className="text-white font-mono text-xs">{detailItem.serial_number}</p></div>}
                {detailItem.qr_code && <div><span className="text-slate-500 text-xs">QR Code</span><p className="text-white font-mono text-xs">{detailItem.qr_code}</p></div>}
                {detailItem.assigned_to && <div><span className="text-slate-500 text-xs">Assigned</span><p className="text-white">{detailItem.assigned_to}</p></div>}
                {detailItem.checked_out && detailItem.checked_out_by && (
                  <div className="col-span-2">
                    <span className="text-slate-500 text-xs">Checked Out By</span>
                    <p className="text-orange-400">{detailItem.checked_out_by}</p>
                    <p className="text-[10px] text-slate-500">{new Date(detailItem.checked_out_at).toLocaleString()}</p>
                  </div>
                )}
              </div>

              {detailItem.maintenance_frequency_days && (
                <div className="bg-[#0a1128] rounded-lg p-3 border border-slate-700">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="w-4 h-4 text-[#d4a843]" />
                    <span className="text-xs font-semibold text-slate-300">Maintenance Schedule</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-500">Frequency</span>
                      <p className="text-white">Every {detailItem.maintenance_frequency_days} days</p>
                    </div>
                    {detailItem.last_inspection_date && (
                      <div>
                        <span className="text-slate-500">Last Done</span>
                        <p className="text-white">{detailItem.last_inspection_date}</p>
                      </div>
                    )}
                    {detailItem.next_maintenance_date && (
                      <div className="col-span-2">
                        <span className="text-slate-500">Next Due</span>
                        <p className={new Date(detailItem.next_maintenance_date) < new Date() ? "text-orange-400 font-semibold" : "text-emerald-400"}>
                          {detailItem.next_maintenance_date}
                          {new Date(detailItem.next_maintenance_date) < new Date() && " (Overdue)"}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {detailItem.equipment_manual && (
                <a href={detailItem.equipment_manual} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-[#0a1128] rounded-lg p-3 border border-slate-700 hover:border-[#d4a843]/50 transition-colors">
                  <FileText className="w-4 h-4 text-[#d4a843]" />
                  <span className="text-sm text-white">View Equipment Manual</span>
                </a>
              )}

              {detailItem.maintenance_notes && (
                <div>
                  <span className="text-slate-500 text-xs">Maintenance Notes</span>
                  <p className="text-white text-sm mt-1 bg-[#0a1128] rounded-lg p-3 border border-slate-700">{detailItem.maintenance_notes}</p>
                </div>
              )}

              {detailItem.usage_history?.length > 0 && (
                <div>
                  <span className="text-slate-500 text-xs block mb-2">Usage History</span>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {detailItem.usage_history.slice(-5).reverse().map((entry, i) => (
                      <div key={i} className="text-xs bg-[#0a1128] rounded p-2 border border-slate-700">
                        <span className={entry.action === "check-out" ? "text-orange-400" : "text-emerald-400"}>{entry.action}</span>
                        <span className="text-slate-500"> by {entry.user}</span>
                        <span className="text-slate-600 ml-2">{new Date(entry.timestamp).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* QR Code Section */}
              {detailItem.qr_code && (
                <div className="bg-[#0a1128] rounded-lg p-4 border border-slate-700 flex flex-col items-center gap-3">
                  <QRCodeSVG value={detailItem.qr_code} size={120} bgColor="#0a1128" fgColor="#d4a843" />
                  <p className="text-xs text-slate-400 font-mono">{detailItem.qr_code}</p>
                  <Button onClick={() => handlePrintQR(detailItem)} variant="outline" size="sm" className="border-[#d4a843] text-[#d4a843] hover:bg-[#d4a843]/10 gap-2">
                    <Printer className="w-3.5 h-3.5" /> Print QR Label
                  </Button>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                {detailItem.checked_out ? (
                  <Button onClick={() => handleCheckIn(detailItem)} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm">
                    <LogIn className="w-4 h-4 mr-2" /> Check In
                  </Button>
                ) : (
                  <Button onClick={() => handleCheckOut(detailItem)} className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-bold text-sm">
                    <LogOut className="w-4 h-4 mr-2" /> Check Out
                  </Button>
                )}
                <Button onClick={() => markInspected(detailItem.id, detailItem)} variant="outline" className="border-[#d4a843] text-[#d4a843] hover:bg-[#d4a843]/10 text-sm">
                  <CheckCircle className="w-4 h-4 mr-2" /> Inspect
                </Button>
              </div>
              </div>
              )}
            </div>
          )}

        </DialogContent>
      </Dialog>

      {/* Scan Mode */}
      <Dialog open={scanMode} onOpenChange={(open) => { setScanMode(open); if (!open) { setCameraMode(false); setScannedCode(""); } }}>
        <DialogContent className="bg-[#1a2744] border-slate-700 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[#d4a843] flex items-center gap-2">
              <QrCode className="w-5 h-5" />
              Scan Equipment QR
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {cameraMode ? (
              <>
                <QRScanner
                  onScan={(code) => handleScan(code)}
                  onClose={() => setCameraMode(false)}
                />
                <button onClick={() => setCameraMode(false)} className="text-xs text-slate-400 underline w-full text-center">
                  Enter code manually instead
                </button>
              </>
            ) : (
              <>
                <Button
                  onClick={() => setCameraMode(true)}
                  className="w-full bg-[#0a1128] border border-dashed border-slate-600 hover:border-[#d4a843]/50 text-slate-300 h-20 flex-col gap-2"
                  variant="ghost"
                >
                  <Camera className="w-8 h-8 text-[#d4a843]" />
                  <span className="text-xs">Tap to open camera</span>
                </Button>
                <div>
                  <Label className="text-slate-300 text-xs">Or enter QR Code / Serial Number manually</Label>
                  <Input
                    value={scannedCode}
                    onChange={e => setScannedCode(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleScan()}
                    className="bg-[#0a1128] border-slate-700 text-white mt-1"
                    placeholder="Enter code..."
                    autoFocus
                  />
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => { setScanMode(false); setScannedCode(""); }} className="text-slate-400">Cancel</Button>
                  <Button onClick={() => handleScan()} disabled={!scannedCode.trim()} className="bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] font-bold">
                    Find Equipment
                  </Button>
                </DialogFooter>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}