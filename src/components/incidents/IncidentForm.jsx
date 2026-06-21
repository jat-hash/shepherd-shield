import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, X, FileText } from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = ["Suspicious Activity", "Medical Emergency", "Disruptive Behavior", "Theft", "Trespassing", "Unsecured Property", "Weather Emergency", "Facility Issue", "Other"];
const SEVERITIES = ["Low", "Medium", "High", "Critical"];
const STATUSES = ["Open", "Under Review", "Resolved", "Closed"];

const severityColors = {
  Low: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  Medium: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  High: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  Critical: "bg-red-500/20 text-red-400 border-red-500/30",
};

const EMPTY_FORM = {
  title: "", category: "", location: "", severity: "",
  description: "", people_involved: "", status: "Open",
  incident_date: new Date().toISOString().split("T")[0],
  attachments: [],
};

export default function IncidentForm({ open, onClose, onSaved, incident }) {
  const isEditing = !!incident;
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const uploadingRef = useRef(false);
  const wasOpenRef = useRef(false);
  const filePickerActiveRef = useRef(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const fileInputRef = useRef(null);

  // When file picker closes (with or without selection), window gets focus back.
  // Keep a brief lock after that so mobile ghost taps don't dismiss the modal.
  useEffect(() => {
    const onWindowFocus = () => {
      if (filePickerActiveRef.current) {
        setTimeout(() => { filePickerActiveRef.current = false; }, 800);
      }
    };
    const onVisible = () => {
      if (filePickerActiveRef.current) {
        setTimeout(() => { filePickerActiveRef.current = false; }, 800);
      }
    };
    window.addEventListener("focus", onWindowFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onWindowFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // Only reset form on open transition
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      wasOpenRef.current = true;
      setForm(incident ? {
        title: incident.title || "",
        category: incident.category || "",
        location: incident.location || "",
        severity: incident.severity || "",
        description: incident.description || "",
        people_involved: incident.people_involved || "",
        status: incident.status || "Open",
        incident_date: incident.incident_date || new Date().toISOString().split("T")[0],
        attachments: incident.attachments || [],
      } : { ...EMPTY_FORM, incident_date: new Date().toISOString().split("T")[0] });
    }
    if (!open) wasOpenRef.current = false;
  }, [open]);

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;

    uploadingRef.current = true;
    setUploading(true);
    toast.info(`Uploading ${files.length} file${files.length > 1 ? "s" : ""}…`);

    const results = await Promise.allSettled(
      files.map(file => base44.integrations.Core.UploadFile({ file }))
    );

    const newUrls = [];
    results.forEach((result, i) => {
      if (result.status === "fulfilled") {
        const url = result.value?.file_url || result.value?.url;
        if (url) { newUrls.push(url); toast.success(`${files[i].name} uploaded`); }
      } else {
        toast.error(`Failed to upload ${files[i].name}`);
      }
    });

    if (newUrls.length > 0) {
      setForm(prev => ({ ...prev, attachments: [...prev.attachments, ...newUrls] }));
    }
    uploadingRef.current = false;
    setUploading(false);
  };

  const removeAttachment = (index) => {
    setForm(prev => ({ ...prev, attachments: prev.attachments.filter((_, i) => i !== index) }));
  };

  const handleSave = async () => {
    setSaving(true);
    if (isEditing) {
      await base44.entities.Incident.update(incident.id, form);
    } else {
      const user = await base44.auth.me();
      const created = await base44.entities.Incident.create({
        ...form,
        reported_by: user?.display_name || user?.full_name || user?.email || "Unknown",
      });
      // Trigger push notification + in-app alert to the whole team
      base44.functions.invoke('notifyIncidentReported', { incident: created }).catch(() => {});
    }
    setSaving(false);
    onSaved?.();
    onClose();
  };

  // Guard: never close if uploading or file picker was just used
  const safeClose = () => {
    if (uploadingRef.current || uploading || filePickerActiveRef.current) return;
    onClose();
  };

  if (!open) return null;

  return (
    <>
      {/* Hidden file input — rendered at document root level via portal-like approach */}
      <input
        key={fileInputKey}
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.ppt,.pptx"
        style={{ position: "fixed", top: -9999, left: -9999, opacity: 0, pointerEvents: "none" }}
        multiple
        onChange={handleFileUpload}
      />

      {/* Backdrop — only closes if not uploading */}
      <div
        className="fixed inset-0 bg-black/70 z-[200]"
        onPointerDown={(e) => {
          // Only close if the tap is directly on the backdrop
          if (e.target === e.currentTarget) safeClose();
        }}
      />

      {/* Modal panel */}
      <div
        className="fixed inset-x-0 bottom-0 sm:inset-0 z-[201] flex sm:items-center sm:justify-center"
        style={{ pointerEvents: "none" }}
      >
        <div
          className="bg-[#1a2744] border border-slate-700 text-white w-full sm:max-w-lg sm:rounded-xl rounded-t-xl shadow-2xl overflow-hidden flex flex-col"
          style={{ maxHeight: "92vh", pointerEvents: "auto" }}
          onPointerDown={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 shrink-0">
            <h2 className="text-[#d4a843] font-semibold text-sm">
              {isEditing ? "Edit Incident Report" : "New Incident Report"}
            </h2>
            <button onClick={safeClose} className="text-slate-400 hover:text-white transition-colors p-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable body */}
          <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
            <div>
              <Label className="text-slate-300 text-xs">Title</Label>
              <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                className="bg-[#0a1128] border-slate-700 text-white mt-1" placeholder="Brief incident title" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-slate-300 text-xs">Category</Label>
                <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                  <SelectTrigger className="bg-[#0a1128] border-slate-700 text-white mt-1">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a2744] border-slate-700 z-[300]">
                    {CATEGORIES.map(c => <SelectItem key={c} value={c} className="text-white">{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-slate-300 text-xs">Location</Label>
                <Input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })}
                  className="bg-[#0a1128] border-slate-700 text-white mt-1" placeholder="e.g. Parking Lot A" />
              </div>
            </div>

            <div>
              <Label className="text-slate-300 text-xs mb-2 block">Severity</Label>
              <div className="grid grid-cols-4 gap-2">
                {SEVERITIES.map(s => (
                  <button key={s} type="button" onClick={() => setForm({ ...form, severity: s })}
                    className={`py-2 rounded-lg text-xs font-semibold border transition-all ${
                      form.severity === s ? severityColors[s] : "border-slate-700 text-slate-500 hover:border-slate-500"
                    }`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-slate-300 text-xs">Description</Label>
              <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                className="bg-[#0a1128] border-slate-700 text-white mt-1" rows={4}
                placeholder="Detailed description of the incident..." />
            </div>

            {isEditing && (
              <div>
                <Label className="text-slate-300 text-xs">Status</Label>
                <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                  <SelectTrigger className="bg-[#0a1128] border-slate-700 text-white mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-[#1a2744] border-slate-700 z-[300]">
                    {STATUSES.map(s => <SelectItem key={s} value={s} className="text-white">{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label className="text-slate-300 text-xs">People Involved</Label>
              <Textarea value={form.people_involved} onChange={e => setForm({ ...form, people_involved: e.target.value })}
                className="bg-[#0a1128] border-slate-700 text-white mt-1" rows={2}
                placeholder="Names and descriptions" />
            </div>

            {/* Attachments */}
            <div>
              <Label className="text-slate-300 text-xs">
                Attachments {form.attachments.length > 0 && `(${form.attachments.length})`}
              </Label>
              <button
                type="button"
                disabled={uploading}
                onClick={() => {
                  filePickerActiveRef.current = true;
                  // Increment key to remount the input fresh — fixes mobile first-tap issue
                  setFileInputKey(k => k + 1);
                  // Use rAF to ensure new input is mounted before clicking
                  requestAnimationFrame(() => {
                    setTimeout(() => fileInputRef.current?.click(), 50);
                  });
                }}
                className="mt-1 w-full flex items-center gap-2 bg-[#0a1128] border border-dashed border-slate-600 rounded-lg p-3 hover:border-[#d4a843]/40 active:border-[#d4a843]/60 transition-colors disabled:opacity-50 touch-manipulation"
              >
                <Upload className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span className="text-xs text-slate-400 text-left">
                  {uploading ? "Uploading... please wait" : "Tap to add photos, videos, or documents"}
                </span>
              </button>

              {form.attachments.length > 0 && (
                <div className="flex gap-2 mt-2 flex-wrap">
                  {form.attachments.map((url, i) => {
                    const filename = decodeURIComponent(url.split("/").pop().split("?")[0]);
                    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
                    const isVideo = /\.(mp4|mov|avi|webm|mkv|m4v)$/i.test(url);
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
                            className="flex items-center gap-2 bg-[#0a1128] border border-slate-700 rounded-lg px-3 py-2 hover:border-[#d4a843]/40 max-w-[180px]">
                            <FileText className="w-4 h-4 text-[#d4a843] flex-shrink-0" />
                            <span className="text-xs text-slate-300 truncate">{filename}</span>
                          </a>
                        )}
                        <button type="button" onClick={() => removeAttachment(i)}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 active:opacity-100 transition-opacity z-10 touch-manipulation">
                          <X className="w-3 h-3 text-white" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex gap-2 px-5 py-4 border-t border-slate-700 shrink-0">
            <Button variant="ghost" onClick={safeClose} className="flex-1 text-slate-400">Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={saving || uploading || !form.title || !form.category || !form.severity || !form.location || !form.description}
              className="flex-1 bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] font-bold"
            >
              {saving ? "Saving..." : isEditing ? "Save Changes" : "Submit Report"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}