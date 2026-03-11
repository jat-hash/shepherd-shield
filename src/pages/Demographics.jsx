import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { BarChart2, Users } from "lucide-react";

const ALLOWED_ROLES = ["admin", "pastor", "team leader", "team_leader"];

// Sample demographic data points around Federal Way / South King County, WA
const RAW_DATA = [
  ...Array.from({length:60}, (_,i) => ({ id:`b${i}`, race:"black",   lat:47.3230+Math.random()*0.15-0.075, lng:-122.3443+Math.random()*0.18-0.09, income:"$42,000" })),
  ...Array.from({length:80}, (_,i) => ({ id:`w${i}`, race:"white",   lat:47.2530+Math.random()*0.18-0.09,  lng:-122.4443+Math.random()*0.20-0.10, income:"$68,000" })),
  ...Array.from({length:70}, (_,i) => ({ id:`h${i}`, race:"hispanic",lat:47.2130+Math.random()*0.14-0.07,  lng:-122.4043+Math.random()*0.16-0.08, income:"$51,000" })),
  ...Array.from({length:50}, (_,i) => ({ id:`a${i}`, race:"asian",   lat:47.2830+Math.random()*0.12-0.06,  lng:-122.3643+Math.random()*0.14-0.07, income:"$74,000" })),
  ...Array.from({length:25}, (_,i) => ({ id:`o${i}`, race:"other",   lat:47.2430+Math.random()*0.16-0.08,  lng:-122.4243+Math.random()*0.16-0.08, income:"$47,000" })),
];

const RACE_COLORS = {
  black:    "#a78bfa",
  white:    "#f9fafb",
  hispanic: "#fb923c",
  asian:    "#38bdf8",
  other:    "#4ade80",
};

const RACE_LABELS = {
  black: "Black", white: "White", hispanic: "Hispanic", asian: "Asian", other: "Other"
};

function RecenterMap({ center }) {
  const map = useMap();
  useEffect(() => { map.setView(center, 11); }, [center]);
  return null;
}

export default function Demographics() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    base44.auth.me().then(u => {
      setUser(u);
      const role = (u?.role || "").toLowerCase();
      if (!ALLOWED_ROLES.includes(role)) setAccessDenied(true);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const filtered = filter === "all" ? RAW_DATA : RAW_DATA.filter(d => d.race === filter);

  const counts = Object.keys(RACE_LABELS).reduce((acc, r) => {
    acc[r] = RAW_DATA.filter(d => d.race === r).length;
    return acc;
  }, {});

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-[#0a1128]">
      <div className="w-8 h-8 border-2 border-[#d4a843] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (accessDenied) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a1128] text-white gap-4">
      <BarChart2 className="w-16 h-16 text-slate-600" />
      <h2 className="text-2xl font-bold text-slate-400">Access Restricted</h2>
      <p className="text-slate-500">This page is only available to Pastors, Team Leaders, and Admins.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a1128] text-white lg:pl-56 flex flex-col">
      {/* Header */}
      <div className="px-4 py-4 border-b border-[rgba(212,168,67,0.15)] flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-6 h-6 text-[#d4a843]" />
          <h1 className="text-xl font-bold text-[#d4a843]">Demographic Intelligence Map</h1>
        </div>
        <div className="sm:ml-auto flex items-center gap-2 text-sm text-slate-400">
          <Users className="w-4 h-4" />
          {filtered.length} points shown
        </div>
      </div>

      <div className="flex flex-col lg:flex-row flex-1" style={{minHeight: "calc(100vh - 120px)"}}>
        {/* Sidebar */}
        <div className="w-full lg:w-64 bg-[#141f3d] border-b lg:border-b-0 lg:border-r border-[rgba(212,168,67,0.15)] p-4 flex flex-col gap-4">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-2 font-semibold">Filter by Race</p>
            <div className="flex flex-wrap lg:flex-col gap-2">
              <button
                onClick={() => setFilter("all")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all text-left ${
                  filter === "all"
                    ? "bg-[#d4a843] text-[#0a1128]"
                    : "bg-[#1a2744] text-slate-300 hover:bg-[#1a2744]/80"
                }`}
              >
                All ({RAW_DATA.length})
              </button>
              {Object.entries(RACE_LABELS).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all text-left flex items-center gap-2 ${
                    filter === key
                      ? "bg-[#d4a843] text-[#0a1128]"
                      : "bg-[#1a2744] text-slate-300 hover:bg-[#1a2744]/80"
                  }`}
                >
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0 border border-white/20"
                    style={{ backgroundColor: RACE_COLORS[key] }}
                  />
                  {label} ({counts[key]})
                </button>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="border-t border-[rgba(212,168,67,0.1)] pt-4">
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-3 font-semibold">Legend</p>
            <div className="space-y-2">
              {Object.entries(RACE_LABELS).map(([key, label]) => (
                <div key={key} className="flex items-center gap-2 text-sm text-slate-300">
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0 border border-white/20"
                    style={{ backgroundColor: RACE_COLORS[key] }}
                  />
                  {label}
                </div>
              ))}
            </div>
          </div>

          {/* Stats */}
          <div className="border-t border-[rgba(212,168,67,0.1)] pt-4">
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-3 font-semibold">Area Stats</p>
            <div className="space-y-2">
              {Object.entries(RACE_LABELS).map(([key, label]) => {
                const pct = Math.round((counts[key] / RAW_DATA.length) * 100);
                return (
                  <div key={key}>
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span>{label}</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-[#0a1128] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: RACE_COLORS[key] }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Map */}
        <div className="flex-1" style={{minHeight: "400px"}}>
          <MapContainer
            center={[47.2530, -122.4443]}
            zoom={11}
            style={{ width: "100%", height: "100%", minHeight: "400px" }}
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://carto.com/">CartoDB</a>'
            />
            {filtered.map(point => (
              <CircleMarker
                key={point.id}
                center={[point.lat, point.lng]}
                radius={5}
                fillColor={RACE_COLORS[point.race]}
                color="transparent"
                fillOpacity={0.75}
              >
                <Popup className="dark-popup">
                  <div style={{ background: "#1a2744", color: "white", padding: "8px", borderRadius: "6px", minWidth: "140px" }}>
                    <strong style={{ color: "#d4a843" }}>Demographic Data</strong><br/>
                    Race: {RACE_LABELS[point.race]}<br/>
                    Est. Income: {point.income}
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>
      </div>
    </div>
  );
}