import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Send } from "lucide-react";
import { toast } from "sonner";

const NURSERY_CHANNEL = "Nursery";

export default function NurseryChat({ user }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    loadMessages();
    const unsub = base44.entities.TeamMessage.subscribe((event) => {
      if (event.data?.channel === NURSERY_CHANNEL) {
        if (event.type === "create") setMessages(prev => [...prev, event.data]);
        else if (event.type === "update") setMessages(prev => prev.map(m => m.id === event.id ? event.data : m));
        else if (event.type === "delete") setMessages(prev => prev.filter(m => m.id !== event.id));
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadMessages = async () => {
    try {
      const msgs = await base44.entities.TeamMessage.filter({ channel: NURSERY_CHANNEL }, "created_date", 50);
      setMessages(msgs);
    } catch { }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await base44.entities.TeamMessage.create({
        channel: NURSERY_CHANNEL,
        content: text,
        sender_name: user?.display_name || user?.full_name || user?.email || "Nursery Staff",
        sender_email: user?.email || "",
        message_type: "text",
        read_by: [user?.email],
      });
      setInput("");
    } catch {
      toast.error("Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const myEmail = user?.email;

  return (
    <div className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] flex flex-col" style={{ height: 340 }}>
      <div className="px-4 py-2.5 border-b border-[rgba(212,168,67,0.1)] text-[#d4a843] text-xs font-bold tracking-wider uppercase">
        💬 Nursery Team Chat
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {messages.length === 0 && (
          <p className="text-slate-500 text-xs text-center pt-4">No messages yet. Say hello! 👋</p>
        )}
        {messages.map(msg => {
          const isMe = msg.sender_email === myEmail;
          return (
            <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${isMe ? "bg-[#d4a843] text-[#0a1128]" : "bg-[#0a1128]/60 text-white"}`}>
                {!isMe && <p className="text-[10px] font-bold mb-0.5 opacity-70">{msg.sender_name}</p>}
                <p>{msg.content}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <div className="p-2 border-t border-[rgba(212,168,67,0.1)] flex gap-2">
        <input
          className="flex-1 bg-[#0a1128] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-[#d4a843]/60 placeholder:text-slate-500"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          placeholder="Message nursery team..."
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || sending}
          className="bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] p-2 rounded-lg disabled:opacity-40 transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}