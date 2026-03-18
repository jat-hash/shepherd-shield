import { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { DEFAULT_ZONES } from "./FloorMapData";
import ZoneTooltip from "./ZoneTooltip";
import PinEquipmentModal from "./PinEquipmentModal";
import { MapPin, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import ZoneEditorModal from "./ZoneEditorModal";

const STORAGE_KEY = "floormap_zone_pins";
const ZONES_KEY = "floormap_custom_zones";

function loadPins() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
}
function savePins(pins) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pins));
}
function loadZones(defaults) {
  try {
    const saved = localStorage.getItem(ZONES_KEY);
    return saved ? JSON.parse(saved) : defaults;
  } catch { return defaults; }
}
function saveZones(zones) {
  localStorage.setItem(ZONES_KEY, JSON.stringify(zones));
}

export default function FloorMap({ isAdmin }) {
  const [equipment, setEquipment] = useState([]);
  const [zonePins, setZonePins] = useState(loadPins); // { zoneId: [equipId, ...] }
  const [hovered, setHovered] = useState(null); // { zone, position }
  const [clicked, setClicked] = useState(null); // zone id for modal pin
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [pinModal, setPinModal] = useState(false);
  const [selectedZone, setSelectedZone] = useState(null);
  const [zones, setZones] = useState(() => loadZones(DEFAULT_ZONES));
  const [zoneEditorOpen, setZoneEditorOpen] = useState(false);
  const svgRef = useRef(null);

  useEffect(() => {
    base44.entities.Equipment.list().then(setEquipment).catch(() => {});
    const unsub = base44.entities.Equipment.subscribe((ev) => {
      setEquipment(prev =>
        ev.type === "create" ? [...prev, ev.data]
        : ev.type === "update" ? prev.map(e => e.id === ev.id ? ev.data : e)
        : prev.filter(e => e.id !== ev.id)
      );
    });
    return unsub;
  }, []);

  const handleSavePins = (zoneId, newPinnedIds) => {
    const updated = { ...zonePins, [zoneId]: newPinnedIds };
    setZonePins(updated);
    savePins(updated);
  };

  const getZoneEquipment = (zoneId) => {
    const ids = zonePins[zoneId] || [];
    return equipment.filter(e => ids.includes(e.id));
  };

  const handleZoneMouseEnter = (zone) => {
    const svgRect = svgRef.current?.getBoundingClientRect();
    if (!svgRect) return;
    const cx = ((zone.x + zone.w / 2) / 100) * svgRect.width;
    const cy = (zone.y / 100) * svgRect.height;
    setTooltipPos({ x: cx, y: cy });
    setHovered({ id: zone.id, label: zone.label, x: zone.x, y: zone.y, w: zone.w, h: zone.h });
  };

  const handleZoneClick = (zone) => {
    if (!isAdmin) return;
    setSelectedZone({ ...zone, pinned: zonePins[zone.id] || [] });
    setPinModal(true);
  };

  const handleSaveZones = (updatedZones) => {
    setZones(updatedZones);
    saveZones(updatedZones);
  };

  const allPinnedCount = Object.values(zonePins).flat().length;

  return (
    <div className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.15)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-[#d4a843]" />
          <span className="text-white font-semibold text-sm">Floor Map</span>
          <span className="text-slate-500 text-xs">({allPinnedCount} items pinned)</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {isAdmin && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setZoneEditorOpen(true)}
              className="h-7 px-2 text-[#d4a843]/70 hover:text-[#d4a843] hover:bg-[#d4a843]/10 text-xs gap-1"
            >
              <Pencil className="w-3 h-3" /> Edit Zones
            </Button>
          )}
          <span className="text-slate-600">Hover to inspect</span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 px-4 py-2 border-b border-slate-700/30 text-xs">
        <span className="flex items-center gap-1.5 text-emerald-400">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" /> Available
        </span>
        <span className="flex items-center gap-1.5 text-orange-400">
          <span className="w-2.5 h-2.5 rounded-full bg-orange-400 inline-block" /> Checked Out
        </span>
        <span className="flex items-center gap-1.5 text-slate-500">
          <span className="w-2.5 h-2.5 rounded-full bg-slate-600 inline-block" /> Empty Zone
        </span>
      </div>

      {/* SVG Map */}
      <div className="relative select-none" style={{ paddingBottom: "75%" }}>
        <svg
          ref={svgRef}
          viewBox="0 0 100 80"
          className="absolute inset-0 w-full h-full"
          style={{ background: "#0a1128" }}
        >
          {/* Grid lines */}
          <defs>
            <pattern id="grid" width="5" height="5" patternUnits="userSpaceOnUse">
              <path d="M 5 0 L 0 0 0 5" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="0.2" />
            </pattern>
          </defs>
          <rect width="100" height="80" fill="url(#grid)" />

          {zones.map(zone => {
            const zoneEquip = getZoneEquipment(zone.id);
            const available = zoneEquip.filter(e => !e.checked_out).length;
            const checkedOut = zoneEquip.filter(e => e.checked_out).length;
            const isHovered = hovered?.id === zone.id;

            // Determine status color for border
            let borderColor = "rgba(100,116,139,0.3)";
            if (zoneEquip.length > 0) {
              borderColor = checkedOut > 0 ? "rgba(251,146,60,0.6)" : "rgba(52,211,153,0.6)";
            }
            if (isHovered) borderColor = "#d4a843";

            return (
              <g key={zone.id}>
                <rect
                  x={zone.x} y={zone.y} width={zone.w} height={zone.h}
                  rx="1"
                  fill={isHovered ? "rgba(212,168,67,0.08)" : zone.color}
                  stroke={borderColor}
                  strokeWidth={isHovered ? "0.5" : "0.3"}
                  style={{ cursor: isAdmin ? "pointer" : "default", transition: "fill 0.2s" }}
                  onMouseEnter={() => handleZoneMouseEnter(zone)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => handleZoneClick(zone)}
                />

                {/* Zone label */}
                <text
                  x={zone.x + zone.w / 2}
                  y={zone.y + 4.5}
                  textAnchor="middle"
                  fill="rgba(255,255,255,0.7)"
                  fontSize="2.2"
                  fontWeight="600"
                  style={{ pointerEvents: "none" }}
                >
                  {zone.label}
                </text>

                {/* Equipment dots */}
                {zoneEquip.length > 0 && (
                  <g style={{ pointerEvents: "none" }}>
                    {zoneEquip.slice(0, 8).map((item, i) => (
                      <circle
                        key={item.id}
                        cx={zone.x + 2.5 + (i % 4) * 3.2}
                        cy={zone.y + zone.h - 3.5 - Math.floor(i / 4) * 3.2}
                        r="1.2"
                        fill={item.checked_out ? "#fb923c" : "#34d399"}
                        opacity="0.9"
                      />
                    ))}
                    {zoneEquip.length > 8 && (
                      <text
                        x={zone.x + zone.w - 2}
                        y={zone.y + zone.h - 2}
                        textAnchor="end"
                        fill="rgba(255,255,255,0.5)"
                        fontSize="2"
                        style={{ pointerEvents: "none" }}
                      >
                        +{zoneEquip.length - 8}
                      </text>
                    )}
                  </g>
                )}

                {/* Pin icon for admin zones with no items */}
                {isAdmin && zoneEquip.length === 0 && (
                  <text
                    x={zone.x + zone.w / 2}
                    y={zone.y + zone.h / 2 + 1}
                    textAnchor="middle"
                    fill="rgba(212,168,67,0.2)"
                    fontSize="3"
                    style={{ pointerEvents: "none" }}
                  >
                    +
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Hover Tooltip */}
        {hovered && (
          <ZoneTooltip
            zone={hovered}
            equipment={getZoneEquipment(hovered.id)}
            position={tooltipPos}
            onClose={() => setHovered(null)}
          />
        )}
      </div>

      {/* Pin Modal */}
      {isAdmin && (
        <PinEquipmentModal
          open={pinModal}
          onOpenChange={setPinModal}
          zone={selectedZone}
          allEquipment={equipment}
          pinnedItems={equipment.filter(e => Object.values(zonePins).flat().includes(e.id))}
          onSave={handleSavePins}
        />
      )}
    </div>
  );
}