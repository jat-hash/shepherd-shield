import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Mic, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { canBroadcastNotifications } from "@/lib/leadership";

export default function HotMicButton({ user }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  if (!canBroadcastNotifications(user)) return null;

  const handleSend = async () => {
    if (!message.trim()) return;
    setSending(true);
    try {
      const me = await base44.auth.me();
      const res = await base44.functions.invoke("sendHotMicNotification", {
        message: message.trim(),
        triggered_by: me?.display_name || me?.full_name || me?.email,
      });

      const sent = res?.data?.sent ?? 0;
      if (sent === 0) {
        toast.info("No checked-in team members to notify right now.");
      } else {
        toast.success(`Hot Mic sent to ${sent} checked-in member(s).`);
      }
    } catch {
      toast.error("Failed to send Hot Mic notification.");
    }
    setSending(false);
    setOpen(false);
    setMessage("");
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full bg-gradient-to-r from-amber-700 to-amber-600 hover:from-amber-600 hover:to-amber-500 rounded-xl py-4 px-6 flex items-center justify-center gap-3 transition-all duration-200 active:scale-[0.98] shadow-lg shadow-amber-900/30"
      >
        <Mic className="w-6 h-6 text-white" />
        <span className="text-white font-bold text-base tracking-wider uppercase">Hot Mic</span>
      </button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setMessage(""); }}>
        <DialogContent className="bg-[#1a2744] border-amber-500/30 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-amber-400 flex items-center gap-2">
              <Mic className="w-5 h-5" /> Hot Mic — Checked-In Team
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <p className="text-slate-400 text-xs">
              Sends a push + in-app notification to all currently checked-in team members only.
            </p>
            <div>
              <Label className="text-slate-300 text-xs mb-1 block">Message</Label>
              <Textarea
                placeholder="Type your message to the active team..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="bg-[#0a1128] border-slate-700 text-white min-h-[100px]"
                autoFocus
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} className="text-slate-400">
              Cancel
            </Button>
            <Button
              onClick={handleSend}
              disabled={sending || !message.trim()}
              className="bg-amber-600 hover:bg-amber-500 text-white font-bold"
            >
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" /> Send to Active Team
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}