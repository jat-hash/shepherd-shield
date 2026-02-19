import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Eye, Upload, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const statusColors = {
  Barred: "bg-red-500/20 text-red-400 border-red-500/30",
  "Medical Alert": "bg-amber-500/20 text-amber-400 border-amber-500/30",
  Monitor: "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

export default function WatchList() {
  const [persons, setPersons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  const [detailPerson, setDetailPerson] = useState(null);
  const [form, setForm] = useState({ full_name: "", status: "Monitor", description: "", notes: "", photo: "" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const all = await base44.entities.WatchListPerson.list("-created_date", 100);
    setPersons(all);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = filter === "all" ? persons : persons.filter(p => p.status === filter);

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setForm(prev => ({ ...prev, photo: file_url }));
  };

  const handleSave = async () => {
    setSaving(true);
    await base44.entities.WatchListPerson.create(form);
    setSaving(false);
    setFormOpen(false);
    setForm({ full_name: "", status: "Monitor", description: "", notes: "", photo: "" });
    load();
  };

  const handleDelete = async (id) => {
    await base44.entities.WatchListPerson.delete(id);
    setDetailPerson(null);
    load();
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 lg:ml-60 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Watch List</h1>
        <Button onClick={() => setFormOpen(true)} className="bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] font-bold text-sm gap-1">
          <Plus className="w-4 h-4" /> Add
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {["all", "Barred", "Medical Alert", "Monitor"].map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${filter === f ? "bg-[#d4a843] text-[#0a1128]" : "bg-[#1a2744] text-slate-400"}`}>
            {f === "all" ? "All" : f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-[#d4a843] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <Eye className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">No persons on the watch list</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(p => (
            <button key={p.id} onClick={() => setDetailPerson(p)} className="w-full text-left bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-4 flex items-center gap-4 hover:border-[#d4a843]/30 transition-all">
              <div className="w-14 h-14 rounded-xl bg-[#0a1128] border border-slate-700 overflow-hidden flex-shrink-0">
                {p.photo ? (
                  <img src={p.photo} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-600 text-lg font-bold">
                    {p.full_name?.charAt(0)}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-white">{p.full_name}</h3>
                <p className="text-xs text-slate-400 truncate mt-0.5">{p.description || "No description"}</p>
              </div>
              <span className={`px-2 py-1 rounded-full text-[10px] font-semibold border ${statusColors[p.status]}`}>
                {p.status}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Add Form */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="bg-[#1a2744] border-slate-700 text-white max-w-md">
          <DialogHeader><DialogTitle className="text-[#d4a843]">Add to Watch List</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-slate-300 text-xs">Full Name</Label>
              <Input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} className="bg-[#0a1128] border-slate-700 text-white mt-1" />
            </div>
            <div>
              <Label className="text-slate-300 text-xs">Status</Label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                <SelectTrigger className="bg-[#0a1128] border-slate-700 text-white mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-[#1a2744] border-slate-700">
                  {["Barred", "Medical Alert", "Monitor"].map(s => <SelectItem key={s} value={s} className="text-white">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-300 text-xs">Photo</Label>
              <label className="mt-1 flex items-center gap-2 cursor-pointer bg-[#0a1128] border border-dashed border-slate-600 rounded-lg p-3">
                <Upload className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-slate-400">{form.photo ? "Photo uploaded" : "Upload photo"}</span>
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
              </label>
            </div>
            <div>
              <Label className="text-slate-300 text-xs">Description</Label>
              <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="bg-[#0a1128] border-slate-700 text-white mt-1" rows={2} />
            </div>
            <div>
              <Label className="text-slate-300 text-xs">Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="bg-[#0a1128] border-slate-700 text-white mt-1" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFormOpen(false)} className="text-slate-400">Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.full_name} className="bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] font-bold">
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail View */}
      <Dialog open={!!detailPerson} onOpenChange={() => setDetailPerson(null)}>
        <DialogContent className="bg-[#1a2744] border-slate-700 text-white max-w-md">
          <DialogHeader><DialogTitle className="text-[#d4a843]">{detailPerson?.full_name}</DialogTitle></DialogHeader>
          {detailPerson && (
            <div className="space-y-4">
              {detailPerson.photo && (
                <div className="w-full h-48 rounded-xl overflow-hidden">
                  <img src={detailPerson.photo} alt="" className="w-full h-full object-cover" />
                </div>
              )}
              <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border ${statusColors[detailPerson.status]}`}>{detailPerson.status}</span>
              {detailPerson.description && <p className="text-sm text-slate-300">{detailPerson.description}</p>}
              {detailPerson.notes && (
                <div>
                  <p className="text-[10px] uppercase text-slate-500 tracking-wider mb-1">Notes</p>
                  <p className="text-sm text-slate-300">{detailPerson.notes}</p>
                </div>
              )}
              {detailPerson.last_seen_date && (
                <p className="text-xs text-slate-500">Last seen: {detailPerson.last_seen_date}</p>
              )}
              <Button onClick={() => handleDelete(detailPerson.id)} variant="destructive" className="w-full gap-2">
                <Trash2 className="w-4 h-4" /> Remove from Watch List
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}