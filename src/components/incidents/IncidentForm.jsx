import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Upload, X, FileText } from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = ["Suspicious Activity", "Medical Emergency", "Disruptive Behavior", "Theft", "Trespassing", "Unsecured Property", "Weather Emergency", "Facility Issue", "Other"];
const SEVERITIES = ["Low", "Medium", "High", "Critical"];
const STATUSES = ["Open", "In Progress", "Resolved", "Closed"];

export default function IncidentForm({ open, onClose, onSaved, incident }) {
  const isEditing = !!incident;
  const [form, setForm] = useState({
    title: "",
    category: "",
    location: "",
    severity: "",
    description: "",
    people_involved: "",
    status: "Open",
    incident_date: new Date().toISOString().split("T")[0],
    attachments: [],
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (open) {
      if (incident) {
        setForm({
          title: incident.title || "",
          category: incident.category || "",
          location: incident.location || "",
          severity: incident.severity || "",
          description: incident.description || "",
          people_involved: incident.people_involved || "",
          status: incident.status || "Open",
          incident_date: incident.incident_date || new Date().toISOString().split("T")[0],
          attachments: incident.attachments || [],
        });
      } else {
        setForm({
          title: "",
          category: "",
          location: "",
          severity: "",
          description: "",
          people_involved: "",
          status: "Open",
          incident_date: new Date().toISOString().split("T")[0],
          attachments: [],
        });
      }
    }
  }, [open, incident]);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSize = 20 * 1024 * 1024; // 20MB
    if (file.size > maxSize) {
      toast.error("File size must be less than 20MB");
      return;
    }

    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setForm(prev => ({ ...prev, attachments: [...prev.attachments, file_url] }));
      toast.success("File uploaded");
    } catch (error) {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = (index) => {
    setForm(prev => ({
      ...prev,
      attachments: prev.attachments.filter((_, i) => i !== index)
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    if (isEditing) {
      await base44.entities.Incident.update(incident.id, form);
    } else {
      const user = await base44.auth.me();
      await base44.entities.Incident.create({
        ...form,
        reported_by: user?.data?.display_name || user?.display_name || user?.full_name || user?.email || "Unknown",
      });
    }
    setSaving(false);
    onSaved?.();
    onClose();
  };

  const severityColors = {
    Low: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    Medium: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    High: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    Critical: "bg-red-500/20 text-red-400 border-red-500/30",
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[#1a2744] border-slate-700 text-white w-[calc(100vw-2rem)] max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#d4a843]">{isEditing ? "Edit Incident Report" : "New Incident Report"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-slate-300 text-xs">Title</Label>
            <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="bg-[#0a1128] border-slate-700 text-white mt-1" placeholder="Brief incident title" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-slate-300 text-xs">Category</Label>
              <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                <SelectTrigger className="bg-[#0a1128] border-slate-700 text-white mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent className="bg-[#1a2744] border-slate-700">
                  {CATEGORIES.map(c => <SelectItem key={c} value={c} className="text-white">{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-300 text-xs">Location</Label>
              <Input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} className="bg-[#0a1128] border-slate-700 text-white mt-1" placeholder="e.g. Parking Lot A" />
            </div>
          </div>

          <div>
            <Label className="text-slate-300 text-xs mb-2 block">Severity</Label>
            <div className="grid grid-cols-4 gap-2">
              {SEVERITIES.map(s => (
                <button
                  key={s}
                  onClick={() => setForm({ ...form, severity: s })}
                  className={`py-2 rounded-lg text-xs font-semibold border transition-all ${
                    form.severity === s ? severityColors[s] : "border-slate-700 text-slate-500 hover:border-slate-500"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-slate-300 text-xs">Description</Label>
            <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="bg-[#0a1128] border-slate-700 text-white mt-1" rows={4} placeholder="Detailed description of the incident..." />
          </div>

          {isEditing && (
            <div>
              <Label className="text-slate-300 text-xs">Status</Label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                <SelectTrigger className="bg-[#0a1128] border-slate-700 text-white mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-[#1a2744] border-slate-700">
                  {STATUSES.map(s => <SelectItem key={s} value={s} className="text-white">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label className="text-slate-300 text-xs">People Involved</Label>
            <Textarea value={form.people_involved} onChange={e => setForm({ ...form, people_involved: e.target.value })} className="bg-[#0a1128] border-slate-700 text-white mt-1" rows={2} placeholder="Names and descriptions" />
          </div>

          <div>
            <Label className="text-slate-300 text-xs">Attachments</Label>
            <label className="mt-1 flex items-center gap-2 cursor-pointer bg-[#0a1128] border border-dashed border-slate-600 rounded-lg p-3 hover:border-[#d4a843]/40 transition-colors">
              <Upload className="w-4 h-4 text-slate-400" />
              <span className="text-xs text-slate-400">{uploading ? "Uploading..." : "Add photo, video, or document (PDF, Word, Excel…)"}</span>
              <input
                type="file"
                accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.ppt,.pptx"
                className="hidden"
                onChange={handleFileUpload}
                disabled={uploading}
              />
            </label>
            {form.attachments.length > 0 && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {form.attachments.map((url, i) => {
                  const filename = decodeURIComponent(url.split("/").pop().split("?")[0]);
                  const isImage = url.match(/\.(jpg|jpeg|png|gif|webp)$/i);
                  const isVideo = url.match(/\.(mp4|mov|avi|webm)$/i);
                  return (
                    <div key={i} className="relative group">
                      {isImage ? (
                        <div className="w-20 h-20 rounded-lg bg-[#0a1128] border border-slate-700 overflow-hidden">
                          <img src={url} alt="" className="w-full h-full object-cover" />
                        </div>
                      ) : isVideo ? (
                        <div className="w-20 h-20 rounded-lg bg-[#0a1128] border border-slate-700 overflow-hidden">
                          <video src={url} className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <a href={url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 bg-[#0a1128] border border-slate-700 rounded-lg px-3 py-2 hover:border-[#d4a843]/40 transition-colors max-w-[200px]">
                          <FileText className="w-4 h-4 text-[#d4a843] flex-shrink-0" />
                          <span className="text-xs text-slate-300 truncate">{filename}</span>
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => removeAttachment(i)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="mt-4 flex gap-2">
          <Button variant="ghost" onClick={onClose} className="flex-1 sm:flex-none text-slate-400">Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.title || !form.category || !form.severity || !form.location || !form.description} className="flex-1 sm:flex-none bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] font-bold">
            {saving ? "Saving..." : isEditing ? "Save Changes" : "Submit Report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}