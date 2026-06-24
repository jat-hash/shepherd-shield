import { useState, useEffect } from "react";
import { MessageSquare, Mail, ArrowDown } from "lucide-react";

/**
 * Intrusive, persistent banner shown when a new incoming message arrives while
 * the user is already on the Communications page. Stays until the user explicitly
 * acknowledges it (tap). Mirrors the mandatory-ACK behavior of the alert toasts.
 *
 * @param {object|null} message  The incoming TeamMessage (or null when none)
 * @param {object} activeChannel The currently active channel ({name, type})
 * @param {function} onAck       Called when user taps to acknowledge
 * @param {function} onJump     Called when user taps jump-to (for other-channel msgs)
 */
export default function IncomingMessageBanner({ message, activeChannel, onAck, onJump }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (message) {
      setVisible(true);
    } else {
      setVisible(false);
    }
  }, [message]);

  if (!message) return null;

  const isDM = (message.channel || "").startsWith("DM: ");
  const isOtherChannel = activeChannel && message.channel !== activeChannel.name;
  const Icon = isDM ? Mail : MessageSquare;

  const handleTap = () => {
    setVisible(false);
    if (isOtherChannel && onJump) {
      onJump();
    } else {
      onAck?.();
    }
  };

  const accent = isDM
    ? "border-blue-400 bg-blue-950/95 shadow-[0_0_24px_rgba(96,165,250,0.55)] animate-pulse"
    : "border-[#d4a843] bg-[#1a2744] shadow-[0_0_24px_rgba(212,168,67,0.55)] animate-pulse";
  const iconColor = isDM ? "text-blue-200" : "text-[#e0bb5e]";
  const label = isOtherChannel
    ? isDM
      ? `New DM from ${message.sender_name}`
      : `New message in ${message.channel}`
    : `New message from ${message.sender_name}`;

  return (
    <div
      className={`fixed left-0 right-0 top-0 z-[9998] px-3 py-3 border-b shadow-2xl ${accent}`}
      style={{
        paddingTop: "calc(0.75rem + env(safe-area-inset-top))",
        animation: "slideDown 0.25s ease-out",
      }}
    >
      <button
        type="button"
        onClick={handleTap}
        className="w-full flex items-center gap-3 text-left active:opacity-80"
      >
        <Icon className={`w-5 h-5 ${iconColor} shrink-0 ${isDM ? "" : "animate-bounce"}`} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-white/90">{label}</p>
          <p className="text-sm text-slate-200 truncate">
            {message.content?.substring(0, 80) || (message.attachment ? "📎 Attachment" : "")}
          </p>
        </div>
        <span className="flex items-center gap-1 bg-[#d4a843] text-[#0a1128] text-xs font-bold px-2.5 py-1.5 rounded-md shrink-0">
          {isOtherChannel ? <><ArrowDown className="w-3 h-3" /> VIEW</> : "ACK"}
        </span>
      </button>
      <style>{`
        @keyframes slideDown {
          from { transform: translateY(-100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}