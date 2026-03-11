import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Shield } from "lucide-react";

const ALLOWED_ROLES = ["admin", "pastor", "team leader", "teamleader", "team_leader"];

const DEMO_POINTS = [
  // Scattered demographic sample data around a central point
  { id: 1, lat: 47.260, lng: -122.450, race: "black", income: "$42,000" },
  { id: 2, lat: 47.255, lng: -122.440, race: "white", income: "$68,000" },
  { id: 3, lat: 47.248, lng: -122.455, race: "hispanic", income: "$38,000" },
  { id: 4, lat: 47.263, lng: -122.435, race: "asian", income: "$75,000" },
  { id: 5, lat: 47.258, lng: -122.462, race: "black", income: "$51,000" },
  { id: 6, lat: 47.252, lng: -122.448, race: "white", income: "$55,000" },
  { id: 7, lat: 47.270, lng: -122.444, race: "hispanic", income: "$33,000" },
  { id: 8, lat: 47.244, lng: -122.432, race: "asian", income: "$82,000" },
  { id: 9, lat: 47.267, lng: -122.458, race: "black", income: "$47,000" },
  { id: 10, lat: 47.242, lng: -122.465, race: "white", income: "$61,000" },
  { id: 11, lat: 47.275, lng: -122.430, race: "hispanic", income: "$40,000" },
  { id: 12, lat: 47.256, lng: -122.472, race: "black", income: "$45,000" },
  { id: 13, lat: 47.261, lng: -122.425, race: -122.425, race: "asian", income: "$79,000" },
  { id: 14, lat: 47.239, lng: -122.453, race: "white", income: "$58,000" },
  { id: 15, lat: 47.272, lng: -122.468, race: "hispanic", income: "$36,000" },
  { id: 16, lat: 47.246, lng: -122.442, race: "black", income: "$43,000" },
  { id: 17, lat: 47.265, lng: -122.478, race: "white", income: "$72,000" },
  { id: 18, lat: 47.253, lng: -122.420, race: "asian", income: "$88,000" },
  { id: 19, lat: 47.278, lng: -122.450, race: "hispanic", income: "$35,000" },
  { id: 20, lat: 47.241, lng: -122.475, race: "black", income: "$49,000" },
  { id: 21, lat: 47.269, lng: -122.415, race: "white", income: "$64,000" },
  { id: 22, lat: 47.250, lng: -122.485, race: "asian", income: "$91,000" },
  { id: 23, lat: 47.282, lng: -122.440, race: "hispanic", income: "$37,000" },
  { id: 24, lat: 47.237, lng: -122.460, race: "black", income: "$44,000" },
  { id: 25, lat: 47.257, lng: -122.430, race: "white", income: "$67,000" },
  { id: 26, lat: 47.274, lng: -122.465, race: "hispanic", income: "$39,000" },
  { id: 27, lat: 47.243, lng: -122.445, race: "asian", income: "$85,000" },
  { id: 28, lat: 47.260, lng: -122.480, race: "black", income: "$46,000" },
  { id: 29, lat: 47.248, lng: -122.415, race: "white", income: "$70,000" },
  { id: 30, lat: 47.280, lng: -122.455, race: "hispanic", income: "$34,000" },
];

const RACE_COLORS = {
  black: "#a855f7",
  white: "#e2e8f0",
  hispanic: "#f97316",
  asian: "#3b82f6",
};

const RACE_LABELS = {
  black: "Black",
  white: "White",
  hispanic: "Hispanic",
  asian: "Asian",
};

const FILTER_BUTTONS = [
  { key: "all", label: "All" },
  { key: "black", label: "Black", color: "#a855f7" },
  { key: "white", label: "White", color: "#e2e8f0" },
  { key: "hispanic", label: "Hispanic", color: "#f97316" },
  { key: "asian", label: "Asian", color: "#3b82f6" },
];

function MapResizer() {
  const map = useMap();
  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 200);
  }, [map]);
  return null;
}

