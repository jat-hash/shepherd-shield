import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Send, Pin, X, Paperclip, Loader2, Reply } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import DirectMessageSelector from "@/components/communications/DirectMessageSelector";
import MessageBubble from "@/components/communications/MessageBubble";
import NewMessageToast from "@/components/communications/NewMessageToast";
import IncomingMessageBanner from "@/components/communications/IncomingMessageBanner";
import { toast } from "sonner";
import { savePendingMessage, getCachedData, cacheData, syncPendingMessages, savePendingDM } from "@/lib/offlineStorage";
import { triggerNotificationEffect, cacheUserVibrationPrefs } from "@/lib/notificationEffects";
import { getDMChannelName } from "@/lib/dmChannel";

const USERS_CACHE_KEY = "team_users";

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
  const [allUsers, setAllUsers] = useState([]);
  const [pendingDmOpen, setPendingDmOpen] = useState(false);
  const [replyTo, setReplyTo] = useState(null); // { id, sender_name, content }
  const scrollContainerRef = useRef(null);
  const scrollTimerRef = useRef(null);
  const isAtBottomRef = useRef(true);
  const [showJumpBtn, setShowJumpBtn] = useState(false);
  const [lastIncoming, setLastIncoming] = useState(null);
  const [bannerIncoming, setBannerIncoming] = useState(null); // intrusive ACK banner for in-page messages
  const typingTimeout = useRef(null);
  const fileInputRef = useRef(null);
  const inputRef = useRef(null);
  const location = useLocation();

  // Switch channel when ?channel= changes — supports tapping a push notification
  // while already on Communications (also re-runs on first mount).
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const channelParam = params.get("channel");
    if (channelParam && channelParam !== activeChannel.name) {
      setActiveChannel({ name: channelParam, type: "dm", displayName: "" });
      setChannel(channelParam);
      setDmChannels(prev => prev.includes(channelParam) ? prev : [...prev, channelParam]);
      // Clear the param so back-button doesn't re-trigger the same DM
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [location.search]);

  // Track whether the user is near the bottom of the scroll area.
  // Two thresholds: a small one to consider "at bottom" (for auto-scroll decisions)
  // and a larger one to decide whether to show the jump button (so minor layout
  // shifts don't pop the button while the user is essentially reading the latest).
  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distance < 60;
    const farFromBottom = distance > 240;
    isAtBottomRef.current = atBottom;
    setShowJumpBtn(farFromBottom && !!lastIncoming);
  };

  // Snap to the bottom of the conversation.
  const scrollToBottom = (behavior = "smooth") => {
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(() => {
      const el = scrollContainerRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior });
      isAtBottomRef.current = true;
      setShowJumpBtn(false);
    }, 50);
  };

  // When in Communications, listen for the SW forward of a background push so we
  // auto-switch into that DM channel immediately.
  useEffect(() => {
    const handler = (event) => {
      if (event.data?.type !== 'shepherd-push') return;
      const dm = event.data.dm_channel;
      if (!dm || dm === activeChannel.name) return;
      setActiveChannel({ name: dm, type: "dm", displayName: "" });
      setChannel(dm);
      setDmChannels(prev => prev.includes(dm) ? prev : [...prev, dm]);
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, [activeChannel.name]);

  // Deep-link from a tapped push notification (forwarded via ServiceWorkerRegister)
  // or a foreground DM push — switch into that DM channel.
  useEffect(() => {
    const handler = (event) => {
      const dm = event.detail?.channel;
      if (!dm || dm === activeChannel.name) return;
      setActiveChannel({ name: dm, type: "dm", displayName: "" });
      setChannel(dm);
      setDmChannels(prev => prev.includes(dm) ? prev : [...prev, dm]);
    };
    window.addEventListener('shepherd:openDM', handler);
    return () => window.removeEventListener('shepherd:openDM', handler);
  }, [activeChannel.name]);

  // Auto-open the DM selector when ?tab=dm
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "dm") {
      setPendingDmOpen(true);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Once allUsers loads, fill in displayName for any active DM that's missing it
  useEffect(() => {
    if (allUsers.length > 0 && activeChannel.type === "dm" && !activeChannel.displayName) {
      setActiveChannel(prev => ({ ...prev, displayName: getDmDisplayName(prev.name) }));
    }
  }, [allUsers]);

  // Cache vibration prefs once we know who the user is so triggerNotificationEffect
  // applies the right pattern + strength for incoming messages.
  useEffect(() => {
    if (user) cacheUserVibrationPrefs(user);
  }, [user]);

  // Open (or switch to) a DM with a given email — used when tapping a sender's name.
  const handleDMUser = (senderEmail, senderName) => {
    if (!user?.email || !senderEmail || senderEmail === user.email) return;
    const dmChannelName = getDMChannelName(user.email, senderEmail);
    if (dmChannelName === activeChannel.name) return;
    setActiveChannel({ name: dmChannelName, type: "dm", displayName: senderName || "" });
    setChannel(dmChannelName);
    setDmChannels(prev => prev.includes(dmChannelName) ? prev : [...prev, dmChannelName]);
  };

  // Jump from the intrusive banner into the channel where the new message arrived.
  const handleBannerView = () => {
    if (!bannerIncoming?.channel) {
      setBannerIncoming(null);
      return;
    }
    const targetChan = bannerIncoming.channel;
    if (targetChan === activeChannel.name) {
      setBannerIncoming(null);
      scrollToBottom("smooth");
      return;
    }
    const isDM = targetChan.startsWith("DM: ");
    setActiveChannel({ name: targetChan, type: "dm", displayName: getDmDisplayName(targetChan) });
    setChannel(targetChan);
    setDmChannels(prev => prev.includes(targetChan) ? prev : [...prev, targetChan]);
    setBannerIncoming(null);
  };

  const dismissBanner = () => setBannerIncoming(null);

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') return;
    if (Notification.permission === 'denied') return;
    try {
      await Notification.requestPermission();
    } catch (error) {
      console.warn('Notification permission request failed:', error);
    }
  };

  const sendNotification = (title, options = {}) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, { icon: '/shield-icon.png', ...options });
      } catch (error) {
        console.warn('Failed to send notification:', error);
      }
    }
  };

  useEffect(() => {
    base44.auth.me().then(u => {
      setUser(u);
      requestNotificationPermission();
      // Load users for name lookup
      base44.functions.invoke("listUsers").then(res => {
        setAllUsers(res?.data?.users || []);
      }).catch(() => {});
      if (navigator.onLine) {
        // Load only DM channels the current user is a participant in (secure backend function)
        base44.functions.invoke('getMyDMChannels', { caller_email: u.email }).then(res => {
          setDmChannels(res?.data?.channels || []);
        }).catch(() => {});
        // Pre-cache users for offline DM selector
        base44.functions.invoke("listUsers").then(res => {
          const all = res?.data?.users || [];
          setAllUsers(all);
          cacheData(USERS_CACHE_KEY, all).catch(() => {});
        }).catch(() => {});
      } else {
        // Load DM channels from cached messages
        getCachedData('messages').then(cached => {
          if (!cached) return;
          const dmSet = new Set();
          cached.forEach(msg => {
            if (msg.channel?.startsWith("DM: ") && msg.channel.includes(u.email)) {
              dmSet.add(msg.channel);
            }
          });
          setDmChannels(Array.from(dmSet));
        });
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const handleOnline = async () => {
      setIsOffline(false);
      await syncPendingMessages(base44).catch(() => {});
      // Reload DM channels from server
      if (user) {
        try {
          const res = await base44.functions.invoke('getMyDMChannels', { caller_email: user?.email });
          setDmChannels(res?.data?.channels || []);
        } catch (e) {
          console.error('Failed to reload DM channels:', e);
        }
      }
      loadMessages();
    };
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [user]);

  useEffect(() => {
    setLoading(true);
    const currentChannel = activeChannel.name;

    // Guard: if this is a DM channel, wait for user to load before enforcing participation check
    if (activeChannel.type === "dm" && !user) {
      setLoading(false);
      return;
    }
    if (activeChannel.type === "dm" && user?.email && !currentChannel.includes(user.email)) {
      setMessages([]);
      setPinnedMessages([]);
      setLoading(false);
      return;
    }

    if (!navigator.onLine) {
      getCachedData('messages').then(cached => {
        const channelMsgs = (cached || []).filter(m => m.channel === currentChannel).sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
        setMessages(channelMsgs.filter(m => !m.is_pinned));
        setPinnedMessages(channelMsgs.filter(m => m.is_pinned));
        setLoading(false);
      });
      return;
    }

    // Use secure backend function for DM channels, direct query only for group channels
    const fetchMsgs = activeChannel.type === 'dm'
      ? base44.functions.invoke('getDMMessages', { channel: currentChannel, caller_email: user?.email }).then(res => (res?.data?.messages || []).reverse())
      : base44.entities.TeamMessage.filter({ channel: currentChannel }, "-created_date", 100).then(msgs => msgs.reverse());

    fetchMsgs.then(sorted => {
      setMessages(sorted.filter(m => !m.is_pinned));
      setPinnedMessages(sorted.filter(m => m.is_pinned));
      cacheData('messages', sorted).catch(() => {});
      setLoading(false);
    });

    const unsub = base44.entities.TeamMessage.subscribe((event) => {
      const eventChannel = event.data?.channel || "";
      const isDMEvent = eventChannel.startsWith("DM: ");
      const userIsParticipant = isDMEvent ? (user?.email ? eventChannel.includes(user.email) : false) : true;
      const isForCurrentChannel = event.data?.channel === currentChannel;
      const isDeleteOfVisible = event.type === "delete" &&
        (messages.some(m => m.id === event.id) || pinnedMessages.some(m => m.id === event.id));

      // React to incoming messages across ALL channels the user participates in
      // (vibrate + flash + intrusive ACK banner), so a message in another channel
      // still demands acknowledgement while the user is on the Communications page.
      if (event.type === "create" && userIsParticipant) {
        const isNewIncoming = user?.email && event.data.sender_email !== user.email;
        if (isNewIncoming) {
          // Vibrate + flash. DMs use the 'dm' pattern, group messages 'general'.
          const isDM = isDMEvent;
          triggerNotificationEffect(isDM ? "dm" : "general");
          // Intrusive, persistent ACK banner — stays until tapped (mandatory acknowledgement)
          setBannerIncoming(event.data);
          // Only float a "jump to new message" cue when the user is scrolled up
          // reading history in the CURRENT channel. Otherwise auto-scroll keeps
          // the newest message pinned to the bottom.
          if (!isAtBottomRef.current && isForCurrentChannel) {
            setLastIncoming(event.data);
          }
          // Mark as read shortly after the user sees it
          setTimeout(() => {
            base44.entities.TeamMessage.update(event.data.id, {
              read_by: [...(event.data.read_by || []), user.email]
            }).catch(() => {});
          }, 1000);
        }
      }

      if ((isForCurrentChannel && userIsParticipant) || isDeleteOfVisible) {
        if (event.type === "create") {
          if (event.data.is_pinned) {
            setPinnedMessages(prev => [...prev, event.data]);
          } else {
            setMessages(prev => [...prev, event.data]);
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
  }, [activeChannel.name, user?.email]);

  // Auto-scroll to keep the newest message pinned at the bottom whenever a new
  // message arrives — both sent and incoming. Exception: if the user has
  // deliberately scrolled up to read history (far from bottom) AND the latest
  // arrival is an incoming message from someone else, don't yank them down —
  // instead we show the "jump to new message" button (set by the subscriber).
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    const suppressForIncomingScrolledUp =
      lastMsg &&
      user?.email &&
      lastMsg.sender_email !== user.email &&
      !isAtBottomRef.current &&
      !!lastIncoming;

    if (!suppressForIncomingScrolledUp) {
      scrollToBottom("smooth");
    }
  }, [messages, pinnedMessages]);

  // When the active channel changes, jump straight to the bottom of the new convo.
  useEffect(() => {
    scrollToBottom("auto");
    setLastIncoming(null);
    setShowJumpBtn(false);
    setBannerIncoming(null);
  }, [activeChannel.name]);

  const sendMessage = async (attachment = null, messageType = "text") => {
    if (!newMsg.trim() && !attachment || !user) return;
    setIsTyping(false);
    clearTimeout(typingTimeout.current);
    
    const messageData = {
      channel: activeChannel.name,
      content: newMsg.trim() || (attachment ? "Shared a file" : ""),
      sender_name: user.data?.display_name || user.display_name || user.full_name || user.email,
      sender_email: user.email,
      message_type: messageType,
      attachment: attachment,
      read_by: [user.email],
      ...(replyTo ? { reply_to_name: replyTo.sender_name, reply_to_content: replyTo.content } : {}),
    };

    try {
      await base44.entities.TeamMessage.create(messageData);
      
      // FCM + in-app notification handled by notifyNewMessage automation
    } catch (error) {
      // If send fails (offline or network error), save as pending
      await savePendingMessage(messageData);
    }
    
    setNewMsg("");
    setReplyTo(null);
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
    const newActiveChannel = {
      name: dmChannel,
      type: "dm",
      displayName: otherUser.data?.display_name || otherUser.display_name || otherUser.full_name || otherUser.email
    };
    
    setActiveChannel(newActiveChannel);
    setChannel(dmChannel);
    
    if (!dmChannels.includes(dmChannel)) {
      setDmChannels(prev => [...prev, dmChannel]);
      // If offline, queue the DM so it persists
      if (!navigator.onLine) {
        savePendingDM(dmChannel, otherUser).catch(() => {});
        toast.info('DM saved locally - will sync when online');
      }
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
    const fetchMsgsReload = activeChannel.type === 'dm'
      ? base44.functions.invoke('getDMMessages', { channel: activeChannel.name, caller_email: user?.email }).then(res => (res?.data?.messages || []).reverse())
      : base44.entities.TeamMessage.filter({ channel: activeChannel.name }, "-created_date", 100).then(msgs => msgs.reverse());
    fetchMsgsReload.then(sorted => {
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
    // Parse the two emails — sorted and joined with "-"
    // We split on the pattern: find the email that is NOT the current user's
    const withoutPrefix = dmChannel.replace("DM: ", "");
    // Try to find the other email by checking all users
    const otherUser = allUsers.find(u => u.email !== user?.email && withoutPrefix.includes(u.email));
    if (otherUser?.data?.display_name) return otherUser.data.display_name;
    if (otherUser?.display_name) return otherUser.display_name;
    // Fallback: parse by splitting on "-" (works when emails have no hyphens)
    const parts = withoutPrefix.split("-");
    const otherEmail = parts.find(e => e !== user?.email && e.includes("@"));
    return otherEmail?.split("@")[0] || "Unknown";
  };

  return (
    <div className="max-w-2xl mx-auto lg:ml-60 flex flex-col" style={{ height: 'calc(100dvh - 57px)' }}>
      <IncomingMessageBanner
        message={bannerIncoming}
        activeChannel={activeChannel}
        onAck={dismissBanner}
        onJump={handleBannerView}
      />
      {isOffline && (
        <div className="bg-amber-900/40 border-b border-amber-500/30 px-4 py-2 text-xs text-amber-400 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
          Offline — showing cached messages. New messages will send when reconnected.
        </div>
      )}
      {/* Channel Pills */}
      <div className="px-4 py-3 flex gap-2 overflow-x-auto no-scrollbar border-b border-[rgba(212,168,67,0.1)]">
        <DirectMessageSelector currentUserEmail={user?.email} onSelectDM={handleSelectDM} autoOpen={pendingDmOpen} onAutoOpenHandled={() => setPendingDmOpen(false)} />
        
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
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3 relative"
      >
        <NewMessageToast
          visible={showJumpBtn}
          activeChannel={activeChannel}
          lastIncoming={lastIncoming}
          onJump={() => scrollToBottom("smooth")}
        />
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
                    onReply={(m) => { setReplyTo({ sender_name: m.sender_name, content: m.content }); inputRef.current?.focus(); }}
                    onDMUser={handleDMUser}
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
                  onReply={(m) => { setReplyTo({ sender_name: m.sender_name, content: m.content }); inputRef.current?.focus(); }}
                  onDMUser={handleDMUser}
                />
              ))
            )}
            
            {/* Typing Indicator */}
            {typingUsers.size > 0 && (
              <div className="text-xs text-slate-500 italic">
                Someone is typing...
              </div>
            )}
          </>
        )}
      </div>

      {/* Reply Banner */}
      {replyTo && (
        <div className="px-4 py-2 bg-[#1a2744] border-t border-[#d4a843]/20 flex items-center gap-2">
          <Reply className="w-3 h-3 text-[#d4a843] shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-semibold text-[#d4a843]">Replying to {replyTo.sender_name}</span>
            <p className="text-[10px] text-slate-400 truncate">{replyTo.content}</p>
          </div>
          <button onClick={() => setReplyTo(null)} className="text-slate-500 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

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
            ref={inputRef}
            value={newMsg}
            onChange={handleTyping}
            onKeyDown={handleKeyDown}
            placeholder={activeChannel.type === "dm" 
              ? `Message ${activeChannel.displayName}...` 
              : activeChannel.name === "All Team" 
                ? "Message all team members..." 
                : `Message ${activeChannel.name}...`}
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