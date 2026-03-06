import { useState, useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { base44 } from "@/api/base44Client";
import {
  AlertTriangle, MapPin, RefreshCw, Radio,
  CheckCircle2, XCircle, Navigation, Filter, Clock, Users, Edit2, Save, X as XIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";

const SEV_COLORS = {
  Critical: "#dc2626",
  High: "#ea580c",
  Medium: "#d97706",
  Low: "#3b82f6",
};

function createIncidentIcon(incident) {
  const color = incident.is_panic ? "#dc2626" : (SEV_COLORS[incident.severity] || "#6b7280");
  const isActive = incident.status === "Open" || incident.status === "In Progress";
  const pulse = (incident.is_panic || incident.severity === "Critical") && isActive;

  return L.divIcon({
    className: "",
    html: `
      <div style="position:relative;width:34px;height:34px;">
        ${pulse ? `<div style="position:absolute;top:-5px;left:-5px;width:44px;height:44px;border-radius:50%;border:2px solid ${color};opacity:0.4;animation:mapRipple 1.6s infinite;"></div>` : ""}
        <div style="width:34px;height:34px;background:${color};border:3px solid white;border-radius:50%;box-shadow:0 2px 10px ${color}66;display:flex;align-items:center;justify-content:center;font-size:15px;">
          ${incident.is_panic ? "🚨" : isActive ? "⚠" : "✓"}
        </div>
      </div>
      <style>@keyframes mapRipple{0%{transform:scale(0.8);opacity:0.4}100%{transform:scale(1.6);opacity:0}}</style>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -17],
  });
}

function createCheckInIcon(status) {
  const color = status === "safe" ? "#10b981" : "#ef4444";
  return L.divIcon({
    className: "",
    html: `<div style="width:20px;height:20px;background:${color};border:2px solid white;border-radius:50%;box-shadow:0 1px 6px ${color}88;font-size:10px;display:flex;align-items:center;justify-content:center;">${status === "safe" ? "✓" : "!"}</div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -10],
  });
}

function MapAutoFit({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) { map.setView(points[0], 18); return; }
    map.fitBounds(points, { padding: [50, 50], maxZoom: 18 });
  }, [points.length]);
  return null;
}

function MapFlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.latitude, target.longitude], 18, { animate: true, duration: 1.2 });
  }, [target?.id]);
  return null;
}

const severityLabel = (s) => ({
  Critical: "text-red-400 bg-red-500/10",
  High: "text-orange-400 bg-orange-500/10",
  Medium: "text-amber-400 bg-amber-500/10",
  Low: "text-blue-400 bg-blue-500/10",
}[s] || "text-slate-400 bg-slate-500/10");

const statusLabel = (s) => ({
  "Open": "text-red-400",
  "In Progress": "text-amber-400",
  "Resolved": "text-emerald-400",
  "Closed": "text-slate-400",
}[s] || "text-slate-400");

