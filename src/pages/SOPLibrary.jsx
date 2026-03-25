import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, BookOpen, FileCheck, Upload, MessageCircle, Send, Loader2, X, Edit2, WifiOff } from "lucide-react";
import useOfflineData from "@/hooks/useOfflineData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

const CATEGORIES = ["Emergency Evacuation", "Active Threat", "Parking Lot", "Children's Wing", "Medical Response", "General Security", "Other"];

const categoryIcons = {
  "Emergency Evacuation": "🚪",
  "Active Threat": "🛡️",
  "Parking Lot": "🅿️",
  "Children's Wing": "👶",
  "Medical Response": "🏥",
  "General Security": "🔒",
  "Other": "📄",
};

export default function SOPLibrary() {
  const [formOpen, setFormOpen] = useState(false);
  const [detailSop, setDetailSop] = useState(null);
  const [form, setForm] = useState({ title: "", category: "General Security", content: "", version: "1.0", document_file: "" });
  const [saving, setSaving] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  const fetchFn = useCallback(() => base44.entities.SOP.list("-updated_date", 100), []);
  const { data: sops, loading, isOffline, reload: load } = useOfflineData("sops", fetchFn, []);

  useEffect(() => { 
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setForm(prev => ({ ...prev, document_file: file_url }));
  };

  const handleSave = async () => {
    setSaving(true);
    if (editingId) {
      await base44.entities.SOP.update(editingId, form);
    } else {
      await base44.entities.SOP.create(form);
    }
    setSaving(false);
    setFormOpen(false);
    setForm({ title: "", category: "General Security", content: "", version: "1.0", document_file: "" });
    setEditingId(null);
    load();
  };

  const handleAcknowledge = async () => {
    setAcknowledging(true);
    const user = await base44.auth.me();
    const existing = detailSop.acknowledged_by || "";
    const emails = existing.split(",").map(e => e.trim()).filter(Boolean);
    if (!emails.includes(user.email)) {
      emails.push(user.email);
    }
    await base44.entities.SOP.update(detailSop.id, { acknowledged_by: emails.join(", ") });
    setDetailSop({ ...detailSop, acknowledged_by: emails.join(", ") });
    setAcknowledging(false);
  };

  const grouped = CATEGORIES.reduce((acc, cat) => {
    const catSops = sops.filter(s => s.category === cat);
    if (catSops.length > 0) acc[cat] = catSops;
    return acc;
  }, {});

  const handleAIChat = async () => {
    if (!chatInput.trim()) return;
    
    const userMessage = chatInput.trim();
    setChatMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setChatInput("");
    setChatLoading(true);

    try {
      const sopContext = sops.map(sop => 
        `Title: ${sop.title}\nCategory: ${sop.category}\nVersion: ${sop.version}\nContent:\n${sop.content}\n\n`
      ).join("---\n\n");

      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `You are a security assistant helping church security team members understand Standard Operating Procedures (SOPs). Based on the following SOPs, answer the user's question clearly and concisely. If the answer isn't in the SOPs, say so.

SOPs:
${sopContext}

User Question: ${userMessage}

Provide a helpful, accurate answer based on the SOP content above.`
      });

      setChatMessages(prev => [...prev, { role: "assistant", content: response }]);
    } catch (error) {
      toast.error("Failed to get AI response");
      setChatMessages(prev => [...prev, { role: "assistant", content: "Sorry, I couldn't process that request. Please try again." }]);
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 lg:ml-60 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">SOP Library</h1>
        <div className="flex gap-2">
          <Button onClick={() => setChatOpen(true)} variant="outline" className="border-[#d4a843] text-[#d4a843] hover:bg-[#d4a843]/10 text-sm gap-1">
            <MessageCircle className="w-4 h-4" /> AI Assistant
          </Button>
          {currentUser?.role === 'admin' && (
            <Button onClick={() => setFormOpen(true)} className="bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] font-bold text-sm gap-1">
              <Plus className="w-4 h-4" /> Upload
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-[#d4a843] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="text-center py-12">
          <BookOpen className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">No SOPs uploaded yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([cat, catSops]) => (
            <div key={cat}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-2">
                <span>{categoryIcons[cat]}</span> {cat}
              </h2>
              <div className="space-y-2">
                {catSops.map(sop => (
                  <button key={sop.id} onClick={() => setDetailSop(sop)} className="w-full text-left bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-4 hover:border-[#d4a843]/30 transition-all">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-white">{sop.title}</h3>
                      <span className="text-[10px] text-slate-500">v{sop.version}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">Updated: {new Date(sop.updated_date).toLocaleDateString()}</p>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Form */}
      <Dialog open={formOpen} onOpenChange={(open) => { setFormOpen(open); if (!open) { setEditingId(null); setForm({ title: "", category: "General Security", content: "", version: "1.0", document_file: "" }); } }}>
        <DialogContent className="bg-[#1a2744] border-slate-700 text-white max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-[#d4a843]">{editingId ? "Edit SOP" : "New SOP"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-slate-300 text-xs">Title</Label>
              <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="bg-[#0a1128] border-slate-700 text-white mt-1" />
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
                <Label className="text-slate-300 text-xs">Version</Label>
                <Input value={form.version} onChange={e => setForm({ ...form, version: e.target.value })} className="bg-[#0a1128] border-slate-700 text-white mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-slate-300 text-xs">Content (Markdown supported)</Label>
              <Textarea value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} className="bg-[#0a1128] border-slate-700 text-white mt-1 font-mono text-xs" rows={8} />
            </div>
            <div>
              <Label className="text-slate-300 text-xs">Document File</Label>
              <label className="mt-1 flex items-center gap-2 cursor-pointer bg-[#0a1128] border border-dashed border-slate-600 rounded-lg p-3">
                <Upload className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-slate-400">{form.document_file ? "File uploaded" : "Upload PDF or document"}</span>
                <input type="file" className="hidden" onChange={handleFileUpload} />
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFormOpen(false)} className="text-slate-400">Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.title || !form.content} className="bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] font-bold">
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail View */}
      <Dialog open={!!detailSop} onOpenChange={() => setDetailSop(null)}>
        <DialogContent className="bg-[#1a2744] border-slate-700 text-white max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <DialogTitle className="text-[#d4a843]">{detailSop?.title}</DialogTitle>
              </div>
              {currentUser?.role === 'admin' && (
                <Button
                  onClick={() => {
                    setForm({
                      title: detailSop.title,
                      category: detailSop.category,
                      content: detailSop.content,
                      version: detailSop.version,
                      document_file: detailSop.document_file || ""
                    });
                    setEditingId(detailSop.id);
                    setDetailSop(null);
                    setFormOpen(true);
                  }}
                  size="sm"
                  variant="outline"
                  className="border-[#d4a843]/30 text-[#d4a843] hover:bg-[#d4a843]/10 gap-1"
                >
                  <Edit2 className="w-3 h-3" /> Edit
                </Button>
              )}
            </div>
          </DialogHeader>
          {detailSop && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-xs text-slate-400">
                <span>Version {detailSop.version}</span>
                <span>•</span>
                <span>Updated: {new Date(detailSop.updated_date).toLocaleDateString()}</span>
              </div>
              <div className="prose prose-sm prose-invert max-w-none bg-[#0a1128] rounded-xl p-4 border border-slate-700">
                <ReactMarkdown>{detailSop.content}</ReactMarkdown>
              </div>
              {detailSop.document_file && (
                <a href={detailSop.document_file} target="_blank" rel="noreferrer" className="text-[#d4a843] text-sm underline inline-flex items-center gap-1">
                  📄 View Attached Document
                </a>
              )}
              <Button onClick={handleAcknowledge} disabled={acknowledging} className="w-full bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] font-bold gap-2">
                <FileCheck className="w-4 h-4" /> {acknowledging ? "Signing..." : "Acknowledge & Sign"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* AI Chat Assistant */}
      <Dialog open={chatOpen} onOpenChange={setChatOpen}>
        <DialogContent className="bg-[#1a2744] border-slate-700 text-white max-w-lg h-[600px] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-700">
            <DialogTitle className="text-[#d4a843] flex items-center gap-2">
              <MessageCircle className="w-5 h-5" />
              SOP AI Assistant
            </DialogTitle>
            <p className="text-xs text-slate-400 mt-1">Ask questions about any SOP document</p>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {chatMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-slate-500">
                <MessageCircle className="w-12 h-12 mb-3 text-slate-600" />
                <p className="text-sm">Ask me anything about your SOPs!</p>
                <p className="text-xs mt-2 text-slate-600">
                  Try: "Summarize the Active Threat SOP" or "What are the steps for evacuation?"
                </p>
              </div>
            ) : (
              chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                    msg.role === "user"
                      ? "bg-[#d4a843] text-[#0a1128]"
                      : "bg-[#0a1128] text-white border border-slate-700"
                  }`}>
                    {msg.role === "assistant" ? (
                      <ReactMarkdown className="text-sm prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                        {msg.content}
                      </ReactMarkdown>
                    ) : (
                      <p className="text-sm">{msg.content}</p>
                    )}
                  </div>
                </div>
              ))
            )}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-[#0a1128] border border-slate-700 rounded-2xl px-4 py-2.5">
                  <Loader2 className="w-4 h-4 animate-spin text-[#d4a843]" />
                </div>
              </div>
            )}
          </div>

          <div className="px-6 py-4 border-t border-slate-700">
            <div className="flex gap-2">
              <Input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleAIChat()}
                placeholder="Ask about any SOP..."
                className="flex-1 bg-[#0a1128] border-slate-700 text-white placeholder:text-slate-500"
                disabled={chatLoading}
              />
              <Button
                onClick={handleAIChat}
                disabled={!chatInput.trim() || chatLoading}
                size="icon"
                className="bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] shrink-0"
              >
                {chatLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}