import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin } from "lucide-react";

export default function PinEquipmentModal({ open, onOpenChange, zone, allEquipment, pinnedItems, onSave }) {
  const [selected, setSelected] = useState("");

  const unpinned = allEquipment.filter(e => !pinnedItems.some(p => p.id === e.id) || zone?.pinned?.includes(e.id));
  const zonePinned = zone ? (allEquipment.filter(e => zone.pinned?.includes(e.id))) : [];

  const handlePin = () => {
    if (!selected) return;
    onSave(zone.id, [...(zone.pinned || []), selected]);
    setSelected("");
  };

  const handleUnpin = (equipId) => {
    onSave(zone.id, (zone.pinned || []).filter(id => id !== equipId));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a2744] border-slate-700 text-white max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-[#d4a843] flex items-center gap-2">
            <MapPin className="w-4 h-4" /> Pin Equipment — {zone?.label}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <p className="text-slate-400 text-xs mb-2">Currently pinned in this zone:</p>
            {zonePinned.length === 0 ? (
              <p className="text-slate-600 text-xs">None</p>
            ) : (
              <div className="space-y-1">
                {zonePinned.map(item => (
                  <div key={item.id} className="flex items-center justify-between bg-[#0a1128] rounded-lg px-3 py-2">
                    <span className="text-white text-xs">{item.name} <span className="text-slate-500">({item.category})</span></span>
                    <button onClick={() => handleUnpin(item.id)} className="text-red-400 hover:text-red-300 text-xs">Remove</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-slate-400 text-xs mb-2">Add equipment to this zone:</p>
            <div className="flex gap-2">
              <Select value={selected} onValueChange={setSelected}>
                <SelectTrigger className="bg-[#0a1128] border-slate-700 text-white flex-1">
                  <SelectValue placeholder="Select equipment..." />
                </SelectTrigger>
                <SelectContent className="bg-[#1a2744] border-slate-700 max-h-48">
                  {allEquipment
                    .filter(e => !(zone?.pinned || []).includes(e.id))
                    .map(e => (
                      <SelectItem key={e.id} value={e.id} className="text-white">
                        {e.name} ({e.category})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Button onClick={handlePin} disabled={!selected} className="bg-[#d4a843] text-[#0a1128] font-bold hover:bg-[#e0bb5e]">
                Pin
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-slate-400">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}