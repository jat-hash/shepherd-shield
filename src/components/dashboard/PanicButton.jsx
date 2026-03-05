import { useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export default function PanicButton() {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  const handlePanic = async () => {
    setSending(true);
    setError(null);

    let latitude = null, longitude = null;
    try {
      const pos = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
      );
      latitude = pos.coords.latitude;
      longitude = pos.coords.longitude;
    } catch (e) {
      // GPS unavailable - proceed without
    }

    const result = await base44.functions.invoke("triggerPanic", { latitude, longitude });

    if (result.data?.success) {
      setSent(true);
      setTimeout(() => {
        setOpen(false);
        setSent(false);
      }, 4000);
    } else {
      setError(result.data?.error || "Failed to send panic alert. Try again.");
    }
    setSending(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-xl py-5 flex items-center justify-center gap-3 transition-all active:scale-[0.97] border border-red-500/40"
        style={{
          background: "linear-gradient(135deg, #7f1d1d, #dc2626)",
          boxShadow: "0 0 24px rgba(220, 38, 38, 0.35), 0 4px 12px rgba(0,0,0,0.4)"
        }}
      >
        <AlertTriangle className="w-7 h-7 text-white" />
        <div className="text-left">
          <div className="text-white font-black text-xl tracking-widest uppercase">PANIC</div>
          <div className="text-red-200 text-[10px] tracking-wider">TAP FOR IMMEDIATE HELP</div>
        </div>
      </button>

      <Dialog open={open} onOpenChange={(v) => { if (!sending) setOpen(v); }}>
        <DialogContent className="bg-[#1a2744] border-red-500/50 text-white max-w-sm">
          {sent ? (
            <div className="text-center py-8 space-y-3">
              <div className="text-5xl">📡</div>
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
              <h2 className="text-emerald-400 font-bold text-lg">Help Is On The Way</h2>
              <p className="text-slate-300 text-sm">Your location and alert have been sent to the entire security team.</p>
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="text-red-400 text-center text-lg flex items-center justify-center gap-2">
                  <AlertTriangle className="w-5 h-5" /> Send Panic Alert?
                </DialogTitle>
              </DialogHeader>
              <div className="py-3 text-center space-y-2">
                <p className="text-slate-300 text-sm">This will <strong className="text-white">immediately alert the entire security team</strong> and share your GPS location.</p>
                {error && <p className="text-red-400 text-xs bg-red-500/10 rounded-lg p-2">{error}</p>}
              </div>
              <DialogFooter className="flex gap-2">
                <Button variant="ghost" className="flex-1 text-slate-400 hover:text-white" onClick={() => setOpen(false)} disabled={sending}>
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-red-600 hover:bg-red-500 text-white font-black tracking-wider"
                  onClick={handlePanic}
                  disabled={sending}
                >
                  {sending ? "SENDING..." : "SEND NOW"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}