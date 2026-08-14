import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Heart, Loader2 } from "lucide-react";
import { canBroadcastNotifications } from "@/lib/leadership";

export default function ChurchServiceAlerts({ user }) {
  const [altarLoading, setAltarLoading] = useState(false);
  const [altarSent, setAltarSent] = useState(false);

  // Only Pacheco, Wilbert Ryan, and admins can send altar call / church out
  if (!canBroadcastNotifications(user)) return null;

  const sendAlert = async () => {
    setAltarLoading(true);
    const title = "🙏 Altar Call";
    const message = "Altar call is now in progress. All team members please take your positions.";

    try {
      // Send team notification
      await base44.functions.invoke("sendTeamNotification", { title, message });

      // Also create a Notification record for all users
      await base44.entities.TeamMessage.create({
        channel: "general",
        content: `📢 ${title}: ${message}`,
        sender_name: user?.display_name || user?.full_name || "Admin",
        sender_email: user?.email || "",
        message_type: "alert",
      });

      setAltarSent(true);
      setTimeout(() => setAltarSent(false), 4000);
    } catch (err) {
      console.error("Alert send failed:", err);
    }

    setAltarLoading(false);
  };

  return (
    <button
      onClick={sendAlert}
      disabled={altarLoading || altarSent}
      className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl px-3 py-4 font-bold text-sm transition-all active:scale-95 touch-manipulation
        ${altarSent
          ? "bg-purple-800/60 border border-purple-400/60 text-purple-200"
          : "bg-purple-700/80 border border-purple-500/50 text-white hover:bg-purple-600/80"
        }`}
    >
      {altarLoading ? (
        <Loader2 className="w-6 h-6 animate-spin" />
      ) : (
        <Heart className="w-6 h-6 text-purple-300" />
      )}
      <span>{altarSent ? "✓ Alert Sent!" : "Altar Call"}</span>
      <span className="text-xs font-normal opacity-70">Notify all members</span>
    </button>
  );
}