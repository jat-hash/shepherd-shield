import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Trash2, Plus } from "lucide-react";

const ZONE_COLORS = [
  "#1e3a5f", "#1a3a2a", "#3a1a2a", "#2a2a1a",
  "#1a1f3a", "#1f1a3a", "#2a1a1a", "#1a2f3a", "#1a2a2a",
];

export default function ZoneEditorModal({ open, onOpenChange, zones, onSave }) {
  const [editingId, setEditingId] = useState(null);
  const [editLabel, setEditLabel] = useState("");

  const handleRename = (zone) => {
    setEditingId(zone.id);
    setEditLabel(zone.label);
  };

  const handleRenameConfirm = () => {
    if (!editLabel.trim()) return;
    onSave(zones.map(z => z.id === editingId ? { ...z, label: editLabel.trim() } : z));
    setEditingId(null);
  };

  const handleDelete = (id) => {
    onSave(zones.filter(z => z.id !== id));
  };

  const handleAdd = () => {
    const id = `zone_${Date.now()}`;
    const color = ZONE_COLORS[zones.length % ZONE_COLORS.length];
    // Place new zone in a free-ish spot
    const newZone = { id, label: "New Zone", x: 5, y: 5, w: 20, h: 15, color };
    onSave([...zones, newZone]);
    // Immediately open rename for new zone
    setEditingId(id);
    setEditLabel("New Zone");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a2744] border-slate-700 text-white max-w-sm max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-[#d4a843] flex items-center gap-2">
            <Pencil className="w-4 h-4" /> Edit Floor Map Zones
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 space-y-1.5 py-2 pr-1">
          {zones.map(zone => (
            <div key={zone.id} className="flex items-center gap-2 bg-[#0a1128] rounded-lg px-3 py-2">
              <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: zone.color, border: "1px solid rgba(255,255,255,0.2)" }} />
              {editingId === zone.id ? (
                <div className="flex-1 flex gap-1.5">
                  <Input
                    value={editLabel}
                    onChange={e => setEditLabel(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleRenameConfirm(); if (e.key === "Escape") setEditingId(null); }}
                    className="h-7 text-xs bg-[#1a2744] border-slate-600 text-white flex-1"
                    autoFocus
                  />
                  <Button size="sm" onClick={handleRenameConfirm} className="h-7 px-2 bg-[#d4a843] text-[#0a1128] hover:bg-[#e0bb5e] text-xs">Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} className="h-7 px-2 text-slate-400 text-xs">✕</Button>
                </div>
              ) : (
                <>
                  <span className="flex-1 text-white text-xs">{zone.label}</span>
                  <button onClick={() => handleRename(zone)} className="text-slate-500 hover:text-[#d4a843] p-1">
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button onClick={() => handleDelete(zone.id)} className="text-slate-500 hover:text-red-400 p-1">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-slate-700 pt-3">
          <Button onClick={handleAdd} className="w-full bg-[#d4a843]/10 border border-[#d4a843]/30 text-[#d4a843] hover:bg-[#d4a843]/20 text-sm">
            <Plus className="w-4 h-4 mr-1" /> Add New Zone
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}