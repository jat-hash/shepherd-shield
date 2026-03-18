import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Trash2, Plus, Check, X } from "lucide-react";

const ZONE_COLORS = [
  "#1e3a5f", "#1a3a2a", "#3a1a2a", "#2a2a1a",
  "#1a1f3a", "#1f1a3a", "#2a1a1a", "#1a2f3a", "#1a2a2a",
];

// Inline zone editor — replaces the SVG map when editing
export default function ZoneEditorModal({ open, onOpenChange, zones, onSave }) {
  const [localZones, setLocalZones] = useState(zones);
  const [editingLabelId, setEditingLabelId] = useState(null);
  const [editLabel, setEditLabel] = useState("");
  const [selectedId, setSelectedId] = useState(null);

  const svgRef = useRef(null);
  const dragRef = useRef(null); // { type: 'move'|'resize', zoneId, startX, startY, handle }

  // Sync localZones when zones prop changes (e.g. add from outside)
  // Only sync when modal opens
  const prevOpen = useRef(open);
  if (open && !prevOpen.current) {
    setLocalZones(zones);
    setSelectedId(null);
    setEditingLabelId(null);
  }
  prevOpen.current = open;

  const getSVGCoords = (e) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 80,
    };
  };

  const handleMouseDown = (e, zoneId, type, handle = null) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(zoneId);
    const { x, y } = getSVGCoords(e);
    dragRef.current = { type, zoneId, startX: x, startY: y, handle, origZones: localZones };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("touchmove", handleMouseMove, { passive: false });
    window.addEventListener("touchend", handleMouseUp);
  };

  const handleMouseMove = useCallback((e) => {
    if (!dragRef.current) return;
    e.preventDefault();
    const { type, zoneId, startX, startY, handle, origZones } = dragRef.current;
    const { x, y } = getSVGCoords(e);
    const dx = x - startX;
    const dy = y - startY;

    setLocalZones(origZones.map(z => {
      if (z.id !== zoneId) return z;
      if (type === "move") {
        return {
          ...z,
          x: Math.max(0, Math.min(100 - z.w, z.x + dx)),
          y: Math.max(0, Math.min(80 - z.h, z.y + dy)),
        };
      }
      if (type === "resize") {
        let { x: zx, y: zy, w: zw, h: zh } = z;
        const MIN = 8;
        if (handle === "se") {
          return { ...z, w: Math.max(MIN, zw + dx), h: Math.max(MIN, zh + dy) };
        }
        if (handle === "sw") {
          const newW = Math.max(MIN, zw - dx);
          return { ...z, x: zx + (zw - newW), w: newW, h: Math.max(MIN, zh + dy) };
        }
        if (handle === "ne") {
          const newH = Math.max(MIN, zh - dy);
          return { ...z, y: zy + (zh - newH), w: Math.max(MIN, zw + dx), h: newH };
        }
        if (handle === "nw") {
          const newW = Math.max(MIN, zw - dx);
          const newH = Math.max(MIN, zh - dy);
          return { ...z, x: zx + (zw - newW), y: zy + (zh - newH), w: newW, h: newH };
        }
      }
      return z;
    }));
  }, []);

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", handleMouseUp);
    window.removeEventListener("touchmove", handleMouseMove);
    window.removeEventListener("touchend", handleMouseUp);
  }, [handleMouseMove]);

  const handleAdd = () => {
    const id = `zone_${Date.now()}`;
    const color = ZONE_COLORS[localZones.length % ZONE_COLORS.length];
    const newZone = { id, label: "New Zone", x: 5, y: 5, w: 22, h: 16, color };
    setLocalZones(prev => [...prev, newZone]);
    setSelectedId(id);
    setEditingLabelId(id);
    setEditLabel("New Zone");
  };

  const handleDelete = (id) => {
    setLocalZones(prev => prev.filter(z => z.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const handleSave = () => {
    onSave(localZones);
    onOpenChange(false);
  };

  const handleCancel = () => {
    setLocalZones(zones);
    onOpenChange(false);
  };

  const confirmLabel = () => {
    if (!editLabel.trim()) return;
    setLocalZones(prev => prev.map(z => z.id === editingLabelId ? { ...z, label: editLabel.trim() } : z));
    setEditingLabelId(null);
  };

  if (!open) return null;

  const selected = localZones.find(z => z.id === selectedId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-[#1a2744] border border-slate-700 rounded-xl w-full max-w-3xl flex flex-col gap-3 p-4 shadow-2xl max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#d4a843] font-semibold">
            <Pencil className="w-4 h-4" /> Edit Floor Map Zones
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} className="bg-[#d4a843]/10 border border-[#d4a843]/30 text-[#d4a843] hover:bg-[#d4a843]/20 text-xs h-7 gap-1">
              <Plus className="w-3 h-3" /> Add Zone
            </Button>
            <Button size="sm" onClick={handleSave} className="bg-[#d4a843] text-[#0a1128] hover:bg-[#e0bb5e] text-xs h-7 gap-1">
              <Check className="w-3 h-3" /> Save
            </Button>
            <Button size="sm" variant="ghost" onClick={handleCancel} className="text-slate-400 hover:text-white text-xs h-7">
              <X className="w-3 h-3" />
            </Button>
          </div>
        </div>

        <p className="text-slate-400 text-xs">Drag zones to move • Drag corners to resize • Click to select</p>

        {/* Interactive SVG Canvas */}
        <div className="relative select-none rounded-lg overflow-hidden border border-slate-700" style={{ paddingBottom: "60%" }}>
          <svg
            ref={svgRef}
            viewBox="0 0 100 80"
            className="absolute inset-0 w-full h-full"
            style={{ background: "#0a1128", cursor: "default", touchAction: "none" }}
            onClick={() => setSelectedId(null)}
          >
            <defs>
              <pattern id="editgrid" width="5" height="5" patternUnits="userSpaceOnUse">
                <path d="M 5 0 L 0 0 0 5" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.2" />
              </pattern>
            </defs>
            <rect width="100" height="80" fill="url(#editgrid)" />

            {localZones.map((zone) => {
              const isSel = selectedId === zone.id;
              return (
                <g key={zone.id}>
                  {/* Zone body */}
                  <rect
                    x={zone.x} y={zone.y} width={zone.w} height={zone.h}
                    rx="1"
                    fill={isSel ? "rgba(212,168,67,0.15)" : zone.color}
                    stroke={isSel ? "#d4a843" : "rgba(100,116,139,0.4)"}
                    strokeWidth={isSel ? "0.6" : "0.3"}
                    style={{ cursor: "move" }}
                    onMouseDown={e => handleMouseDown(e, zone.id, "move")}
                    onTouchStart={e => handleMouseDown(e, zone.id, "move")}
                    onClick={e => { e.stopPropagation(); setSelectedId(zone.id); }}
                  />

                  {/* Label */}
                  <text
                    x={zone.x + zone.w / 2}
                    y={zone.y + zone.h / 2 + 0.8}
                    textAnchor="middle"
                    fill={isSel ? "#d4a843" : "rgba(255,255,255,0.8)"}
                    fontSize="2.5"
                    fontWeight="600"
                    style={{ pointerEvents: "none" }}
                  >
                    {zone.label}
                  </text>

                  {/* Resize handles (corners) — only when selected */}
                  {isSel && [
                    { handle: "nw", cx: zone.x, cy: zone.y },
                    { handle: "ne", cx: zone.x + zone.w, cy: zone.y },
                    { handle: "sw", cx: zone.x, cy: zone.y + zone.h },
                    { handle: "se", cx: zone.x + zone.w, cy: zone.y + zone.h },
                  ].map(({ handle, cx, cy }) => (
                    <rect
                      key={handle}
                      x={cx - 1.5} y={cy - 1.5} width={3} height={3}
                      rx="0.5"
                      fill="#d4a843"
                      stroke="#0a1128"
                      strokeWidth="0.3"
                      style={{
                        cursor: handle === "nw" || handle === "se" ? "nwse-resize" : "nesw-resize",
                      }}
                      onMouseDown={e => handleMouseDown(e, zone.id, "resize", handle)}
                      onTouchStart={e => handleMouseDown(e, zone.id, "resize", handle)}
                    />
                  ))}
                </g>
              );
            })}
          </svg>
        </div>

        {/* Selected zone tools */}
        {selected && (
          <div className="flex items-center gap-3 bg-[#0a1128] rounded-lg px-3 py-2">
            <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: selected.color, border: "1px solid rgba(255,255,255,0.2)" }} />
            {editingLabelId === selected.id ? (
              <div className="flex-1 flex gap-1.5">
                <Input
                  value={editLabel}
                  onChange={e => setEditLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") confirmLabel(); if (e.key === "Escape") setEditingLabelId(null); }}
                  className="h-7 text-xs bg-[#1a2744] border-slate-600 text-white flex-1"
                  autoFocus
                />
                <Button size="sm" onClick={confirmLabel} className="h-7 px-2 bg-[#d4a843] text-[#0a1128] hover:bg-[#e0bb5e] text-xs">Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingLabelId(null)} className="h-7 px-2 text-slate-400 text-xs">✕</Button>
              </div>
            ) : (
              <>
                <span className="text-white text-sm flex-1 font-medium">{selected.label}</span>
                <span className="text-slate-500 text-xs">
                  {Math.round(selected.w)}×{Math.round(selected.h)} at ({Math.round(selected.x)},{Math.round(selected.y)})
                </span>
                <button onClick={() => { setEditingLabelId(selected.id); setEditLabel(selected.label); }} className="text-slate-500 hover:text-[#d4a843] p-1" title="Rename">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => handleDelete(selected.id)} className="text-slate-500 hover:text-red-400 p-1" title="Delete">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}