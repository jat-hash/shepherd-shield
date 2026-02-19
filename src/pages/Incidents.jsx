import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, AlertTriangle, Clock, CheckCircle2, FileWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import IncidentForm from "@/components/incidents/IncidentForm";

const severityColors = {
  Low: "bg-blue-500/20 text-blue-400",
  Medium: "bg-amber-500/20 text-amber-400",
  High: "bg-orange-500/20 text-orange-400",
  Critical: "bg-red-500/20 text-red-400",
};

const statusColors = {
  Open: "text-red-400",
  "In Progress": "text-amber-400",
  Resolved: "text-emerald-400",
  Closed: "text-slate-400",
};

export default function Incidents() {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [filter, setFilter] = useState("all");

  const loadIncidents = async () => {
    setLoading(true);
    const all = await base44.entities.Incident.list("-created_date", 100);
    setIncidents(all);
    setLoading(false);
  };

  useEffect(() => { loadIncidents(); }, []);

  const filtered = filter === "all" ? incidents : incidents.filter(i => i.status === filter);

  const updateStatus = async (id, status) => {
    await base44.entities.Incident.update(id, { status });
    loadIncidents();
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 lg:ml-60 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Incident Reports</h1>
        <Button onClick={() => setFormOpen(true)} className="bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] font-bold text-sm gap-1">
          <Plus className="w-4 h-4" /> New Report
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {["all", "Open", "In Progress", "Resolved", "Closed"].map(f => (
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
            <div key={inc.id} className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${severityColors[inc.severity]}`}>
                      {inc.severity}
                    </span>
                    <span className="text-[10px] text-slate-500">{inc.category}</span>
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
                  {inc.status === "Open" && (
                    <button onClick={() => updateStatus(inc.id, "In Progress")} className="text-amber-400 hover:text-amber-300 underline">Take</button>
                  )}
                  {inc.status === "In Progress" && (
                    <button onClick={() => updateStatus(inc.id, "Resolved")} className="text-emerald-400 hover:text-emerald-300 underline">Resolve</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <IncidentForm open={formOpen} onClose={() => setFormOpen(false)} onSaved={loadIncidents} />
    </div>
  );
}