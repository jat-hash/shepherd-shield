import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { QrCode, Camera, LogIn, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import QRScanner from "@/components/equipment/QRScanner";
import { toast } from "sonner";

export default function RadioCheckInScanner({ user }) {
  const [open, setOpen] = useState(false);
  const [cameraMode, setCameraMode] = useState(false);
  const [scannedCode, setScannedCode] = useState("");
  const [foundItem, setFoundItem] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleClose = () => {
    setOpen(false);
    setCameraMode(false);
    setScannedCode("");
    setFoundItem(null);
  };

  const handleScan = async (code) => {
    const searchCode = (code || scannedCode).trim();
    if (!searchCode) return;
    setLoading(true);
    try {
      const all = await base44.entities.Equipment.filter({ category: "Radio" });
      const found = all.find((i) => i.qr_code === searchCode || i.serial_number === searchCode);
      if (found) {
        setFoundItem(found);
        setCameraMode(false);
        setScannedCode("");
      } else {
        toast.error("Radio not found");
      }
    } catch {
      toast.error("Failed to search equipment");
    }
    setLoading(false);
  };

  const handleCheckOut = async () => {
    setLoading(true);
    try {
      await base44.entities.Equipment.update(foundItem.id, {
        checked_out: true,
        checked_out_by: user?.full_name || user?.email,
        checked_out_at: new Date().toISOString(),
        usage_history: [
        ...(foundItem.usage_history || []),
        { action: "check-out", user: user?.full_name || user?.email, timestamp: new Date().toISOString() }]

      });
      toast.success(`${foundItem.name} checked out`);
      handleClose();
    } catch {
      toast.error("Failed to check out");
    }
    setLoading(false);
  };

  const handleCheckIn = async () => {
    setLoading(true);
    try {
      await base44.entities.Equipment.update(foundItem.id, {
        checked_out: false,
        checked_out_by: null,
        checked_out_at: null,
        usage_history: [
        ...(foundItem.usage_history || []),
        { action: "check-in", user: user?.full_name || user?.email, timestamp: new Date().toISOString() }]

      });
      toast.success(`${foundItem.name} checked in`);
      handleClose();
    } catch {
      toast.error("Failed to check in");
    }
    setLoading(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full bg-[#1a2744] border border-[rgba(212,168,67,0.15)] hover:border-[#d4a843]/40 rounded-xl p-4 flex flex-col items-center gap-3 transition-all text-center">

        <div className="w-10 h-10 rounded-full bg-[#d4a843]/10 flex items-center justify-center shrink-0">
          <QrCode className="w-5 h-5 text-[#d4a843]" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Radio Check In / Out</p>
          <p className="text-slate-400 text-xs">Scan QR code to check a radio in or out</p>
        </div>
      </button>

      <Dialog open={open} onOpenChange={(v) => {if (!v) handleClose();}}>
        <DialogContent className="bg-[#1a2744] border-slate-700 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[#d4a843] flex items-center gap-2">
              <QrCode className="w-5 h-5" />
              Radio Check In / Out
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {foundItem ?
            <div className="space-y-4">
                <div className="bg-[#0a1128] rounded-lg p-4 border border-slate-700 space-y-2">
                  <p className="text-white font-semibold">{foundItem.name}</p>
                  {foundItem.serial_number &&
                <p className="text-xs text-slate-400">SN: {foundItem.serial_number}</p>
                }
                  <p className={`text-xs font-semibold ${foundItem.checked_out ? "text-orange-400" : "text-emerald-400"}`}>
                    {foundItem.checked_out ? `Currently checked out by: ${foundItem.checked_out_by}` : "Currently available"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setFoundItem(null)} className="text-slate-400 flex-1">Back</Button>
                  {foundItem.checked_out ?
                <Button onClick={handleCheckIn} disabled={loading} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2">
                      <LogIn className="w-4 h-4" /> Check In
                    </Button> :

                <Button onClick={handleCheckOut} disabled={loading} className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-bold gap-2">
                      <LogOut className="w-4 h-4" /> Check Out
                    </Button>
                }
                </div>
              </div> :
            cameraMode ?
            <>
                <QRScanner onScan={(code) => handleScan(code)} onClose={() => setCameraMode(false)} />
                <button onClick={() => setCameraMode(false)} className="text-xs text-slate-400 underline w-full text-center">
                  Enter code manually instead
                </button>
              </> :

            <>
                <Button
                onClick={() => setCameraMode(true)}
                className="w-full bg-[#0a1128] border border-dashed border-slate-600 hover:border-[#d4a843]/50 text-slate-300 h-20 flex-col gap-2"
                variant="ghost">
                
                  <Camera className="w-8 h-8 text-[#d4a843]" />
                  <span className="text-xs">Tap to open camera</span>
                </Button>
                <div>
                  <Label className="text-slate-300 text-xs">Or enter QR Code / Serial Number manually</Label>
                  <Input
                  value={scannedCode}
                  onChange={(e) => setScannedCode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleScan()}
                  className="bg-[#0a1128] border-slate-700 text-white mt-1"
                  placeholder="Enter code..."
                  autoFocus />
                
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={handleClose} className="text-slate-400">Cancel</Button>
                  <Button onClick={() => handleScan()} disabled={!scannedCode.trim() || loading} className="bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] font-bold">
                    {loading ? "Searching..." : "Find Radio"}
                  </Button>
                </DialogFooter>
              </>
            }
          </div>
        </DialogContent>
      </Dialog>
    </>);

}