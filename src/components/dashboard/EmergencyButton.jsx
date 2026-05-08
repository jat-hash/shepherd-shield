import { useState, useRef } from "react";
import { AlertTriangle, Sparkles, Loader2 } from "lucide-react";
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
import { Label } from "@/components/ui/label";

const ALERT_TYPES = ["Lockdown", "Medical Emergency", "Fire", "Suspicious Activity", "Weather"];

const VIBRATE_PATTERNS = {
  "Lockdown":           [50, 30, 50, 30, 50, 30, 50, 30, 50, 30, 50, 30, 50, 30, 50, 30],
  "Medical Emergency":  [1000, 300, 1000, 300, 1000, 300],
  "Fire":               [200, 100, 200, 100, 200, 300, 500, 100, 500, 100, 500, 300, 200, 100, 200, 100, 200], // SOS
  "Suspicious Activity":[800, 200, 200, 200, 800, 200, 200, 200],
  "Weather":            [200, 100, 200, 100, 200, 300, 500, 100, 500, 100, 500, 300, 200, 100, 200, 100, 200], // SOS
};
function getVibratePattern(type) {
  return VIBRATE_PATTERNS[type] || VIBRATE_PATTERNS["Weather"];
}

// Flash the torch in a loop until stopRef.current is true
async function flashTorchLoop(stopRef) {
  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    const track = stream.getVideoTracks()[0];
    const capabilities = track.getCapabilities?.() || {};
    if (!capabilities.torch) { stream.getTracks().forEach(t => t.stop()); return; }
    let on = true;
    while (!stopRef.current) {
      await track.applyConstraints({ advanced: [{ torch: on }] }).catch(() => {});
      on = !on;
      await new Promise(r => setTimeout(r, 300));
    }
    await track.applyConstraints({ advanced: [{ torch: false }] }).catch(() => {});
  } catch (_) {
    // Torch not supported — silently skip
  } finally {
    stream?.getTracks().forEach(t => t.stop());
  }
}


export default function EmergencyButton({ user }) {
  const [open, setOpen] = useState(false);
  const [alertType, setAlertType] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const stopTorchRef = useRef(false);
  const vibrateIntervalRef = useRef(null);

  // Only admins can trigger emergency alerts
  if (user?.role !== 'admin') return null;

  const loadSuggestions = async () => {
    if (!alertType) return;
    setLoadingSuggestion(true);
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `You are a church security coordinator. Generate 3 short, clear emergency alert messages for a "${alertType}" situation at a church. Each message should be under 100 characters, action-oriented, and calm but urgent. Return only the 3 messages as a JSON array of strings.`,
        response_json_schema: {
          type: "object",
          properties: {
            messages: { type: "array", items: { type: "string" } }
          }
        }
      });
      setSuggestions(result?.messages || []);
    } catch (_) {
      setSuggestions([]);
    }
    setLoadingSuggestion(false);
  };

  const handleAlertTypeChange = (val) => {
    setAlertType(val);
    setSuggestions([]);
  };

  const handleSend = async () => {
    if (!alertType || !message) return;
    setSending(true);

    // Start continuous vibrate + torch until sent
    const pattern = getVibratePattern(alertType);
    const repeatDelay = pattern.reduce((a, b) => a + b, 0) + 500;
    if (navigator.vibrate) {
      navigator.vibrate(pattern);
      vibrateIntervalRef.current = setInterval(() => navigator.vibrate?.(pattern), repeatDelay);
    }
    stopTorchRef.current = false;
    flashTorchLoop(stopTorchRef);

    const me = await base44.auth.me();
    const alert = await base44.entities.EmergencyAlert.create({
      alert_type: alertType,
      message,
      triggered_by: me?.display_name || me?.full_name || me?.email || "Unknown",
      is_active: true,
    });

    base44.functions.invoke('broadcastEmergencyAlert', {
      alert_type: alertType,
      message,
      triggered_by: me?.display_name || me?.full_name || me?.email || "Unknown",
      id: alert?.id
    }).catch(() => {});

    base44.functions.invoke('sendWhatsAppSafetyCheckin', {
      alertId: alert?.id,
      alertType,
      message
    }).catch(() => {});

    // Stop torch + vibrate after send completes
    stopTorchRef.current = true;
    clearInterval(vibrateIntervalRef.current);
    if (navigator.vibrate) navigator.vibrate(0);

    setSending(false);
    setOpen(false);
    setAlertType("");
    setMessage("");
    setSuggestions([]);
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

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setAlertType(""); setMessage(""); setSuggestions([]); } }}>
        <DialogContent className="bg-[#1a2744] border-red-500/30 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" /> Trigger Emergency Alert
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-slate-300 text-xs mb-1 block">Alert Type</Label>
              <Select value={alertType} onValueChange={handleAlertTypeChange}>
                <SelectTrigger className="bg-[#0a1128] border-slate-700 text-white">
                  <SelectValue placeholder="Select alert type" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a2744] border-slate-700">
                  {ALERT_TYPES.map(t => (
                    <SelectItem key={t} value={t} className="text-white hover:bg-white/10">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-slate-300 text-xs mb-1 block">Message</Label>
              <Textarea
                placeholder="Describe the emergency..."
                value={message}
                onChange={e => setMessage(e.target.value)}
                className="bg-[#0a1128] border-slate-700 text-white min-h-[80px]"
              />
            </div>

            {/* AI Suggested Messages */}
            {alertType && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-slate-400 text-xs">AI Suggested Messages</Label>
                  <button
                    onClick={loadSuggestions}
                    disabled={loadingSuggestion}
                    className="flex items-center gap-1 text-xs text-[#d4a843] hover:text-[#e0bb5e] disabled:opacity-50 transition-colors"
                  >
                    {loadingSuggestion
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <Sparkles className="w-3 h-3" />}
                    {loadingSuggestion ? "Generating..." : "Generate"}
                  </button>
                </div>
                {suggestions.length > 0 && (
                  <div className="space-y-1.5">
                    {suggestions.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => setMessage(s)}
                        className="w-full text-left text-xs px-3 py-2 rounded-lg bg-[#0a1128] border border-slate-700 hover:border-[#d4a843]/50 text-slate-300 hover:text-white transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
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