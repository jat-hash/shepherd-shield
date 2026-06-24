/**
 * Floating "new message" banner + jump-to-bottom button for the Communications page.
 * Shown when the user has scrolled up away from the latest message. Tapping snaps
 * the conversation down to the newest message so incoming DMs are easy to see.
 */
export default function NewMessageToast({ visible, activeChannel, lastIncoming, onJump }) {
  if (!visible || !lastIncoming || !activeChannel) return null;
  return (
    <button
      onClick={onJump}
      className="absolute z-30 left-1/2 -translate-x-1/2 top-2 bg-[#d4a843] text-[#0a1128] text-xs font-bold px-3 py-2 rounded-full shadow-lg flex items-center gap-2 animate-bounce"
    >
      <span className="w-2 h-2 rounded-full bg-[#0a1128]" />
      {activeChannel.type === "dm"
        ? `New from ${lastIncoming.sender_name} ↓`
        : `New in ${activeChannel.name} ↓`}
    </button>
  );
}