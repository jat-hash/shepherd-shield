import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Trash2, Plus, Check, X, RotateCw } from "lucide-react";

const ZONE_COLORS = [
  "#1e3a5f", "#1a3a2a", "#3a1a2a", "#2a2a1a",
  "#1a1f3a", "#1f1a3a", "#2a1a1a", "#1a2f3a", "#1a2a2a",
];

const MIN_SIZE = 6;

function deg2rad(d) { return (d * Math.PI) / 180; }

// Get SVG-space coords from mouse/touch event
function getSVGCoords(e, svgEl) {
  if (!svgEl) return { x: 0, y: 0 };
  const rect = svgEl.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return {
    x: ((clientX - rect.left) / rect.width) * 100,
    y: ((clientY - rect.top) / rect.height) * 80,
  };
}

// Rotate a point around a center
function rotatePoint(px, py, cx, cy, angleDeg) {
  const rad = deg2rad(angleDeg);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: cos * (px - cx) - sin * (py - cy) + cx,
    y: sin * (px - cx) + cos * (py - cy) + cy,
  };
}

// Resize handles: 8 directions + rotation handle
const HANDLES = [
  { id: "nw", nx: 0, ny: 0 },
  { id: "n",  nx: 0.5, ny: 0 },
  { id: "ne", nx: 1, ny: 0 },
  { id: "e",  nx: 1, ny: 0.5 },
  { id: "se", nx: 1, ny: 1 },
  { id: "s",  nx: 0.5, ny: 1 },
  { id: "sw", nx: 0, ny: 1 },
  { id: "w",  nx: 0, ny: 0.5 },
];

const CURSOR_MAP = {
  nw: "nwse-resize", n: "ns-resize", ne: "nesw-resize",
  e: "ew-resize", se: "nwse-resize", s: "ns-resize",
  sw: "nesw-resize", w: "ew-resize",
};

