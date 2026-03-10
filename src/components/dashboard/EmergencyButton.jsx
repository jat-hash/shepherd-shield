import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const ALERT_TYPES = ["Lockdown", "Medical Emergency", "Fire", "Suspicious Person", "Weather"];

export default function EmergencyButton() {
  const [open, setOpen] = useState(false);
  const [alertType, setAlertType] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!alertType || !message) return;
    setSending(true);
    const user = await base44.auth.me();
    const alert = await base44.entities.EmergencyAlert.create({
      alert_type: alertType,
      message,
      triggered_by: user?.display_name || user?.full_name || user?.email || "Unknown",
      is_active: true,
    });

    // Broadcast email + in-app notifications to all team members
    base44.functions.invoke('broadcastEmergencyAlert', {
      alert_type: alertType,
      message,
      triggered_by: user?.display_name || user?.full_name || user?.email || "Unknown",
      id: alert?.id
    }).catch(err => console.log('Broadcast skipped:', err.message));

    // Send WhatsApp safety check-in requests to all users with phone numbers
    base44.functions.invoke('sendWhatsAppSafetyCheckin', {
      alertId: alert?.id,
      alertType,
      message
    }).catch(err => console.log('WhatsApp check-in skipped:', err.message));

    setSending(false);
    setOpen(false);
    setAlertType("");
    setMessage("");
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full bg-gradient-to-r from-red-700 to-red-600 hover:from-red-600 hover:to-red-500 rounded-xl py-4 px-6 flex items-center justify-center gap-3 transition-all duration-200 active:scale-[0.98] shadow-lg shadow-red-900/30"
      >
        <AlertTriangle className="w-6 h-6 text-white" />
        <span className="text-white font-bold text-base tracking-wider uppercase">Emergency Alert</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-[#1a2744] border-red-500/30 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" /> Trigger Emergency Alert
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <Select value={alertType} onValueChange={setAlertType}>
              <SelectTrigger className="bg-[#0a1128] border-slate-700 text-white">
                <SelectValue placeholder="Select alert type" />
              </SelectTrigger>
              <SelectContent className="bg-[#1a2744] border-slate-700">
                {ALERT_TYPES.map(t => (
                  <SelectItem key={t} value={t} className="text-white hover:bg-white/10">{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Textarea
              placeholder="Describe the emergency..."
              value={message}
              onChange={e => setMessage(e.target.value)}
              className="bg-[#0a1128] border-slate-700 text-white min-h-[80px]"
            />
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} className="text-slate-400">Cancel</Button>
            <Button onClick={handleSend} disabled={sending || !alertType || !message} className="bg-red-600 hover:bg-red-500 text-white font-bold">
              {sending ? "Sending..." : "SEND ALERT"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}