export default function Demographics() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState("all");

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const isAllowed = useMemo(() => {
    if (!user) return false;
    const role = (user.role || "").toLowerCase().trim();
    return ALLOWED_ROLES.some(r => role === r || role.includes(r));
  }, [user]);

  const filteredPoints = useMemo(() => {
    if (activeFilter === "all") return DEMO_POINTS;
    return DEMO_POINTS.filter(p => p.race === activeFilter);
  }, [activeFilter]);

  const counts = useMemo(() => {
    const c = { black: 0, white: 0, hispanic: 0, asian: 0 };
    DEMO_POINTS.forEach(p => { if (c[p.race] !== undefined) c[p.race]++; });
    return c;
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a1128] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#d4a843] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAllowed) {
    return (
      <div className="min-h-screen bg-[#0a1128] flex items-center justify-center text-white">
        <div className="text-center space-y-3">
          <Shield className="w-16 h-16 text-[#d4a843] mx-auto" />
          <h2 className="text-xl font-bold">Access Restricted</h2>
          <p className="text-slate-400">This page is only available to Pastors, Team Leaders, and Admins.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a1128] text-white flex flex-col lg:pl-56">
      {/* Header */}
      <div className="px-4 py-4 border-b border-[rgba(212,168,67,0.15)] bg-[#141f3d]">
        <h1 className="text-2xl font-bold text-[#d4a843]">Demographic Intelligence Map</h1>
        <p className="text-slate-400 text-sm mt-0.5">Community demographics around the area</p>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-4 gap-2 px-4 py-3 bg-[#0f1a35]">
        {Object.entries(counts).map(([race, count]) => (
          <div key={race} className="bg-[#1a2744] rounded-lg px-3 py-2 flex items-center gap-2">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: RACE_COLORS[race] }} />
            <div>
              <p className="text-white font-bold text-sm">{count}</p>
              <p className="text-slate-400 text-[10px] uppercase tracking-wider">{RACE_LABELS[race]}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filter Buttons */}
      <div className="flex flex-wrap gap-2 px-4 py-3 bg-[#0f1a35] border-b border-[rgba(212,168,67,0.15)]">
        <span className="text-slate-400 text-xs uppercase tracking-wider self-center mr-1">Filter:</span>
        {FILTER_BUTTONS.map(btn => (
          <button
            key={btn.key}
            onClick={() => setActiveFilter(btn.key)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
              activeFilter === btn.key
                ? "border-[#d4a843] bg-[#d4a843] text-[#0a1128]"
                : "border-[rgba(212,168,67,0.2)] text-slate-300 hover:border-[#d4a843] hover:text-white"
            }`}
            style={activeFilter === btn.key ? {} : { borderLeftColor: btn.color || undefined }}
          >
            {btn.color && (
              <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: btn.color }} />
            )}
            {btn.label}
          </button>
        ))}
        <span className="ml-auto text-slate-500 text-xs self-center">{filteredPoints.length} points shown</span>
      </div>

      {/* Map */}
      <div className="flex-1" style={{ minHeight: "500px" }}>
        <MapContainer
          center={[47.253, -122.4443]}
          zoom={12}
          style={{ height: "100%", minHeight: "500px", width: "100%" }}
          className="z-0"
        >
          <MapResizer />
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'
          />
          {filteredPoints.map(point => (
            <CircleMarker
              key={point.id}
              center={[point.lat, point.lng]}
              radius={7}
              pathOptions={{
                color: RACE_COLORS[point.race],
                fillColor: RACE_COLORS[point.race],
                fillOpacity: 0.8,
                weight: 1.5,
              }}
            >
              <Popup className="demographics-popup">
                <div className="bg-[#1a2744] text-white p-2 rounded text-sm min-w-[120px]">
                  <p className="font-bold text-[#d4a843] mb-1">Demographic Data</p>
                  <p><span className="text-slate-400">Race:</span> {RACE_LABELS[point.race]}</p>
                  <p><span className="text-slate-400">Income:</span> {point.income}</p>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      {/* Legend */}
      <div className="px-4 py-3 bg-[#141f3d] border-t border-[rgba(212,168,67,0.15)] flex flex-wrap gap-4">
        <span className="text-slate-400 text-xs uppercase tracking-wider self-center">Legend:</span>
        {Object.entries(RACE_COLORS).map(([race, color]) => (
          <div key={race} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ background: color }} />
            <span className="text-slate-300 text-xs">{RACE_LABELS[race]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}