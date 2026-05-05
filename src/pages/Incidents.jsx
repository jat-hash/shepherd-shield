import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, AlertTriangle, Clock, CheckCircle2, FileWarning, ArrowUpDown, Image, WifiOff, Pencil } from "lucide-react";
import useOfflineData from "@/hooks/useOfflineData";
import { Button } from "@/components/ui/button";
import IncidentForm from "@/components/incidents/IncidentForm";
import SOPReference from "@/components/incidents/SOPReference";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import WhatsAppReportButton from "@/components/whatsapp/WhatsAppReportButton";

const severityColors = {
  Low: "bg-blue-500/20 text-blue-400",
  Medium: "bg-amber-500/20 text-amber-400",
  High: "bg-orange-500/20 text-orange-400",
  Critical: "bg-red-500/20 text-red-400",
};

const statusColors = {
  Open: "text-red-400",
  "Under Review": "text-amber-400",
  Resolved: "text-emerald-400",
  Closed: "text-slate-400",
};

export default function Incidents() {
  const [formOpen, setFormOpen] = useState(false);
  const [editingIncident, setEditingIncident] = useState(null);
  const [filter, setFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [sortBy, setSortBy] = useState("-created_date");
  const [viewingIncident, setViewingIncident] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  const fetchFn = useCallback(() => base44.entities.Incident.list(sortBy, 100), [sortBy]);
  const { data: incidents, loading, isOffline, reload: loadIncidents } = useOfflineData("incidents", fetchFn, [sortBy]);

  useEffect(() => { 
    base44.auth.me().then(setCurrentUser).catch(() => {});
    const unsub = base44.entities.Incident.subscribe(() => loadIncidents());
    return unsub;
  }, []);

  const filtered = incidents.filter(i => {
    if (filter !== "all" && i.status !== filter) return false;
    if (severityFilter !== "all" && i.severity !== severityFilter) return false;
    return true;
  });

  const updateStatus = async (id, status) => {
    await base44.entities.Incident.update(id, { status });
    loadIncidents();
  };

  return (
    <div className="max-w-2xl mx-auto px-3 py-4 lg:px-4 lg:py-6 lg:ml-60 space-y-4">
      {isOffline && (
        <div className="flex items-center gap-2 bg-orange-900/40 border border-orange-500/30 rounded-lg px-3 py-2 text-orange-300 text-xs">
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          You're offline — showing cached data
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg sm:text-xl font-bold text-white">Incident Reports</h1>
        <div className="flex gap-1 sm:gap-2">
          <SOPReference category="Active Threat" />
          {currentUser?.role === 'admin' && (
            <Button onClick={() => setFormOpen(true)} className="bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] font-bold text-xs sm:text-sm gap-1 h-8 sm:h-10 px-2 sm:px-4">
              <Plus className="w-3 h-3 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">New</span>
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {["all", "Open", "Under Review", "Resolved", "Closed"].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                  filter === f ? "bg-[#d4a843] text-[#0a1128]" : "bg-[#1a2744] text-slate-400 hover:text-white"
                }`}
              >
                {f === "all" ? "All" : f}
              </button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSortBy(sortBy === "-created_date" ? "created_date" : "-created_date")}
            className="text-slate-400 hover:text-white gap-1 shrink-0"
          >
            <ArrowUpDown className="w-3 h-3" />
            Date
          </Button>
        </div>
        
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          <span className="text-[10px] text-slate-500 py-1.5 px-2">Severity:</span>
          {["all", "Low", "Medium", "High", "Critical"].map(s => (
            <button
              key={s}
              onClick={() => setSeverityFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                severityFilter === s ? "bg-[#d4a843] text-[#0a1128]" : "bg-[#1a2744] text-slate-400 hover:text-white"
              }`}
            >
              {s === "all" ? "All" : s}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-[#d4a843] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <FileWarning className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">No incidents found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(inc => (
            <div key={inc.id} onClick={() => setViewingIncident(inc)} className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-4 space-y-3 cursor-pointer hover:border-[#d4a843]/30 transition-all">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${severityColors[inc.severity]}`}>
                      {inc.severity}
                    </span>
                    <span className="text-[10px] text-slate-500">{inc.category}</span>
                    {inc.attachments?.length > 0 && (
                      <div className="flex items-center gap-1 text-[10px] text-slate-400">
                        <Image className="w-3 h-3" />
                        {inc.attachments.length}
                      </div>
                    )}
                  </div>
                  <h3 className="text-sm font-bold text-white">{inc.title}</h3>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2">{inc.description}</p>
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px]">
                <span className="text-slate-500">
                  {inc.reported_by} • {inc.location} • {new Date(inc.created_date).toLocaleDateString()}
                </span>
                <div className="flex items-center gap-2">
                  <span className={`font-semibold ${statusColors[inc.status]}`}>{inc.status}</span>
                  {currentUser?.role === 'admin' && (
                    <>
                      {inc.status === "Open" && (
                        <button onClick={(e) => { e.stopPropagation(); updateStatus(inc.id, "Under Review"); }} className="text-amber-400 hover:text-amber-300 underline">Review</button>
                      )}
                      {inc.status === "Under Review" && (
                        <button onClick={(e) => { e.stopPropagation(); updateStatus(inc.id, "Resolved"); }} className="text-emerald-400 hover:text-emerald-300 underline">Resolve</button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* WhatsApp quick report */}
      <div className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-white">Report via WhatsApp</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Open WhatsApp with a pre-filled emergency message</p>
        </div>
        <WhatsAppReportButton className="text-xs h-8 px-3" />
      </div>

      <IncidentForm open={formOpen} onClose={() => setFormOpen(false)} onSaved={loadIncidents} />
      <IncidentForm open={!!editingIncident} onClose={() => setEditingIncident(null)} onSaved={() => { loadIncidents(); setViewingIncident(null); }} incident={editingIncident} />

      {/* Incident Detail View */}
      <Dialog open={!!viewingIncident} onOpenChange={() => setViewingIncident(null)}>
        <DialogContent className="bg-[#1a2744] border-slate-700 text-white max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#d4a843] flex items-center gap-2 flex-wrap">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${severityColors[viewingIncident?.severity]}`}>
                {viewingIncident?.severity}
              </span>
              <span className="flex-1">{viewingIncident?.title}</span>
              {currentUser?.role === 'admin' && (
                <button
                  onClick={() => { setEditingIncident(viewingIncident); setViewingIncident(null); }}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-white bg-[#0a1128] border border-slate-700 rounded-lg px-2 py-1 transition-colors"
                >
                  <Pencil className="w-3 h-3" /> Edit
                </button>
              )}
            </DialogTitle>
          </DialogHeader>
          {viewingIncident && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-500">Category:</span>
                  <p className="text-white font-medium">{viewingIncident.category}</p>
                </div>
                <div>
                  <span className="text-slate-500">Location:</span>
                  <p className="text-white font-medium">{viewingIncident.location}</p>
                </div>
                <div>
                  <span className="text-slate-500">Status:</span>
                  <p className={`font-semibold ${statusColors[viewingIncident.status]}`}>{viewingIncident.status}</p>
                </div>
                <div>
                  <span className="text-slate-500">Reported By:</span>
                  <p className="text-white font-medium">{viewingIncident.reported_by}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-500">Date:</span>
                  <p className="text-white font-medium">{new Date(viewingIncident.created_date).toLocaleString()}</p>
                </div>
              </div>

              <div>
                <span className="text-slate-500 text-xs">Description:</span>
                <p className="text-white text-sm mt-1 bg-[#0a1128] rounded-lg p-3 border border-slate-700">{viewingIncident.description}</p>
              </div>

              {viewingIncident.people_involved && (
                <div>
                  <span className="text-slate-500 text-xs">People Involved:</span>
                  <p className="text-white text-sm mt-1 bg-[#0a1128] rounded-lg p-3 border border-slate-700">{viewingIncident.people_involved}</p>
                </div>
              )}

              {viewingIncident.attachments?.length > 0 && (
                <div>
                  <span className="text-slate-500 text-xs block mb-2">Attachments ({viewingIncident.attachments.length}):</span>
                  <div className="grid grid-cols-2 gap-2">
                    {viewingIncident.attachments.map((url, i) => (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg overflow-hidden bg-[#0a1128] border border-slate-700 hover:border-[#d4a843]/50 transition-all"
                      >
                        {url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                          <img src={url} alt="" className="w-full h-32 object-cover" />
                        ) : url.match(/\.(mp4|mov|avi|webm)$/i) ? (
                          <video src={url} className="w-full h-32 object-cover" />
                        ) : (
                          <div className="w-full h-32 flex items-center justify-center text-slate-400">
                            <span className="text-xs">📎 File</span>
                          </div>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}