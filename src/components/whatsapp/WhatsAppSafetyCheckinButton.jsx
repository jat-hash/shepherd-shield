import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { MessageCircle, Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";

// Admin button that sends WhatsApp safety check-in requests to all users.
// Props: alert (EmergencyAlert object), className (string)

export default function WhatsAppSafetyCheckinButton({ alert, className = "" }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleSend = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('sendWhatsAppSafetyCheckin', {
        alertId: alert?.id || null,
        alertType: alert?.alert_type || 'Emergency',
        message: alert?.message || 'Please confirm your safety status.'
      });
      setResult(res.data);
      toast.success(`WhatsApp check-in sent to ${res.data.sent} members`);
    } catch (err) {
      toast.error('Failed to send check-in messages');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className={`bg-[#25D366] hover:bg-[#128C7E] text-white font-semibold gap-2 ${className}`}
      >
        <MessageCircle className="w-4 h-4" />
        WhatsApp Check-In
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-[#1a2744] border-[rgba(212,168,67,0.2)] text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-[#25D366]" />
              Send WhatsApp Safety Check-In
            </DialogTitle>
          </DialogHeader>

          {result ? (
            <div className="text-center py-4 space-y-2">
              <CheckCircle className="w-10 h-10 text-[#25D366] mx-auto" />
              <p className="text-white font-semibold">Messages Sent!</p>
              <p className="text-slate-400 text-sm">
                Successfully sent to <span className="text-white font-bold">{result.sent}</span> of {result.total} members with phone numbers.
              </p>
              {result.failed > 0 && (
                <p className="text-amber-400 text-xs">{result.failed} failed (invalid numbers or unregistered on WhatsApp)</p>
              )}
            </div>
          ) : (
            <>
              <div className="space-y-3 text-sm text-slate-300">
                <p>This will send a WhatsApp safety check-in message to <strong className="text-white">all team members</strong> with a registered phone number.</p>
                {alert && (
                  <div className="bg-red-900/30 border border-red-500/30 rounded-lg p-3">
                    <p className="text-red-300 font-semibold text-xs uppercase tracking-wider mb-1">Active Alert</p>
                    <p className="text-white font-medium">{alert.alert_type}</p>
                    <p className="text-slate-400 text-xs mt-1">{alert.message}</p>
                  </div>
                )}
                <p className="text-xs text-slate-500">Members will be asked to reply CHECKIN (safe) or HELP (need assistance).</p>
              </div>

              <DialogFooter className="gap-2">
                <Button variant="ghost" onClick={() => setOpen(false)} className="text-slate-400">Cancel</Button>
                <Button
                  onClick={handleSend}
                  disabled={loading}
                  className="bg-[#25D366] hover:bg-[#128C7E] text-white gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
                  {loading ? 'Sending...' : 'Send Check-In'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}