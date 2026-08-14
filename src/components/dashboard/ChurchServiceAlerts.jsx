import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Heart, DoorOpen, Loader2 } from "lucide-react";
import { canBroadcastNotifications } from "@/lib/leadership";

export default function ChurchServiceAlerts({ user }) {
  const [altarLoading, setAltarLoading] = useState(false);
  const [churchOutLoading, setChurchOutLoading] = useState(false);
  const [altarSent, setAltarSent] = useState(false);
  const [churchOutSent, setChurchOutSent] = useState(false);

  // Only Pacheco, Wilbert Ryan, and admins can send altar call / church out
  if (!canBroadcastNotifications(user)) return null;

  const sendAlert = async (type) => {
    const isAltar = type === "altar";
    if (isAltar) setAltarLoading(true);
    else setChurchOutLoading(true);

    const title = isAltar ? "🙏 Altar Call" : "🚪 Church Is Out";
    const message = isAltar
      ? "Altar call is now in progress. All team members please take your positions."
      : "Service has ended. Church is out. Begin dismissal procedures.";

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

      if (isAltar) {
        setAltarSent(true);
        setTimeout(() => setAltarSent(false), 4000);
      } else {
        setChurchOutSent(true);
        setTimeout(() => setChurchOutSent(false), 4000);
      }
    } catch (err) {
      console.error("Alert send failed:", err);
    }

    if (isAltar) setAltarLoading(false);
    else setChurchOutLoading(false);
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Altar Call Button */}
      <button
        onClick={() => sendAlert("altar")}
        disabled={altarLoading || altarSent}
        className={`flex flex-col items-center justify-center gap-2 rounded-xl px-3 py-4 font-bold text-sm transition-all active:scale-95 touch-manipulation
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

      {/* Church Out Button */}
      <button
        onClick={() => sendAlert("churchout")}
        disabled={churchOutLoading || churchOutSent}
        className={`flex flex-col items-center justify-center gap-2 rounded-xl px-3 py-4 font-bold text-sm transition-all active:scale-95 touch-manipulation
          ${churchOutSent
            ? "bg-green-800/60 border border-green-400/60 text-green-200"
            : "bg-green-700/80 border border-green-500/50 text-white hover:bg-green-600/80"
          }`}
      >
        {churchOutLoading ? (
          <Loader2 className="w-6 h-6 animate-spin" />
        ) : (
          <DoorOpen className="w-6 h-6 text-green-300" />
        )}
        <span>{churchOutSent ? "✓ Alert Sent!" : "Church Out"}</span>
        <span className="text-xs font-normal opacity-70">Service has ended</span>
      </button>
    </div>
  );
}