import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { QrCode, Camera, LogIn, LogOut, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import QRScanner from "@/components/equipment/QRScanner";
import { toast } from "sonner";

export default function RadioQRCheckIn() {
  const [open, setOpen] = useState(false);
  const [cameraMode, setCameraMode] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [foundItem, setFoundItem] = useState(null);
  const [loading, setLoading] = useState(false);

  const lookupCode = async (code) => {
    const searchCode = (code || "").trim();
    if (!searchCode) return;
    setLoading(true);
    try {
      const items = await base44.entities.Equipment.list("-created_date", 500);
      const sc = searchCode.toLowerCase();
      const found = items.find(i =>
        i.id === searchCode ||
        i.qr_code === searchCode ||
        i.serial_number === searchCode ||
        i.qr_code?.toLowerCase() === sc ||
        i.serial_number?.toLowerCase() === sc
      );
      if (found) {
        setFoundItem(found);
        setCameraMode(false);
        setManualCode("");
      } else {
        toast.error("Equipment not found — check the QR code or serial number");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCheckOut = async () => {
    const user = await base44.auth.me();
    await base44.entities.Equipment.update(foundItem.id, {
      checked_out: true,
      checked_out_by: user.display_name || user.full_name || user.email,
      checked_out_at: new Date().toISOString(),
      usage_history: [
        ...(foundItem.usage_history || []),
        { action: "check-out", user: user.display_name || user.full_name || user.email, timestamp: new Date().toISOString() }
      ]
    });
    toast.success(`✓ ${foundItem.name} checked out`);
    setFoundItem(null);
    setOpen(false);
  };

  const handleCheckIn = async () => {
    const user = await base44.auth.me();
    await base44.entities.Equipment.update(foundItem.id, {
      checked_out: false,
      checked_out_by: null,
      checked_out_at: null,
      usage_history: [
        ...(foundItem.usage_history || []),
        { action: "check-in", user: user.display_name || user.full_name || user.email, timestamp: new Date().toISOString() }
      ]
    });
    toast.success(`✓ ${foundItem.name} checked in`);
    setFoundItem(null);
    setOpen(false);
  };

  const handleClose = () => {
    setOpen(false);
    setCameraMode(false);
    setManualCode("");
    setFoundItem(null);
  };

  return (
    <>
      <button
        onClick={() => { setOpen(true); setTimeout(() => setCameraMode(true), 400); }}
        className="flex flex-col items-center justify-center gap-1.5 bg-[#1a2744] border border-[rgba(212,168,67,0.15)] hover:border-[#d4a843]/40 rounded-xl p-4 transition-all w-full"
      >
        <div className="w-10 h-10 rounded-full bg-[#d4a843]/15 flex items-center justify-center">
          <QrCode className="w-5 h-5 text-[#d4a843]" />
        </div>
        <span className="text-xs font-semibold text-white">Scan Radio</span>
        <span className="text-[10px] text-slate-500">Check In / Out</span>
      </button>

      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="bg-[#1a2744] border-slate-700 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[#d4a843] flex items-center gap-2">
              <QrCode className="w-5 h-5" />
              Radio Check In / Out
            </DialogTitle>
          </DialogHeader>

          {foundItem ? (
            <div className="space-y-4">
              <div className="bg-[#0a1128] rounded-lg p-4 border border-slate-700">
                <p className="text-white font-bold text-lg">{foundItem.name}</p>
                {foundItem.serial_number && <p className="text-slate-400 text-xs mt-1">SN: {foundItem.serial_number}</p>}
                <div className="mt-2">
                  {foundItem.checked_out ? (
                    <span className="px-2 py-1 rounded-full text-xs font-semibold bg-orange-500/20 text-orange-400">
                      Currently Checked Out — {foundItem.checked_out_by}
                    </span>
                  ) : (
                    <span className="px-2 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400">
                      Available
                    </span>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                {foundItem.checked_out ? (
                  <Button onClick={handleCheckIn} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2">
                    <LogIn className="w-4 h-4" /> Check In
                  </Button>
                ) : (
                  <Button onClick={handleCheckOut} className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-bold gap-2">
                    <LogOut className="w-4 h-4" /> Check Out
                  </Button>
                )}
                <Button variant="ghost" onClick={() => setFoundItem(null)} className="text-slate-400">
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ) : cameraMode ? (
            <div className="space-y-3">
              <QRScanner
                onScan={(code) => lookupCode(code)}
                onClose={() => setCameraMode(false)}
                scannerId="qr-reader-radio"
              />
              <button onClick={() => setCameraMode(false)} className="text-xs text-slate-400 underline w-full text-center">
                Enter code manually instead
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <Button
                onClick={() => setCameraMode(true)}
                className="w-full bg-[#0a1128] border border-dashed border-slate-600 hover:border-[#d4a843]/50 text-slate-300 h-24 flex-col gap-2"
                variant="ghost"
              >
                <Camera className="w-8 h-8 text-[#d4a843]" />
                <span className="text-xs">Tap to scan QR code</span>
              </Button>
              <div className="flex gap-2">
                <Input
                  value={manualCode}
                  onChange={e => setManualCode(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && lookupCode(manualCode)}
                  className="bg-[#0a1128] border-slate-700 text-white"
                  placeholder="Enter QR or serial number..."
                />
                <Button
                  onClick={() => lookupCode(manualCode)}
                  disabled={!manualCode.trim() || loading}
                  className="bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] font-bold"
                >
                  {loading ? "..." : "Find"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}