export default function IncidentMap() {
  const [incidents, setIncidents] = useState([]);
  const [checkIns, setCheckIns] = useState([]);
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [user, setUser] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("active");
  const [acting, setActing] = useState(false);
  const [flyTarget, setFlyTarget] = useState(null);
  const [editingLocation, setEditingLocation] = useState(false);
  const [locationDraft, setLocationDraft] = useState({ location: "", exact_position: "" });
  const [savingLocation, setSavingLocation] = useState(false);

  const loadData = async () => {
    setLoading(true);
    const [u, allIncidents, alerts] = await Promise.all([
      base44.auth.me().catch(() => null),
      base44.entities.Incident.list("-created_date", 200),
      base44.entities.EmergencyAlert.filter({ is_active: true }),
    ]);
    setUser(u);
    setIncidents(allIncidents);
    setActiveAlerts(alerts);
    if (alerts.length > 0) {
      const cis = await base44.entities.SafetyCheckIn.filter({ alert_id: alerts[0].id }).catch(() => []);
      setCheckIns(cis);
    } else {
      setCheckIns([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    const unsub = base44.entities.Incident.subscribe((event) => {
      if (event.type === "create") setIncidents(prev => [event.data, ...prev]);
      else if (event.type === "update") setIncidents(prev => prev.map(i => i.id === event.id ? event.data : i));
      else if (event.type === "delete") setIncidents(prev => prev.filter(i => i.id !== event.id));
    });
    return unsub;
  }, []);

  const filteredIncidents = useMemo(() => {
    if (filter === "active") return incidents.filter(i => i.status === "Open" || i.status === "In Progress");
    if (filter === "panic") return incidents.filter(i => i.is_panic);
    return incidents;
  }, [incidents, filter]);

  const mapIncidents = filteredIncidents.filter(i => i.latitude && i.longitude);
  const needHelpCheckIns = checkIns.filter(c => c.status === "need_help" && c.latitude && c.longitude);
  const allMapPoints = [...mapIncidents.map(i => [i.latitude, i.longitude]), ...needHelpCheckIns.map(c => [c.latitude, c.longitude])];

  const safeCount = checkIns.filter(c => c.status === "safe").length;
  const needHelpCount = checkIns.filter(c => c.status === "need_help").length;

  const handleRespond = async (incident) => {
    if (!user || acting) return;
    setActing(true);
    const current = incident.responders || [];
    const name = user.full_name || user.email;
    if (!current.includes(name)) {
      await base44.entities.Incident.update(incident.id, {
        responders: [...current, name],
        status: incident.status === "Open" ? "In Progress" : incident.status
      });
    }
    setActing(false);
    loadData();
  };

  const handleStatusUpdate = async (incident, status) => {
    await base44.entities.Incident.update(incident.id, { status });
    if (selected?.id === incident.id) setSelected({ ...selected, status });
    loadData();
  };

  const selectIncident = (inc) => {
    setSelected(inc);
    setEditingLocation(false);
    if (inc.latitude && inc.longitude) setFlyTarget(inc);
  };

  const startEditLocation = () => {
    setLocationDraft({ location: selected.location || "", exact_position: selected.people_involved || "" });
    setEditingLocation(true);
  };

  const saveLocation = async () => {
    setSavingLocation(true);
    const updated = await base44.entities.Incident.update(selected.id, {
      location: locationDraft.location,
      people_involved: locationDraft.exact_position,
    });
    setSelected({ ...selected, location: locationDraft.location, people_involved: locationDraft.exact_position });
    setEditingLocation(false);
    setSavingLocation(false);
    loadData();
  };

  if (loading) return (
    <div className="flex items-center justify-center bg-[#0a1128]" style={{ height: "calc(100vh - 57px)" }}>
      <div className="w-8 h-8 border-2 border-[#d4a843] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="flex flex-col lg:ml-56" style={{ height: "calc(100vh - 57px)" }}>

      {/* Top Bar */}
      <div className="bg-[#141f3d] border-b border-[rgba(212,168,67,0.15)] px-4 py-2.5 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <MapPin className="w-4 h-4 text-[#d4a843]" />
          <span className="text-white font-bold text-sm">Live Incident Map</span>
          {activeAlerts.length > 0 && (
            <span className="bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse">
              🚨 ACTIVE ALERT
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {["active", "panic", "all"].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-semibold capitalize transition-all ${filter === f ? "bg-[#d4a843] text-[#0a1128]" : "bg-[#1a2744] text-slate-400 hover:text-white"}`}>
              {f === "active" ? "Active" : f === "panic" ? "Panic" : "All"}
            </button>
          ))}
          <button onClick={loadData} className="text-slate-500 hover:text-white p-1 ml-1">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Area */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left Sidebar */}
        <div className="hidden lg:flex flex-col w-72 bg-[#141f3d] border-r border-[rgba(212,168,67,0.15)] overflow-y-auto shrink-0">
          {/* Check-in Stats */}
          {activeAlerts.length > 0 && checkIns.length > 0 && (
            <div className="p-3 border-b border-[rgba(212,168,67,0.1)] bg-[#0a1128]/40">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Safety Check-Ins</p>
              <div className="flex gap-4">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 text-xs font-bold">{safeCount} Safe</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <XCircle className="w-3.5 h-3.5 text-red-400" />
                  <span className="text-red-400 text-xs font-bold">{needHelpCount} Need Help</span>
                </div>
              </div>
            </div>
          )}

          {/* Incident List */}
          <div className="p-2 space-y-1 flex-1">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider px-2 py-1.5">
              {filteredIncidents.length} Incident{filteredIncidents.length !== 1 ? "s" : ""}
            </p>
            {filteredIncidents.length === 0 ? (
              <div className="text-center py-10 text-slate-500 text-xs">No incidents</div>
            ) : filteredIncidents.map(inc => (
              <button key={inc.id} onClick={() => selectIncident(inc)}
                className={`w-full text-left p-3 rounded-lg border transition-all ${selected?.id === inc.id ? "border-[#d4a843]/40 bg-[rgba(212,168,67,0.04)]" : "border-transparent hover:border-[rgba(212,168,67,0.15)] hover:bg-white/3"}`}>
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      {inc.is_panic && <span className="text-xs">🚨</span>}
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${severityLabel(inc.severity)}`}>{inc.severity}</span>
                    </div>
                    <p className="text-white text-xs font-medium truncate">{inc.title}</p>
                    <p className="text-slate-500 text-[10px] mt-0.5 truncate">{inc.location}</p>
                  </div>
                  <div className={`text-[10px] font-semibold whitespace-nowrap shrink-0 ${statusLabel(inc.status)}`}>{inc.status}</div>
                </div>
                <div className="flex items-center gap-3 mt-1.5">
                  {inc.latitude && <span className="text-[10px] text-slate-600 flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" />GPS</span>}
                  {inc.responders?.length > 0 && <span className="text-[10px] text-slate-600 flex items-center gap-0.5"><Users className="w-2.5 h-2.5" />{inc.responders.length}</span>}
                  <span className="text-[10px] text-slate-600 flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{new Date(inc.created_date).toLocaleDateString()}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Map Container */}
        <div className="flex-1 relative">
          {allMapPoints.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
              <div className="bg-[#1a2744]/95 rounded-2xl p-6 text-center border border-[rgba(212,168,67,0.1)] max-w-xs backdrop-blur">
                <MapPin className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-300 text-sm font-medium">No GPS data available</p>
                <p className="text-slate-500 text-xs mt-1">Incidents with GPS coordinates will appear on the map</p>
              </div>
            </div>
          )}

          <MapContainer center={[34.052235, -118.243683]} zoom={13} style={{ height: "100%", width: "100%" }} zoomControl={true} maxZoom={20}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" maxZoom={20} maxNativeZoom={19} />
            <MapAutoFit points={allMapPoints} />
            <MapFlyTo target={flyTarget} />

            {mapIncidents.map(inc => (
              <Marker key={inc.id} position={[inc.latitude, inc.longitude]} icon={createIncidentIcon(inc)}
                eventHandlers={{ click: () => selectIncident(inc) }}>
                <Popup>
                  <div style={{ background: "#1a2744", color: "white", padding: "8px", borderRadius: "8px", minWidth: "160px", border: "1px solid rgba(212,168,67,0.2)" }}>
                    <p style={{ fontWeight: "bold", fontSize: "13px", margin: "0 0 4px" }}>{inc.title}</p>
                    <p style={{ color: "#94a3b8", fontSize: "11px", margin: "0 0 4px" }}>{inc.location}</p>
                    <p style={{ color: inc.status === "Open" ? "#f87171" : inc.status === "In Progress" ? "#fbbf24" : "#34d399", fontSize: "11px", fontWeight: "600", margin: 0 }}>{inc.status}</p>
                  </div>
                </Popup>
              </Marker>
            ))}

            {needHelpCheckIns.map(ci => (
              <Marker key={ci.id} position={[ci.latitude, ci.longitude]} icon={createCheckInIcon(ci.status)}>
                <Popup>
                  <div style={{ background: "#1a2744", color: "white", padding: "8px", borderRadius: "8px" }}>
                    <p style={{ fontWeight: "bold", fontSize: "12px", margin: "0 0 2px" }}>{ci.user_name}</p>
                    <p style={{ color: "#f87171", fontSize: "11px", margin: 0 }}>🆘 Needs Help</p>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>

        {/* Right Detail Panel (desktop) */}
        {selected && (
          <div className="hidden lg:flex flex-col w-80 bg-[#141f3d] border-l border-[rgba(212,168,67,0.15)] overflow-y-auto shrink-0">
            <div className="p-4 space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  {selected.is_panic && <div className="text-2xl mb-1">🚨</div>}
                  <h2 className="text-white font-bold text-sm leading-tight">{selected.title}</h2>
                  <p className="text-slate-400 text-xs mt-1">{selected.category} · {selected.location}</p>
                </div>
                <button onClick={() => setSelected(null)} className="text-slate-500 hover:text-white text-2xl leading-none ml-2">×</button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Severity", value: selected.severity, cls: severityLabel(selected.severity) },
                  { label: "Status", value: selected.status, cls: statusLabel(selected.status) }
                ].map(({ label, value, cls }) => (
                  <div key={label} className="bg-[#0a1128] rounded-lg p-2.5">
                    <p className="text-[10px] text-slate-500 mb-0.5">{label}</p>
                    <p className={`text-xs font-bold ${cls}`}>{value}</p>
                  </div>
                ))}
              </div>

              <div className="bg-[#0a1128] rounded-lg p-3">
                <p className="text-[10px] text-slate-500 mb-1">Description</p>
                <p className="text-slate-200 text-xs leading-relaxed">{selected.description}</p>
              </div>

              {selected.reported_by && (
                <p className="text-xs text-slate-500">Reported by: <span className="text-slate-300">{selected.reported_by}</span></p>
              )}

              {selected.responders?.length > 0 && (
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Responders ({selected.responders.length})</p>
                  <div className="space-y-1.5">
                    {selected.responders.map((r, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-slate-300">
                        <Radio className="w-3 h-3 text-[#d4a843] shrink-0" />
                        {r}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="space-y-2 pt-1">
                {selected.latitude && (
                  <Button variant="outline" size="sm" className="w-full border-slate-700 text-slate-300 hover:text-white gap-2 text-xs"
                    onClick={() => window.open(`https://maps.google.com/?q=${selected.latitude},${selected.longitude}`, '_blank')}>
                    <Navigation className="w-3.5 h-3.5" /> Navigate to Location
                  </Button>
                )}

                {selected.status !== "Resolved" && selected.status !== "Closed" && (
                  <Button size="sm" className="w-full bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] font-bold gap-2 text-xs"
                    disabled={acting} onClick={() => handleRespond(selected)}>
                    <Radio className="w-3.5 h-3.5" />
                    {acting ? "Updating..." : "I'm Responding"}
                  </Button>
                )}

                {user?.role === "admin" && (
                  <div className="flex gap-2">
                    {selected.status === "Open" && (
                      <Button size="sm" variant="outline" className="flex-1 border-amber-500/30 text-amber-400 hover:bg-amber-500/10 text-xs"
                        onClick={() => handleStatusUpdate(selected, "In Progress")}>Take</Button>
                    )}
                    {selected.status === "In Progress" && (
                      <Button size="sm" variant="outline" className="flex-1 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 text-xs"
                        onClick={() => handleStatusUpdate(selected, "Resolved")}>Resolve</Button>
                    )}
                    {selected.status === "Resolved" && (
                      <Button size="sm" variant="outline" className="flex-1 border-slate-600 text-slate-400 hover:bg-slate-500/10 text-xs"
                        onClick={() => handleStatusUpdate(selected, "Closed")}>Close</Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile incident list */}
      <div className="lg:hidden bg-[#141f3d] border-t border-[rgba(212,168,67,0.15)] overflow-y-auto shrink-0" style={{ maxHeight: "35vh" }}>
        {activeAlerts.length > 0 && checkIns.length > 0 && (
          <div className="flex gap-4 px-4 py-2 border-b border-[rgba(212,168,67,0.1)] bg-[#0a1128]/40">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400 text-[11px] font-bold">{safeCount} Safe</span>
            </div>
            <div className="flex items-center gap-1.5">
              <XCircle className="w-3 h-3 text-red-400" />
              <span className="text-red-400 text-[11px] font-bold">{needHelpCount} Need Help</span>
            </div>
          </div>
        )}
        <div className="p-2 space-y-1">
          {filteredIncidents.length === 0 ? (
            <div className="text-center py-4 text-slate-500 text-xs">No incidents</div>
          ) : filteredIncidents.map(inc => (
            <button key={inc.id} onClick={() => setSelected(inc)}
              className="w-full text-left p-3 rounded-lg hover:bg-white/5 transition-all flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {inc.is_panic && <span className="text-sm shrink-0">🚨</span>}
                <p className="text-white text-xs font-medium truncate">{inc.title}</p>
              </div>
              <span className={`text-[10px] font-semibold shrink-0 ${statusLabel(inc.status)}`}>{inc.status}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Mobile detail sheet */}
      {selected && (
        <div className="lg:hidden fixed inset-x-0 bottom-0 bg-[#141f3d] border-t border-[#d4a843]/30 rounded-t-2xl p-4 z-50 max-h-[65vh] overflow-y-auto">
          <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mb-4" />
          <div className="flex items-start justify-between mb-3">
            <div>
              {selected.is_panic && <span className="text-lg">🚨</span>}
              <p className="text-white font-bold text-sm">{selected.title}</p>
              <p className="text-slate-400 text-xs">{selected.location}</p>
            </div>
            <button onClick={() => setSelected(null)} className="text-slate-500 text-2xl">×</button>
          </div>
          <p className="text-slate-300 text-xs mb-3 leading-relaxed">{selected.description}</p>
          <div className="flex gap-2 flex-wrap">
            {selected.latitude && (
              <Button size="sm" variant="outline" className="border-slate-700 text-slate-300 gap-1.5 text-xs"
                onClick={() => window.open(`https://maps.google.com/?q=${selected.latitude},${selected.longitude}`, '_blank')}>
                <Navigation className="w-3 h-3" /> Navigate
              </Button>
            )}
            {selected.status !== "Resolved" && selected.status !== "Closed" && (
              <Button size="sm" className="bg-[#d4a843] text-[#0a1128] font-bold gap-1.5 text-xs"
                disabled={acting} onClick={() => handleRespond(selected)}>
                <Radio className="w-3 h-3" /> I'm Responding
              </Button>
            )}
            {user?.role === "admin" && selected.status === "Open" && (
              <Button size="sm" variant="outline" className="border-amber-500/30 text-amber-400 text-xs"
                onClick={() => handleStatusUpdate(selected, "In Progress")}>Take</Button>
            )}
            {user?.role === "admin" && selected.status === "In Progress" && (
              <Button size="sm" variant="outline" className="border-emerald-500/30 text-emerald-400 text-xs"
                onClick={() => handleStatusUpdate(selected, "Resolved")}>Resolve</Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}