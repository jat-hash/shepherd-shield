import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { MessageCircle, Loader2 } from "lucide-react";

// Opens WhatsApp with a pre-filled emergency report message to the security team.
// Props: incidentType (string), location (string), description (string), className (string)

export default function WhatsAppReportButton({ incidentType = "", location = "", description = "", className = "" }) {
  const [config, setConfig] = useState(null);
  const [gettingLocation, setGettingLocation] = useState(false);

  useEffect(() => {
    base44.functions.invoke('getWhatsAppConfig', {}).then(res => {
      setConfig(res.data);
    }).catch(() => {});
  }, []);

  const handleReport = async () => {
    if (!config?.wa_me_number) return;

    setGettingLocation(true);
    let locationText = location || "Location unknown";

    // Try to get GPS location
    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
      });
      locationText = `GPS: ${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`;
    } catch {
      // Use provided location or fallback
    }

    setGettingLocation(false);

    const lines = ['ALERT'];
    if (incidentType) lines.push(`Type: ${incidentType}`);
    lines.push(`Location: ${locationText}`);
    if (description) lines.push(`Details: ${description}`);
    lines.push('');
    lines.push('— Sent via Shepherd Shield');

    const preFilledText = encodeURIComponent(lines.join('\n'));
    window.open(`https://wa.me/${config.wa_me_number}?text=${preFilledText}`, '_blank');
  };

  const isReady = config?.configured;

  return (
    <Button
      onClick={handleReport}
      disabled={!isReady || gettingLocation}
      className={`bg-[#25D366] hover:bg-[#128C7E] text-white font-semibold gap-2 ${className}`}
    >
      {gettingLocation ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <MessageCircle className="w-4 h-4" />
      )}
      Report via WhatsApp
    </Button>
  );
}