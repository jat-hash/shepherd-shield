import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { MessageCircle, Bot, Copy, CheckCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// Shows WhatsApp bot setup instructions for admins.
// Displays the webhook URL and available bot commands.

export default function WhatsAppSetupCard() {
  const [config, setConfig] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    base44.functions.invoke('getWhatsAppConfig', {}).then(res => setConfig(res.data)).catch(() => {});
  }, []);

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const commands = [
    { cmd: 'ALERT [details]', desc: 'Report an emergency', emoji: '🚨' },
    { cmd: 'HELP', desc: 'Request immediate assistance (Critical)', emoji: '🆘' },
    { cmd: 'CHECKIN', desc: 'Confirm safety during active alert', emoji: '✅' },
  ];

  return (
    <div className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-5 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Bot className="w-5 h-5 text-[#25D366]" />
        <h3 className="text-sm font-bold text-white">WhatsApp Bot Setup</h3>
        {config?.configured && (
          <span className="ml-auto text-[10px] bg-[#25D366]/20 text-[#25D366] px-2 py-0.5 rounded-full border border-[#25D366]/30 font-semibold">ACTIVE</span>
        )}
      </div>

      {/* Bot Number */}
      {config?.whatsapp_number && (
        <div className="bg-[#0a1128] rounded-lg p-3">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Security Team WhatsApp</p>
          <div className="flex items-center justify-between gap-2">
            <p className="text-white font-mono text-sm">{config.whatsapp_number}</p>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleCopy(config.whatsapp_number)}
              className="h-7 text-slate-400 hover:text-[#25D366] px-2"
            >
              {copied ? <CheckCircle className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>
      )}

      {/* Webhook URL - the key piece */}
      <div className="space-y-2">
        <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Your Webhook URL</p>
        {config?.webhook_url ? (
          <div className="bg-[#0a1128] rounded-lg p-3">
            <p className="text-[10px] text-slate-500 mb-2">Copy this URL and paste it into Twilio:</p>
            <div className="flex items-center gap-2">
              <code className="text-[#25D366] text-[10px] font-mono break-all flex-1">{config.webhook_url}</code>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleCopy(config.webhook_url)}
                className="h-7 text-slate-400 hover:text-[#25D366] px-2 flex-shrink-0"
              >
                {copied ? <CheckCircle className="w-3.5 h-3.5 text-[#25D366]" /> : <Copy className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </div>
        ) : (
          <div className="bg-[#0a1128] rounded-lg p-3 text-xs text-slate-500">Loading webhook URL…</div>
        )}

        {/* Steps */}
        <div className="bg-[#0a1128] rounded-lg p-3 space-y-1.5 text-xs text-slate-400">
          <p>1. Copy the URL above</p>
          <p>2. Open <span className="text-white">Twilio Console</span> (link below)</p>
          <p>3. Go to <span className="text-white">Messaging → Senders → WhatsApp Senders</span></p>
          <p>4. Click your sandbox/number → paste URL under <span className="text-white">"A message comes in"</span></p>
          <p>5. Set method to <span className="text-white">HTTP POST</span> → Save</p>
        </div>
        <a
          href="https://console.twilio.com/us1/develop/sms/senders/whatsapp-senders"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-white bg-[#25D366]/20 border border-[#25D366]/30 hover:bg-[#25D366]/30 px-3 py-1.5 rounded-lg transition-colors"
        >
          <ExternalLink className="w-3 h-3 text-[#25D366]" />
          Open Twilio WhatsApp Senders
        </a>
      </div>

      {/* Bot Commands */}
      <div className="space-y-2">
        <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Bot Commands</p>
        <div className="space-y-1.5">
          {commands.map(({ cmd, desc, emoji }) => (
            <div key={cmd} className="flex items-start gap-2 bg-[#0a1128] rounded-lg p-2.5">
              <span className="text-sm">{emoji}</span>
              <div>
                <code className="text-[#25D366] text-xs font-mono font-bold">{cmd}</code>
                <p className="text-slate-400 text-xs mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* QR / Share link */}
      {config?.wa_me_number && (
        <div className="border-t border-[rgba(212,168,67,0.08)] pt-3">
          <p className="text-xs text-slate-500 mb-2">Share this link with your team so they can save the bot:</p>
          <div className="flex items-center gap-2 bg-[#0a1128] rounded-lg p-2.5">
            <span className="text-xs text-[#25D366] truncate font-mono">wa.me/{config.wa_me_number}</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleCopy(`https://wa.me/${config.wa_me_number}`)}
              className="h-6 text-slate-400 hover:text-[#25D366] px-2 flex-shrink-0"
            >
              <Copy className="w-3 h-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}