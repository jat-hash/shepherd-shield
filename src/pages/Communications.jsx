import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Send, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const CHANNELS = ["All Team", "Parking", "Kids Wing", "Medical", "Command"];

export default function Communications() {
  const [user, setUser] = useState(null);
  const [channel, setChannel] = useState("All Team");
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    base44.entities.TeamMessage.filter({ channel }, "-created_date", 50)
      .then(msgs => {
        setMessages(msgs.reverse());
        setLoading(false);
      });

    const unsub = base44.entities.TeamMessage.subscribe((event) => {
      if (event.type === "create" && event.data?.channel === channel) {
        setMessages(prev => [...prev, event.data]);
      }
    });
    return unsub;
  }, [channel]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!newMsg.trim() || !user) return;
    await base44.entities.TeamMessage.create({
      channel,
      content: newMsg.trim(),
      sender_name: user.full_name || user.email,
      sender_email: user.email,
      message_type: "text",
    });
    setNewMsg("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="max-w-2xl mx-auto lg:ml-60 flex flex-col h-[calc(100vh-130px)] lg:h-[calc(100vh-70px)]">
      {/* Channel Pills */}
      <div className="px-4 py-3 flex gap-2 overflow-x-auto no-scrollbar border-b border-[rgba(212,168,67,0.1)]">
        {CHANNELS.map(ch => (
          <button
            key={ch}
            onClick={() => setChannel(ch)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
              channel === ch
                ? "bg-[#d4a843] text-[#0a1128]"
                : "bg-[#1a2744] text-slate-400 hover:text-white"
            }`}
          >
            {ch}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-[#d4a843] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-center text-slate-500 text-sm py-12">No messages in this channel yet</p>
        ) : (
          messages.map(msg => {
            const isMe = msg.sender_email === user?.email;
            return (
              <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                  isMe
                    ? "bg-[#d4a843] text-[#0a1128]"
                    : "bg-[#1a2744] text-white border border-[rgba(212,168,67,0.1)]"
                }`}>
                  {!isMe && (
                    <p className="text-[10px] font-semibold text-[#d4a843] mb-0.5">{msg.sender_name}</p>
                  )}
                  <p className="text-sm leading-relaxed">{msg.content}</p>
                  <p className={`text-[9px] mt-1 ${isMe ? "text-[#0a1128]/60" : "text-slate-500"}`}>
                    {new Date(msg.created_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-[rgba(212,168,67,0.1)] bg-[#141f3d]">
        <div className="flex items-center gap-2">
          <Input
            value={newMsg}
            onChange={e => setNewMsg(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="flex-1 bg-[#0a1128] border-slate-700 text-white placeholder:text-slate-500"
          />
          <Button
            onClick={sendMessage}
            disabled={!newMsg.trim()}
            size="icon"
            className="bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}