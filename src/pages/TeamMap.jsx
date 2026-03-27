import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { base44 } from "@/api/base44Client";
import { MapPin, RefreshCw, Users, Trash2, Edit2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cacheData, getCachedData } from "@/lib/offlineStorage";

function createMemberIcon(name) {
  const initials = name ? name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() : "?";
  return L.divIcon({
    className: "",
    html: `<div style="width:36px;height:36px;background:#1a2744;border:2.5px solid #d4a843;border-radius:50%;box-shadow:0 2px 10px rgba(212,168,67,0.4);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;color:#d4a843;">${initials}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18],
  });
}

function createUserLocationIcon() {
  return L.divIcon({
    className: "",
    html: `
      <div style="position:relative;width:20px;height:20px;">
        <div style="position:absolute;top:-8px;left:-8px;width:36px;height:36px;border-radius:50%;background:rgba(59,130,246,0.2);animation:userPulse 2s infinite;"></div>
        <div style="width:20px;height:20px;background:#3b82f6;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(59,130,246,0.6);"></div>
      </div>
      <style>@keyframes userPulse{0%,100%{transform:scale(0.8);opacity:0.6}50%{transform:scale(1.4);opacity:0.2}}</style>
    `,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -12],
  });
}

function createPanicIcon() {
  return L.divIcon({
    className: "",
    html: `
      <div style="position:relative;width:38px;height:38px;">
        <div style="position:absolute;top:-6px;left:-6px;width:50px;height:50px;border-radius:50%;border:2px solid #dc2626;opacity:0.4;animation:panicRipple 1.4s infinite;"></div>
        <div style="width:38px;height:38px;background:#dc2626;border:3px solid white;border-radius:50%;box-shadow:0 2px 12px rgba(220,38,38,0.6);display:flex;align-items:center;justify-content:center;font-size:18px;">🚨</div>
      </div>
      <style>@keyframes panicRipple{0%{transform:scale(0.8);opacity:0.5}100%{transform:scale(1.8);opacity:0}}</style>
    `,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -19],
  });
}

function MapAutoFit({ points, userLocation }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 0) {
      if (points.length === 1) { map.setView(points[0], 17); return; }
      map.fitBounds(points, { padding: [60, 60], maxZoom: 18 });
    } else if (userLocation) {
      map.setView(userLocation, 17);
    }
  }, [points.length, userLocation]);
  return null;
}

export default function TeamMap() {
  const [user, setUser] = useState(null);
  const [checkedInAssignments, setCheckedInAssignments] = useState([]);
  const [allCheckedIn, setAllCheckedIn] = useState([]);
  const [panicIncidents, setPanicIncidents] = useState([]);
  const [showSidebar, setShowSidebar] = useState(true);
  const [loading, setLoading] = useState(true);
  const [selectedMember, setSelectedMember] = useState(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [allPositions, setAllPositions] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => { setIsOffline(false); loadData(); };
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => { window.removeEventListener("online", handleOnline); window.removeEventListener("offline", handleOffline); };
  }, []);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation([pos.coords.latitude, pos.coords.longitude]),
        () => {}
      );
    }
  }, []);

  const loadData = async () => {
    setLoading(true);

    if (!navigator.onLine) {
      const cached = await getCachedData('teammap').catch(() => []);
      const activeMembers = (cached || []).filter(a => a._type === 'assignment');
      const activePanics = (cached || []).filter(a => a._type === 'panic');
      setCheckedInAssignments(activeMembers);
      setPanicIncidents(activePanics);
      setLoading(false);
      return;
    }

    const u = await base44.auth.me().catch(() => null);
    if (u) setUser(u);

    const today = new Date().toLocaleDateString('en-CA');
    const [allAssignments, allIncidents, positions, personalCheckIns] = await Promise.all([
      base44.entities.Assignment.filter({ checked_in: true, checked_out: false }, "-updated_date", 500),
      base44.entities.Incident.filter({ is_panic: true }, "-updated_date", 100),
      base44.entities.Position.list("-updated_date", 200),
      base44.entities.PersonalCheckIn.filter({ check_in_date: today }, "-check_in_time", 200),
    ]);
    setAllPositions(positions);

    // Normalize personal check-ins and merge
    const normalizedPersonal = personalCheckIns
      .filter(p => !p.check_out_time)
      .map(p => ({
        id: p.id,
        assigned_to_name: p.user_name,
        position_name: "Personal Check-in",
        service_date: p.check_in_date,
        check_in_time: p.check_in_time,
        check_in_latitude: p.latitude,
        check_in_longitude: p.longitude,
        checked_in: true,
        checked_out: false,
        _isPersonal: true,
      }));

    const allCheckedInMerged = [...allAssignments, ...normalizedPersonal];
    const activeMembers = allCheckedInMerged.filter(a =>
      a.check_in_latitude && a.check_in_longitude
    );
    setAllCheckedIn(allCheckedInMerged);
    const activePanics = allIncidents.filter(i =>
      (i.status === "Open" || i.status === "In Progress") &&
      i.latitude && i.longitude
    );

    // Cache for offline use
    const toCache = [
      ...activeMembers.map(a => ({ ...a, _type: 'assignment' })),
      ...activePanics.map(i => ({ ...i, _type: 'panic' })),
    ];
    cacheData('teammap', toCache).catch(() => {});

    setCheckedInAssignments(activeMembers);
    setPanicIncidents(activePanics);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    const unsub = base44.entities.Assignment.subscribe(() => loadData());
    const unsub2 = base44.entities.Incident.subscribe(() => loadData());
    return () => { unsub(); unsub2(); };
  }, []);

  const allPoints = [
    ...checkedInAssignments.map(a => [a.check_in_latitude, a.check_in_longitude]),
    ...panicIncidents.map(i => [i.latitude, i.longitude]),
  ];

  if (loading) return (
    <div className="flex items-center justify-center bg-[#0a1128]" style={{ height: "calc(100vh - 57px)" }}>
      <div className="w-8 h-8 border-2 border-[#d4a843] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="flex flex-col lg:ml-56" style={{ height: "calc(100vh - 57px)" }}>

      {/* Offline Banner */}
      {isOffline && (
        <div className="bg-amber-900/40 border-b border-amber-500/30 px-4 py-2 text-xs text-amber-400 flex items-center gap-2 shrink-0">
          <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
          Offline — showing cached map data
        </div>
      )}

      {/* Top Bar */}
      <div className="bg-[#141f3d] border-b border-[rgba(212,168,67,0.15)] px-4 py-2.5 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <MapPin className="w-4 h-4 text-[#d4a843]" />
          <span className="text-white font-bold text-sm">Team Map</span>
          {panicIncidents.length > 0 && (
            <span className="bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse">
              🚨 ACTIVE PANIC
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Users className="w-3.5 h-3.5 text-[#d4a843]" />
            <span>{checkedInAssignments.length} checked in</span>
          </div>
          <button onClick={loadData} className="text-slate-500 hover:text-white p-1">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative" style={{ zIndex: 0 }}>
        {allPoints.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <div className="bg-[#1a2744]/95 rounded-2xl p-6 text-center border border-[rgba(212,168,67,0.1)] max-w-xs backdrop-blur">
              <MapPin className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-300 text-sm font-medium">No locations available</p>
              <p className="text-slate-500 text-xs mt-1">Members appear here when they check in with GPS enabled</p>
            </div>
          </div>
        )}

        <MapContainer center={[34.052235, -118.243683]} zoom={14} style={{ height: "100%", width: "100%" }} zoomControl={true} maxZoom={20}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" maxZoom={20} maxNativeZoom={19} />
          <MapAutoFit points={allPoints} userLocation={userLocation} />

          {/* Checked-in members */}
          {checkedInAssignments.map(a => (
            <Marker key={a.id} position={[a.check_in_latitude, a.check_in_longitude]} icon={createMemberIcon(a.assigned_to_name)}>
              <Popup>
                <div style={{ background: "#1a2744", color: "white", padding: "10px", borderRadius: "8px", minWidth: "160px", border: "1px solid rgba(212,168,67,0.2)" }}>
                  <p style={{ fontWeight: "bold", fontSize: "13px", margin: "0 0 4px" }}>{a.assigned_to_name}</p>
                  <p style={{ color: "#d4a843", fontSize: "11px", margin: "0 0 2px" }}>{a.position_name}</p>
                  <p style={{ color: "#10b981", fontSize: "11px", margin: "0 0 2px" }}>✓ Checked in at {a.check_in_time}</p>
                  {user?.role === "admin" && (
                    <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
                      <button 
                        onClick={() => { setSelectedMember(a); setEditForm({ position_name: a.position_name, assigned_to_name: a.assigned_to_name, start_time: a.start_time, end_time: a.end_time, status: a.status }); setEditDialogOpen(true); setConfirmDelete(false); }}
                        style={{ color: "#d4a843", fontSize: "10px", textDecoration: "underline", background: "none", border: "none", cursor: "pointer" }}
                      >✏️ Edit</button>
                      <button 
                        onClick={() => { setSelectedMember(a); setEditDialogOpen(true); setConfirmDelete(true); setEditForm({}); }}
                        style={{ color: "#f87171", fontSize: "10px", textDecoration: "underline", background: "none", border: "none", cursor: "pointer" }}
                      >🗑 Delete</button>
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Current user location */}
          {userLocation && (
            <Marker position={userLocation} icon={createUserLocationIcon()}>
              <Popup>
                <div style={{ background: "#1a2744", color: "white", padding: "10px", borderRadius: "8px", minWidth: "130px", border: "1px solid rgba(59,130,246,0.3)" }}>
                  <p style={{ fontWeight: "bold", fontSize: "13px", margin: "0 0 2px" }}>📍 You are here</p>
                  <p style={{ color: "#93c5fd", fontSize: "11px", margin: 0 }}>Your current location</p>
                </div>
              </Popup>
            </Marker>
          )}

          {/* Panic alert locations */}
          {panicIncidents.map(i => (
            <Marker key={i.id} position={[i.latitude, i.longitude]} icon={createPanicIcon()}>
              <Popup>
                <div style={{ background: "#1a2744", color: "white", padding: "10px", borderRadius: "8px", minWidth: "160px", border: "1px solid rgba(220,38,38,0.4)" }}>
                  <p style={{ fontWeight: "bold", fontSize: "13px", margin: "0 0 4px" }}>🚨 Panic Alert</p>
                  <p style={{ color: "#f87171", fontSize: "11px", margin: "0 0 2px" }}>{i.reported_by}</p>
                  <p style={{ color: "#94a3b8", fontSize: "10px", margin: "0 0 6px" }}>{new Date(i.created_date).toLocaleTimeString()}</p>
                  {user?.role === "admin" && (
                    <button 
                      onClick={async () => {
                        await base44.entities.Incident.update(i.id, { status: "Resolved", is_panic: false });
                        toast.success("Alert resolved");
                        loadData();
                      }}
                      style={{ color: "#10b981", fontSize: "10px", background: "none", border: "none", cursor: "pointer", marginRight: "6px", textDecoration: "underline" }}
                    >
                      ✓ Resolve
                    </button>
                  )}
                  <a href={`https://maps.google.com/?q=${i.latitude},${i.longitude}`} target="_blank" rel="noreferrer"
                    style={{ color: "#d4a843", fontSize: "10px", display: "inline", marginLeft: "4px" }}>📍 Navigate</a>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>



      {/* Checked-in sidebar panel */}
      {showSidebar && (
        <div className="absolute top-12 right-2 z-[1000] bg-[#141f3d]/95 border border-[rgba(212,168,67,0.2)] rounded-xl w-56 max-h-72 overflow-y-auto shadow-xl">
          <div className="px-3 py-2 border-b border-[rgba(212,168,67,0.1)] flex items-center justify-between">
            <span className="text-[#d4a843] text-xs font-bold uppercase tracking-wider">Checked In ({allCheckedIn.length})</span>
            <button onClick={() => setShowSidebar(false)} className="text-slate-500 hover:text-white text-xs">✕</button>
          </div>
          {allCheckedIn.length === 0 ? (
            <p className="text-slate-500 text-xs p-3">No one checked in</p>
          ) : (
            allCheckedIn.map(a => (
              <div key={a.id} className="px-3 py-2 border-b border-[rgba(255,255,255,0.04)] hover:bg-white/5">
                <p className="text-white text-xs font-medium">{a.assigned_to_name}</p>
                <p className="text-[#d4a843] text-[10px]">{a.position_name}</p>
                <p className="text-slate-500 text-[10px]">
                  {a.check_in_latitude ? '📍 GPS' : '⚠️ No GPS'} · {a.check_in_time ? new Date(a.check_in_time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : 'N/A'}
                </p>
              </div>
            ))
          )}
        </div>
      )}
      {!showSidebar && (
        <button onClick={() => setShowSidebar(true)} className="absolute top-12 right-2 z-[1000] bg-[#141f3d]/95 border border-[rgba(212,168,67,0.2)] rounded-lg px-2 py-1 text-[#d4a843] text-xs font-bold shadow-xl">
          👥 {allCheckedIn.length}
        </button>
      )}

      {/* Legend */}
      <div className="bg-[#141f3d] border-t border-[rgba(212,168,67,0.15)] px-4 py-2 flex items-center gap-5 shrink-0">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <div className="w-5 h-5 rounded-full bg-[#1a2744] border-2 border-[#d4a843] flex items-center justify-center text-[8px] font-bold text-[#d4a843]">AB</div>
          Checked-in member
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <div className="w-5 h-5 rounded-full bg-red-600 border-2 border-white flex items-center justify-center text-[10px]">🚨</div>
          Panic alert
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <div className="w-4 h-4 rounded-full bg-blue-500 border-2 border-white" />
          Your location
        </div>
      </div>

      {/* Edit / Delete Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="bg-[#1a2744] border-[rgba(212,168,67,0.2)] max-w-sm z-[9999]">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              {confirmDelete ? <><Trash2 className="w-4 h-4 text-red-400" /> Delete Assignment</> : <><Edit2 className="w-4 h-4 text-[#d4a843]" /> Edit Assignment</>}
            </DialogTitle>
          </DialogHeader>
          {selectedMember && confirmDelete && (
            <div className="space-y-4">
              <p className="text-slate-300 text-sm">Delete assignment for <span className="text-white font-semibold">{selectedMember.assigned_to_name}</span> at <span className="text-[#d4a843]">{selectedMember.position_name}</span>?</p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 border-slate-600 text-slate-400" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
                <Button className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold" onClick={async () => {
                  await base44.entities.Assignment.delete(selectedMember.id);
                  toast.success("Assignment deleted");
                  setEditDialogOpen(false);
                  loadData();
                }}>Delete</Button>
              </div>
            </div>
          )}
          {selectedMember && !confirmDelete && (
            <div className="space-y-3">
              <div>
                <Label className="text-slate-400 text-xs">Position</Label>
                <Select value={editForm.position_name} onValueChange={v => setEditForm(f => ({ ...f, position_name: v }))}>
                  <SelectTrigger className="bg-[#0a1128] border-[rgba(212,168,67,0.2)] text-white mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0a1128] border-[rgba(212,168,67,0.2)]" style={{ zIndex: 99999 }}>
                    {allPositions.map(pos => (
                      <SelectItem key={pos.id} value={pos.name} className="text-white">{pos.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-slate-400 text-xs">Status</Label>
                <Select value={editForm.status} onValueChange={v => setEditForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="bg-[#0a1128] border-[rgba(212,168,67,0.2)] text-white mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0a1128] border-[rgba(212,168,67,0.2)]" style={{ zIndex: 99999 }}>
                    <SelectItem value="Confirmed" className="text-white">Confirmed</SelectItem>
                    <SelectItem value="Pending" className="text-white">Pending</SelectItem>
                    <SelectItem value="Declined" className="text-white">Declined</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-slate-400 text-xs">Start Time</Label>
                  <Input type="time" value={editForm.start_time || ""} onChange={e => setEditForm(f => ({ ...f, start_time: e.target.value }))} className="bg-[#0a1128] border-[rgba(212,168,67,0.2)] text-white mt-1" />
                </div>
                <div>
                  <Label className="text-slate-400 text-xs">End Time</Label>
                  <Input type="time" value={editForm.end_time || ""} onChange={e => setEditForm(f => ({ ...f, end_time: e.target.value }))} className="bg-[#0a1128] border-[rgba(212,168,67,0.2)] text-white mt-1" />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1 border-slate-600 text-slate-400" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
                <Button className="flex-1 bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] font-bold" onClick={async () => {
                  await base44.entities.Assignment.update(selectedMember.id, editForm);
                  toast.success("Assignment updated");
                  setEditDialogOpen(false);
                  loadData();
                }}>Save</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}