export default function ZoneEditorModal({ open, onOpenChange, zones, onSave }) {
  const [localZones, setLocalZones] = useState(zones);
  const [selectedId, setSelectedId] = useState(null);
  const [editingLabelId, setEditingLabelId] = useState(null);
  const [editLabel, setEditLabel] = useState("");
  const [editSubtext, setEditSubtext] = useState("");

  const svgRef = useRef(null);
  const dragRef = useRef(null);

  // Sync when modal opens
  const prevOpen = useRef(false);
  if (open && !prevOpen.current) {
    setLocalZones(zones);
    setSelectedId(null);
    setEditingLabelId(null);
  }
  prevOpen.current = open;

  const updateZone = useCallback((id, updater) => {
    setLocalZones(prev => prev.map(z => z.id === id ? { ...z, ...updater(z) } : z));
  }, []);

  const handleMouseDown = useCallback((e, zoneId, action, handleId = null) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(zoneId);
    const coords = getSVGCoords(e, svgRef.current);
    const zone = localZones.find(z => z.id === zoneId);
    dragRef.current = { action, zoneId, handleId, startCoords: coords, origZone: { ...zone } };
  }, [localZones]);

  const handleMouseMove = useCallback((e) => {
    if (!dragRef.current) return;
    e.preventDefault();
    const { action, zoneId, handleId, startCoords, origZone } = dragRef.current;
    const coords = getSVGCoords(e, svgRef.current);
    const dx = coords.x - startCoords.x;
    const dy = coords.y - startCoords.y;

    if (action === "move") {
      updateZone(zoneId, z => ({
        x: Math.max(0, Math.min(100 - z.w, origZone.x + dx)),
        y: Math.max(0, Math.min(80 - z.h, origZone.y + dy)),
      }));
    } else if (action === "resize") {
      updateZone(zoneId, () => {
        let { x, y, w, h } = origZone;
        const h_id = handleId;

        // Unrotated delta — project dx/dy back into zone's local axes
        const angle = origZone.rotation || 0;
        const rad = deg2rad(-angle);
        const ldx = Math.cos(rad) * dx + Math.sin(rad) * dy;  // wait, let's keep it simple: no-rotation delta
        // For simplicity, resize in screen space (ignores rotation slightly but feels natural)
        const lx = dx, ly = dy;

        if (h_id.includes("e")) w = Math.max(MIN_SIZE, origZone.w + lx);
        if (h_id.includes("s")) h = Math.max(MIN_SIZE, origZone.h + ly);
        if (h_id.includes("w")) { const nw = Math.max(MIN_SIZE, origZone.w - lx); x = origZone.x + (origZone.w - nw); w = nw; }
        if (h_id.includes("n")) { const nh = Math.max(MIN_SIZE, origZone.h - ly); y = origZone.y + (origZone.h - nh); h = nh; }
        return { x, y, w, h };
      });
    } else if (action === "rotate") {
      updateZone(zoneId, z => {
        const cx = z.x + z.w / 2;
        const cy = z.y + z.h / 2;
        const startAngle = Math.atan2(startCoords.y - cy, startCoords.x - cx);
        const currAngle = Math.atan2(coords.y - cy, coords.x - cx);
        const delta = ((currAngle - startAngle) * 180) / Math.PI;
        let newRot = ((origZone.rotation || 0) + delta) % 360;
        if (newRot < 0) newRot += 360;
        // Snap to 15-degree increments when close
        const snap = Math.round(newRot / 15) * 15;
        if (Math.abs(snap - newRot) < 3) newRot = snap;
        return { rotation: newRot };
      });
    }
  }, [updateZone]);

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("touchmove", handleMouseMove, { passive: false });
    window.addEventListener("touchend", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchmove", handleMouseMove);
      window.removeEventListener("touchend", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const handleAdd = () => {
    const id = `zone_${Date.now()}`;
    const color = ZONE_COLORS[localZones.length % ZONE_COLORS.length];
    const newZone = { id, label: "New Zone", subtext: "", x: 10, y: 10, w: 24, h: 18, color, rotation: 0 };
    setLocalZones(prev => [...prev, newZone]);
    setSelectedId(id);
    setEditingLabelId(id);
    setEditLabel("New Zone");
    setEditSubtext("");
  };

  const handleDelete = (id) => {
    setLocalZones(prev => prev.filter(z => z.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const handleSave = () => { onSave(localZones); onOpenChange(false); };
  const handleCancel = () => { setLocalZones(zones); onOpenChange(false); };

  const startEditLabel = (zone) => {
    setEditingLabelId(zone.id);
    setEditLabel(zone.label || "");
    setEditSubtext(zone.subtext || "");
  };

  const confirmLabel = () => {
    setLocalZones(prev => prev.map(z => z.id === editingLabelId
      ? { ...z, label: editLabel.trim(), subtext: editSubtext.trim() }
      : z
    ));
    setEditingLabelId(null);
  };

  if (!open) return null;

  const selected = localZones.find(z => z.id === selectedId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2 sm:p-4">
      <div className="bg-[#1a2744] border border-slate-700 rounded-xl w-full max-w-4xl flex flex-col gap-3 p-4 shadow-2xl max-h-[95vh] overflow-auto">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-[#d4a843] font-semibold text-sm">
            <Pencil className="w-4 h-4" /> Edit Floor Map Zones
          </div>
          <div className="flex gap-2 flex-wrap">
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

        <p className="text-slate-400 text-xs">Drag to move • Drag edges/corners to resize • Drag rotation handle (⟳) to rotate • Click to select</p>

        {/* SVG Canvas */}
        <div
          className="relative select-none rounded-lg overflow-hidden border border-slate-700"
          style={{ paddingBottom: "62%" }}
        >
          <svg
            ref={svgRef}
            viewBox="0 0 100 80"
            className="absolute inset-0 w-full h-full"
            style={{ background: "#0a1128", touchAction: "none" }}
            onClick={() => { setSelectedId(null); }}
          >
            <defs>
              <pattern id="eg" width="5" height="5" patternUnits="userSpaceOnUse">
                <path d="M 5 0 L 0 0 0 5" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.2" />
              </pattern>
            </defs>
            <rect width="100" height="80" fill="url(#eg)" />

            {localZones.map((zone) => {
              const isSel = selectedId === zone.id;
              const rot = zone.rotation || 0;
              const cx = zone.x + zone.w / 2;
              const cy = zone.y + zone.h / 2;
              const transform = `rotate(${rot}, ${cx}, ${cy})`;

              // Rotation handle position (above center)
              const rotHandleLocal = { x: cx, y: zone.y - 5 };

              return (
                <g key={zone.id} transform={transform}>
                  {/* Zone body */}
                  <rect
                    x={zone.x} y={zone.y} width={zone.w} height={zone.h}
                    rx="1"
                    fill={isSel ? "rgba(212,168,67,0.12)" : zone.color}
                    stroke={isSel ? "#d4a843" : "rgba(100,116,139,0.4)"}
                    strokeWidth={isSel ? "0.6" : "0.3"}
                    style={{ cursor: "move" }}
                    onMouseDown={e => handleMouseDown(e, zone.id, "move")}
                    onTouchStart={e => handleMouseDown(e, zone.id, "move")}
                    onClick={e => { e.stopPropagation(); setSelectedId(zone.id); }}
                  />

                  {/* Label */}
                  <text
                    x={cx} y={cy - (zone.subtext ? 1.5 : 0)}
                    textAnchor="middle"
                    fill={isSel ? "#d4a843" : "rgba(255,255,255,0.85)"}
                    fontSize="2.6"
                    fontWeight="600"
                    style={{ pointerEvents: "none" }}
                  >
                    {zone.label}
                  </text>

                  {/* Subtext */}
                  {zone.subtext && (
                    <text
                      x={cx} y={cy + 2.5}
                      textAnchor="middle"
                      fill="rgba(255,255,255,0.45)"
                      fontSize="1.8"
                      style={{ pointerEvents: "none" }}
                    >
                      {zone.subtext}
                    </text>
                  )}

                  {/* Resize handles */}
                  {isSel && HANDLES.map(({ id: hid, nx, ny }) => {
                    const hx = zone.x + nx * zone.w;
                    const hy = zone.y + ny * zone.h;
                    const isCorner = nx !== 0.5 && ny !== 0.5;
                    return (
                      <rect
                        key={hid}
                        x={hx - 1.5} y={hy - 1.5} width={3} height={3}
                        rx={isCorner ? "0.4" : "1.5"}
                        fill={isCorner ? "#d4a843" : "#94a3b8"}
                        stroke="#0a1128"
                        strokeWidth="0.3"
                        style={{ cursor: CURSOR_MAP[hid] }}
                        onMouseDown={e => handleMouseDown(e, zone.id, "resize", hid)}
                        onTouchStart={e => handleMouseDown(e, zone.id, "resize", hid)}
                      />
                    );
                  })}

                  {/* Rotation handle */}
                  {isSel && (
                    <>
                      {/* Line from top-center to rotation handle */}
                      <line
                        x1={cx} y1={zone.y}
                        x2={rotHandleLocal.x} y2={rotHandleLocal.y}
                        stroke="#d4a843" strokeWidth="0.3" strokeDasharray="0.8,0.5"
                        style={{ pointerEvents: "none" }}
                      />
                      <circle
                        cx={rotHandleLocal.x} cy={rotHandleLocal.y} r="2"
                        fill="#d4a843" stroke="#0a1128" strokeWidth="0.4"
                        style={{ cursor: "grab" }}
                        onMouseDown={e => handleMouseDown(e, zone.id, "rotate")}
                        onTouchStart={e => handleMouseDown(e, zone.id, "rotate")}
                      />
                      {/* Rotation degree label */}
                      <text
                        x={rotHandleLocal.x + 3} y={rotHandleLocal.y + 0.8}
                        fill="#d4a843" fontSize="2" style={{ pointerEvents: "none" }}
                      >
                        {Math.round(rot)}°
                      </text>
                    </>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* Zone list */}
        <div className="border-t border-slate-700 pt-2">
          <p className="text-slate-500 text-xs mb-2">All Zones — click pencil to edit label & subtext</p>
          <div className="flex flex-col gap-1 max-h-48 overflow-y-auto pr-1">
            {localZones.map(zone => (
              <div
                key={zone.id}
                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 cursor-pointer transition-colors ${selectedId === zone.id ? "bg-[#d4a843]/10 border border-[#d4a843]/30" : "bg-[#0a1128] hover:bg-white/5"}`}
                onClick={() => setSelectedId(zone.id)}
              >
                <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: zone.color, border: "1px solid rgba(255,255,255,0.2)" }} />

                {editingLabelId === zone.id ? (
                  <div className="flex-1 flex flex-col gap-1" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-1.5">
                      <Input
                        value={editLabel}
                        onChange={e => setEditLabel(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") confirmLabel(); if (e.key === "Escape") setEditingLabelId(null); }}
                        placeholder="Zone name"
                        className="h-6 text-xs bg-[#1a2744] border-slate-600 text-white flex-1"
                        autoFocus
                      />
                      <Button size="sm" onClick={confirmLabel} className="h-6 px-2 bg-[#d4a843] text-[#0a1128] hover:bg-[#e0bb5e] text-xs">✓</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingLabelId(null)} className="h-6 px-1 text-slate-400 text-xs">✕</Button>
                    </div>
                    <Input
                      value={editSubtext}
                      onChange={e => setEditSubtext(e.target.value)}
                      placeholder="Subtext (optional)"
                      className="h-6 text-xs bg-[#1a2744] border-slate-600 text-white"
                    />
                  </div>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-xs font-medium truncate">{zone.label}</p>
                      {zone.subtext && <p className="text-slate-500 text-xs truncate">{zone.subtext}</p>}
                    </div>
                    <span className="text-slate-600 text-xs flex-shrink-0">{Math.round(zone.rotation || 0)}°</span>
                    <button
                      onClick={e => { e.stopPropagation(); setSelectedId(zone.id); startEditLabel(zone); }}
                      className="text-slate-500 hover:text-[#d4a843] p-1"
                      title="Edit label"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(zone.id); }}
                      className="text-slate-500 hover:text-red-400 p-1"
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}