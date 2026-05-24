import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { CheckCircle, XCircle, Users, MapPin, ChevronRight, RefreshCw } from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

function createMemberIcon(name, photoUrl) {
  if (photoUrl) {
    return L.divIcon({
      className: "",
      html: `<div style="width:30px;height:30px;border-radius:50%;overflow:hidden;border:2px solid #d4a843;box-shadow:0 2px 8px rgba(212,168,67,0.4);"><img src="${photoUrl}" style="width:100%;height:100%;object-fit:cover;" /></div>`,
      iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -15],
    });
  }
  const initials = name ? name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() : "?";
  return L.divIcon({
    className: "",
    html: `<div style="width:30px;height:30px;background:#1a2744;border:2px solid #d4a843;border-radius:50%;box-shadow:0 2px 8px rgba(212,168,67,0.4);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;color:#d4a843;">${initials}</div>`,
    iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -15],
  });
}


export default function AdminDashboardPanel({ allUsers = [] }) {
  const [activeTab, setActiveTab] = useState("monitor");
  const [checkedIn, setCheckedIn] = useState([]);
  const [notCheckedIn, setNotCheckedIn] = useState([]);
  const [mapMembers, setMapMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const todayLocal = new Date();
    const today = `${todayLocal.getFullYear()}-${String(todayLocal.getMonth() + 1).padStart(2, '0')}-${String(todayLocal.getDate()).padStart(2, '0')}`;

    try {
    const [assignments, personalCheckIns, liveLocations] = await Promise.all([
      base44.entities.Assignment.filter({ service_date: today }, "-start_time", 200),
      base44.entities.PersonalCheckIn.filter({ check_in_date: today }, "-check_in_time", 100),
      base44.entities.LiveLocation.filter({ is_active: true }, "-last_updated", 100),
    ]);

    const liveByEmail = {};
    liveLocations.forEach(l => { liveByEmail[(l.user_email || '').toLowerCase()] = l; });

    const personalByEmail = {};
    // Only open (no check_out_time) records count as checked in
    personalCheckIns.filter(p => !p.check_out_time).forEach(p => {
      if (p.user_email && !personalByEmail[p.user_email.toLowerCase()]) {
        personalByEmail[p.user_email.toLowerCase()] = p;
      }
    });

    // Enrich assignments
    const enriched = assignments.map(a => {
      const live = liveByEmail[(a.assigned_to_email || '').toLowerCase()];
      const personal = personalByEmail[(a.assigned_to_email || '').toLowerCase()];
      const isIn = a.checked_in || !!live || !!personal;
      const lat = live?.latitude || personal?.latitude || a.check_in_latitude;
      const lng = live?.longitude || personal?.longitude || a.check_in_longitude;
      return { ...a, _resolved_in: isIn && !a.checked_out, lat, lng };
    });

    const assignmentEmails = new Set(assignments.map(a => (a.assigned_to_email || '').toLowerCase()));

    // Personal only (no assignment)
    const personalOnly = Object.values(personalByEmail)
      .filter(p => !assignmentEmails.has((p.user_email || '').toLowerCase()))
      .map(p => ({
        id: p.id,
        assigned_to_name: p.user_name,
        assigned_to_email: p.user_email,
        position_name: "Personal Check-in",
        _resolved_in: true,
        lat: liveByEmail[(p.user_email || '').toLowerCase()]?.latitude || p.latitude,
        lng: liveByEmail[(p.user_email || '').toLowerCase()]?.longitude || p.longitude,
      }));

    const allRecords = [...enriched, ...personalOnly];
    setCheckedIn(allRecords.filter(a => a._resolved_in));
    setNotCheckedIn(enriched.filter(a => !a._resolved_in && !a.checked_out));

    // Map members: checked-in with GPS
    setMapMembers(allRecords.filter(a => a._resolved_in && a.lat && a.lng));
    setLoading(false);
    } catch (err) {
      if (err?.message?.includes('Rate limit')) {
        console.warn('AdminDashboardPanel: rate limited, will retry later');
      }
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => load(), 2000);
    const interval = setInterval(() => load(), 300000); // 5 min interval
    return () => { clearTimeout(timeout); clearInterval(interval); };
  }, [load]);

  const mapCenter = mapMembers.length > 0
    ? [mapMembers[0].lat, mapMembers[0].lng]
    : [47.0637, -122.2525];

  return (
    <div className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.15)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(212,168,67,0.1)]">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-[#d4a843]" />
          <span className="text-white font-bold text-sm">Team Status</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">{checkedIn.length} in</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400">{notCheckedIn.length} pending</span>
        </div>
        <button onClick={load} className="text-slate-500 hover:text-[#d4a843] transition-colors">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[rgba(212,168,67,0.1)]">
        {["monitor", "map"].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
              activeTab === tab
                ? "text-[#d4a843] border-b-2 border-[#d4a843]"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {tab === "monitor" ? "👥 Monitor" : "🗺 Live Map"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-5 h-5 border-2 border-[#d4a843] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : activeTab === "monitor" ? (
        <div className="divide-y divide-[rgba(255,255,255,0.04)] max-h-72 overflow-y-auto">
          {checkedIn.length === 0 && notCheckedIn.length === 0 && (
            <p className="text-slate-500 text-xs text-center py-8">No assignments today</p>
          )}
          {checkedIn.map(a => {
            const u = allUsers.find(u => u.email === a.assigned_to_email);
            const photo = u?.profile_photo || u?.data?.profile_photo;
            return (
              <div key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                {photo ? (
                  <img src={photo} alt={a.assigned_to_name} className="w-7 h-7 rounded-full object-cover border border-[#d4a843]" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-[#d4a843]/20 border border-[#d4a843] flex items-center justify-center text-[#d4a843] text-[10px] font-bold">
                    {(a.assigned_to_name || '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-white text-xs font-medium truncate">{a.assigned_to_name}</p>
                  <p className="text-slate-500 text-[10px] truncate">{a.position_name}</p>
                </div>
                <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              </div>
            );
          })}
          {notCheckedIn.map(a => {
            const u = allUsers.find(u => u.email === a.assigned_to_email);
            const photo = u?.profile_photo || u?.data?.profile_photo;
            return (
              <div key={a.id} className="flex items-center gap-3 px-4 py-2.5 opacity-60">
                {photo ? (
                  <img src={photo} alt={a.assigned_to_name} className="w-7 h-7 rounded-full object-cover border border-slate-600" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-slate-400 text-[10px] font-bold">
                    {(a.assigned_to_name || '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-white text-xs font-medium truncate">{a.assigned_to_name}</p>
                  <p className="text-slate-500 text-[10px] truncate">{a.position_name}</p>
                </div>
                <XCircle className="w-4 h-4 text-slate-500 flex-shrink-0" />
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ height: "260px" }}>
          {mapMembers.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-500 text-xs">
              <div className="text-center">
                <MapPin className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                No members with GPS on-site
              </div>
            </div>
          ) : (
            <MapContainer center={mapCenter} zoom={16} style={{ height: "100%", width: "100%" }} zoomControl={false}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" maxZoom={22} maxNativeZoom={19} />
              {mapMembers.map(a => {
                const u = allUsers.find(u => u.email === a.assigned_to_email);
                const photo = u?.profile_photo || u?.data?.profile_photo;
                return (
                  <Marker key={a.id} position={[a.lat, a.lng]} icon={createMemberIcon(a.assigned_to_name, photo)}>
                    <Popup>
                      <div style={{ background: "#1a2744", color: "white", padding: "8px", borderRadius: "6px", minWidth: "130px", border: "1px solid rgba(212,168,67,0.2)", fontSize: "11px" }}>
                        <p style={{ fontWeight: "bold", margin: "0 0 2px" }}>{a.assigned_to_name}</p>
                        <p style={{ color: "#d4a843", margin: "0 0 2px" }}>{a.position_name}</p>
                        <p style={{ color: "#10b981", margin: 0 }}>✓ Checked In</p>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </MapContainer>
          )}
        </div>
      )}

      {/* Footer links */}
      <div className="flex border-t border-[rgba(212,168,67,0.1)]">
        <Link to={createPageUrl("AdminMonitor")} className="flex-1 flex items-center justify-center gap-1 py-2.5 text-xs text-[#d4a843] hover:bg-[#d4a843]/5 transition-colors">
          Full Monitor <ChevronRight className="w-3 h-3" />
        </Link>
        <div className="w-px bg-[rgba(212,168,67,0.1)]" />
        <Link to={createPageUrl("TeamMap")} className="flex-1 flex items-center justify-center gap-1 py-2.5 text-xs text-[#d4a843] hover:bg-[#d4a843]/5 transition-colors">
          Full Map <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}