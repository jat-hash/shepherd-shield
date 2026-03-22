import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Send, Pin, X, Paperclip, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import DirectMessageSelector from "@/components/communications/DirectMessageSelector";
import MessageBubble from "@/components/communications/MessageBubble";
import { toast } from "sonner";
import { savePendingMessage, getCachedData, cacheData, syncPendingMessages } from "@/components/notifications/offlineStorage";

const CHANNELS = ["All Team"];

export default function Communications() {
  const [user, setUser] = useState(null);
  const [channel, setChannel] = useState("All Team");
  const [messages, setMessages] = useState([]);
  const [pinnedMessages, setPinnedMessages] = useState([]);
  const [newMsg, setNewMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [typingUsers, setTypingUsers] = useState(new Set());
  const [isTyping, setIsTyping] = useState(false);
  const [dmChannels, setDmChannels] = useState([]);
  const [activeChannel, setActiveChannel] = useState({ name: "All Team", type: "group" });
  const [uploading, setUploading] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const bottomRef = useRef(null);
  const typingTimeout = useRef(null);
  const fileInputRef = useRef(null);
  const activeChannelRef = useRef(activeChannel);

  useEffect(() => {
    base44.auth.me().then(u => {
      setUser(u);
      // Load DM channels
      base44.entities.TeamMessage.list("-created_date", 500).then(all => {
        const dmSet = new Set();
        all.forEach(msg => {
          if (msg.channel?.startsWith("DM: ") && msg.channel.includes(u.email)) {
            dmSet.add(msg.channel);
          }
        });
        setDmChannels(Array.from(dmSet));
      });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const handleOnline = async () => {
      setIsOffline(false);
      await syncPendingMessages(base44).catch(() => {});
      loadMessages();
    };
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [activeChannel.name]);

  useEffect(() => {
    setLoading(true);
    const currentChannel = activeChannel.name;

    if (!navigator.onLine) {
      getCachedData('messages').then(cached => {
        const channelMsgs = (cached || []).filter(m => m.channel === currentChannel).sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
        setMessages(channelMsgs.filter(m => !m.is_pinned));
        setPinnedMessages(channelMsgs.filter(m => m.is_pinned));
        setLoading(false);
      });
      return;
    }
    
    base44.entities.TeamMessage.filter({ channel: currentChannel }, "-created_date", 100)
      .then(msgs => {
        const sorted = msgs.reverse();
        setMessages(sorted.filter(m => !m.is_pinned));
        setPinnedMessages(sorted.filter(m => m.is_pinned));
        // Cache all messages for this channel
        cacheData('messages', sorted).catch(() => {});
        setLoading(false);
        
        // Mark as read
        if (user?.email) {
          sorted.forEach(msg => {
            if (!msg.read_by?.includes(user.email) && msg.sender_email !== user.email) {
              base44.entities.TeamMessage.update(msg.id, {
                read_by: [...(msg.read_by || []), user.email]
              }).catch(() => {});
            }
          });
        }
      });

    const unsub = base44.entities.TeamMessage.subscribe((event) => {
      if (event.data?.channel === currentChannel || (event.type === "delete" && messages.some(m => m.id === event.id)) || (event.type === "delete" && pinnedMessages.some(m => m.id === event.id))) {
        if (event.type === "create") {
          if (event.data.is_pinned) {
            setPinnedMessages(prev => [...prev, event.data]);
          } else {
            setMessages(prev => [...prev, event.data]);
          }
          
          // Auto mark as read
          if (user?.email && event.data.sender_email !== user.email) {
            setTimeout(() => {
              base44.entities.TeamMessage.update(event.data.id, {
                read_by: [...(event.data.read_by || []), user.email]
              }).catch(() => {});
            }, 1000);
          }
        } else if (event.type === "update") {
          const updateList = (prev) => prev.map(m => m.id === event.id ? event.data : m);
          if (event.data.is_pinned) {
            setPinnedMessages(updateList);
            setMessages(prev => prev.filter(m => m.id !== event.id));
          } else {
            setMessages(updateList);
            setPinnedMessages(prev => prev.filter(m => m.id !== event.id));
          }
        } else if (event.type === "delete") {
          setMessages(prev => prev.filter(m => m.id !== event.id));
          setPinnedMessages(prev => prev.filter(m => m.id !== event.id));
        }
      }
    });
    return unsub;
  }, [activeChannel.name, user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (attachment = null, messageType = "text") => {
    if (!newMsg.trim() && !attachment || !user) return;
    setIsTyping(false);
    clearTimeout(typingTimeout.current);
    
    const messageData = {
      channel: activeChannel.name,
      content: newMsg.trim() || (attachment ? "Shared a file" : ""),
      sender_name: user.display_name || user.full_name || user.email,
      sender_email: user.email,
      message_type: messageType,
      attachment: attachment,
      read_by: [user.email],
    };

    // If offline, save to pending messages
    if (!navigator.onLine) {
      await savePendingMessage(messageData);
      
      // Add to UI optimistically
      setMessages(prev => [...prev, {
        ...messageData,
        id: 'pending-' + Date.now(),
        created_date: new Date().toISOString(),
        isPending: true
      }]);
      
      toast.info('Message saved - will send when online');
      setNewMsg("");
      return;
    }

    try {
      await base44.entities.TeamMessage.create(messageData);
      setNewMsg("");
    } catch (error) {
      // If online but request failed, save as pending
      await savePendingMessage(messageData);
      toast.error('Send failed - saved for later');
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      toast.error("File size must be less than 10MB");
      return;
    }

    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      
      let messageType = "text";
      if (file.type.startsWith("image/")) messageType = "photo";
      else if (file.type.startsWith("video/")) messageType = "photo";
      
      await sendMessage(file_url, messageType);
      toast.success("File uploaded");
    } catch (error) {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleTyping = (e) => {
    setNewMsg(e.target.value);
    
    if (!isTyping) {
      setIsTyping(true);
    }
    
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      setIsTyping(false);
    }, 2000);
  };

  const handleSelectDM = (dmChannel, otherUser) => {
    setActiveChannel({
      name: dmChannel,
      type: "dm",
      displayName: otherUser.full_name || otherUser.email
    });
    
    if (!dmChannels.includes(dmChannel)) {
      setDmChannels(prev => [...prev, dmChannel]);
    }
  };

  const loadMessages = () => {
    if (!navigator.onLine) {
      getCachedData('messages').then(cached => {
        const channelMsgs = (cached || []).filter(m => m.channel === activeChannel.name).sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
        setMessages(channelMsgs.filter(m => !m.is_pinned));
        setPinnedMessages(channelMsgs.filter(m => m.is_pinned));
      });
      return;
    }
    setLoading(true);
    base44.entities.TeamMessage.filter({ channel: activeChannel.name }, "-created_date", 100)
      .then(msgs => {
        const sorted = msgs.reverse();
        setMessages(sorted.filter(m => !m.is_pinned));
        setPinnedMessages(sorted.filter(m => m.is_pinned));
        cacheData('messages', sorted).catch(() => {});
        setLoading(false);
      });
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const getDmDisplayName = (dmChannel) => {
    const emails = dmChannel.replace("DM: ", "").split("-");
    const otherEmail = emails.find(e => e !== user?.email);
    return otherEmail?.split("@")[0] || "Unknown";
  };

  return (
    <div className="max-w-2xl mx-auto lg:ml-60 flex flex-col h-[calc(100vh-130px)] lg:h-[calc(100vh-70px)]">
      {isOffline && (
        <div className="bg-amber-900/40 border-b border-amber-500/30 px-4 py-2 text-xs text-amber-400 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
          Offline — showing cached messages. New messages will send when reconnected.
        </div>
      )}
      {/* Channel Pills */}
      <div className="px-4 py-3 flex gap-2 overflow-x-auto no-scrollbar border-b border-[rgba(212,168,67,0.1)]">
        <DirectMessageSelector currentUserEmail={user?.email} onSelectDM={handleSelectDM} />
        
        {CHANNELS.map(ch => (
          <button
            key={ch}
            onClick={() => setActiveChannel({ name: ch, type: "group" })}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
              activeChannel.name === ch
                ? "bg-[#d4a843] text-[#0a1128]"
                : "bg-[#1a2744] text-slate-400 hover:text-white"
            }`}
          >
            {ch}
          </button>
        ))}
        
        {dmChannels.map(dm => (
          <button
            key={dm}
            onClick={() => setActiveChannel({ name: dm, type: "dm", displayName: getDmDisplayName(dm) })}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1 ${
              activeChannel.name === dm
                ? "bg-[#d4a843] text-[#0a1128]"
                : "bg-[#1a2744] text-slate-400 hover:text-white"
            }`}
          >
            📧 {getDmDisplayName(dm)}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-[#d4a843] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Pinned Messages */}
            {pinnedMessages.length > 0 && (
              <div className="bg-[#1a2744] rounded-xl border border-[#d4a843]/20 p-3 mb-4 space-y-2">
                <div className="flex items-center gap-2 text-xs text-[#d4a843] font-semibold mb-2">
                  <Pin className="w-3 h-3" />
                  Pinned Messages
                </div>
                {pinnedMessages.map(msg => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    isMe={msg.sender_email === user?.email}
                    currentUserEmail={user?.email}
                    onUpdate={loadMessages}
                  />
                ))}
              </div>
            )}

            {/* Regular Messages */}
            {messages.length === 0 && pinnedMessages.length === 0 ? (
              <p className="text-center text-slate-500 text-sm py-12">
                {activeChannel.type === "dm" 
                  ? `Start a conversation with ${activeChannel.displayName}`
                  : "No messages in this channel yet"}
              </p>
            ) : (
              messages.map(msg => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  isMe={msg.sender_email === user?.email}
                  currentUserEmail={user?.email}
                  onUpdate={loadMessages}
                />
              ))
            )}
            
            {/* Typing Indicator */}
            {typingUsers.size > 0 && (
              <div className="text-xs text-slate-500 italic">
                Someone is typing...
              </div>
            )}
            
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-[rgba(212,168,67,0.1)] bg-[#141f3d]">
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*,.pdf,.doc,.docx,.txt"
            onChange={handleFileUpload}
            className="hidden"
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            size="icon"
            variant="ghost"
            className="shrink-0 text-slate-400 hover:text-[#d4a843]"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
          </Button>
          <Input
            value={newMsg}
            onChange={handleTyping}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${activeChannel.type === "dm" ? activeChannel.displayName : activeChannel.name}...`}
            className="flex-1 bg-[#0a1128] border-slate-700 text-white placeholder:text-slate-500"
          />
          <Button
            onClick={() => sendMessage()}
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