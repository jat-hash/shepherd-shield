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
    base44.functions.invoke('getWhatsAppConfig', {}).then((res) => setConfig(res.data)).catch(() => {});
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
  { cmd: 'CHECKIN', desc: 'Confirm safety during active alert', emoji: '✅' }];


  return null;







































































































}