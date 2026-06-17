import { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Bell, X, ExternalLink, Reply, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "../../utils";
import { triggerNotificationEffect } from "@/lib/notificationEffects";
import { toast } from "sonner";

function extractUrl(text) {
  if (!text) return null;
  const match = text.match(/https?:\/\/[^\s]+/);
  return match ? match[0] : null;
}

function getNotificationRoute(notification) {
  const type = notification.type || "";
  const msg = (notification.message || "").toLowerCase();
  const title = (notification.title || "").toLowerCase();

  if (notification.assignment_id || type.includes("assignment")) return "/Assignments";

  if (type === "general") {
    // DM: has a channel field — deep link directly
    if (notification.dm_channel) {
      return `/Communications?channel=${encodeURIComponent(notification.dm_channel)}`;
    }
    // Incident keywords (check first — broad match on title emojis and keywords)
    if (
      title.includes("incident") || msg.includes("incident") ||
      title.includes("document added") || title.includes("attachment") ||
      msg.includes("attachment") || msg.includes("status changed") ||
      (title.includes("alert") && msg.includes("reported")) ||
      title.includes("severity") || msg.includes("severity") ||
      msg.includes("reported at") || msg.includes("incident report")
    ) {
      return "/Incidents";
    }
    // Equipment keywords
    if (title.includes("equipment") || msg.includes("equipment") || msg.includes("checked out") || msg.includes("returned")) {
      return "/EquipmentInventory";
    }
    // Check-in/out keywords
    if (title.includes("check-in") || title.includes("check-out") || msg.includes("checked in") || msg.includes("checked out for their assignment")) {
      return "/Assignments";
    }
    // DM fallback by keyword
    if (msg.includes("direct message") || title.includes("message from") || title.includes("direct message")) {
      return "/Communications?tab=dm";
    }
    // General channel message
    if (msg.includes("message") || title.includes("message")) {
      return "/Communications";
    }
    return null;
  }
  return null;
}

function isMessageNotification(notification) {
  const type = notification.type || "";
  const title = (notification.title || "").toLowerCase();
  const msg = (notification.message || "").toLowerCase();
  return !!(
    notification.dm_channel ||
    type === "general" && (msg.includes("message") || title.includes("message from"))
  );
}

export default function NotificationBell({ userEmail }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null); // notification id
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const debounceTimer = useRef(null);
  const prevUnreadCount = useRef(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (!userEmail) return;
    loadNotifications();

    let unsub;
    try {
      unsub = base44.entities.Notification.subscribe((event) => {
        if (event.data?.user_email !== userEmail && event.old_data?.user_email !== userEmail) return;
        if (event.type === "create" && event.data?.user_email === userEmail) {
          // Update state immediately without a full reload — no effect here, effects are owned by AlertNotificationSystem / NotificationToast
          setNotifications(prev => {
            if (prev.find(n => n.id === event.data.id)) return prev;
            return [event.data, ...prev].slice(0, 20);
          });
          setUnreadCount(prev => {
            const newCount = prev + 1;
            prevUnreadCount.current = newCount;
            return newCount;
          });
        } else if (event.type === "update") {
          setNotifications(prev => prev.map(n => n.id === event.data?.id ? event.data : n));
          // Recalculate unread
          setNotifications(prev => {
            const newUnread = prev.filter(n => !n.read).length;
            prevUnreadCount.current = newUnread;
            setUnreadCount(newUnread);
            return prev;
          });
        } else if (event.type === "delete") {
          setNotifications(prev => {
            const updated = prev.filter(n => n.id !== event.id);
            const newUnread = updated.filter(n => !n.read).length;
            prevUnreadCount.current = newUnread;
            setUnreadCount(newUnread);
            return updated;
          });
        }
      });
    } catch (error) {
      console.warn('Failed to subscribe to notifications:', error);
    }

    return () => {
      if (unsub) unsub();
      clearTimeout(debounceTimer.current);
    };
  }, [userEmail]);

  const loadNotifications = async () => {
    if (!userEmail) return;
    try {
      const allNotifications = await base44.entities.Notification.filter(
        { user_email: userEmail },
        '-created_date',
        20
      );
      setNotifications(allNotifications);
      const newUnread = allNotifications.filter(n => !n.read).length;
      prevUnreadCount.current = newUnread;
      setUnreadCount(newUnread);
    } catch (error) {
      console.warn('Failed to load notifications:', error);
      setNotifications([]);
    }
  };

  const markAsRead = async (notificationId) => {
    await base44.entities.Notification.delete(notificationId);
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const markAllRead = async () => {
    await Promise.all(notifications.map(n => base44.entities.Notification.delete(n.id)));
    setNotifications([]);
    setUnreadCount(0);
    setOpen(false);
  };

  const deleteNotification = async (e, notificationId) => {
    e.stopPropagation();
    await base44.entities.Notification.delete(notificationId);
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
    setUnreadCount(prev => Math.max(0, prev - (notifications.find(n => n.id === notificationId)?.read ? 0 : 1)));
  };

  const sendQuickReply = async (notification) => {
    if (!replyText.trim() || !userEmail) return;
    setSendingReply(true);
    try {
      const me = await base44.auth.me();
      const channel = notification.dm_channel || "All Team";
      await base44.entities.TeamMessage.create({
        channel,
        content: replyText.trim(),
        sender_name: me?.data?.display_name || me?.display_name || me?.full_name || userEmail,
        sender_email: userEmail,
        message_type: "text",
        read_by: [userEmail],
      });
      setReplyText("");
      setReplyingTo(null);
      toast.success("Reply sent");
      markAsRead(notification.id);
    } catch {
      toast.error("Failed to send reply");
    } finally {
      setSendingReply(false);
    }
  };

  const handleNotificationClick = (notification) => {
    const url = extractUrl(notification.message);
    if (url) {
      window.open(url, "_blank");
      markAsRead(notification.id);
      return;
    }
    const route = getNotificationRoute(notification);
    if (route) {
      setOpen(false);
      markAsRead(notification.id);
      navigate(route);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="relative">
          <Bell className="w-5 h-5 text-slate-400 hover:text-[#d4a843] transition-colors" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 bg-[#1a2744] border-[rgba(212,168,67,0.2)] p-0" align="end">
        <div className="p-3 border-b border-[rgba(212,168,67,0.1)] flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Notifications</h3>
          {unreadCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={markAllRead}
              className="text-xs text-[#d4a843] hover:text-[#e0bb5e] h-auto py-1"
            >
              Mark all read
            </Button>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-sm">
              No notifications
            </div>
          ) : (
            notifications.map((notification) => {
              const route = getNotificationRoute(notification);
              const url = extractUrl(notification.message);
              const isClickable = !!(route || url);

              return (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`p-3 border-b border-[rgba(212,168,67,0.05)] transition-colors ${
                    isClickable ? 'cursor-pointer hover:bg-[#d4a843]/10' : 'hover:bg-white/5'
                  } ${!notification.read ? 'bg-[#d4a843]/5' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white mb-1">{notification.title}</p>
                      {url ? (
                        <span className="text-xs text-blue-400 flex items-center gap-1">
                          <ExternalLink className="w-3 h-3" />
                          {notification.message.replace(url, "").trim() || "Open link"}
                        </span>
                      ) : (
                        <p className="text-xs text-slate-400 line-clamp-2">{notification.message}</p>
                      )}
                      <p className="text-[10px] text-slate-500 mt-1">
                        {new Date(notification.created_date + (notification.created_date.endsWith('Z') ? '' : 'Z')).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}
                      </p>
                      {isClickable && (
                        <p className="text-[10px] text-[#d4a843] mt-0.5">
                          {url ? 'Tap to open link'
                            : route?.startsWith('/Communications') ? 'Tap to open →'
                            : route === '/Incidents' ? 'Tap to view incident →'
                            : route === '/EquipmentInventory' ? 'Tap to view equipment →'
                            : route === '/Assignments' ? 'Tap to view assignments →'
                            : 'Tap to open →'}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {isMessageNotification(notification) && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setReplyingTo(replyingTo === notification.id ? null : notification.id); setReplyText(""); }}
                          className="text-slate-500 hover:text-[#d4a843] transition-colors"
                          title="Quick reply"
                        >
                          <Reply className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={(e) => deleteNotification(e, notification.id)}
                        className="text-slate-500 hover:text-red-400 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {replyingTo === notification.id && (
                    <div className="mt-2 flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        autoFocus
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendQuickReply(notification); } if (e.key === "Escape") { setReplyingTo(null); } }}
                        placeholder="Type a reply..."
                        className="flex-1 bg-[#0a1128] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 outline-none focus:border-[#d4a843]/50"
                      />
                      <button
                        onClick={() => sendQuickReply(notification)}
                        disabled={!replyText.trim() || sendingReply}
                        className="px-2 py-1.5 rounded-lg bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] disabled:opacity-40 transition-colors"
                      >
                        {sendingReply ? <div className="w-3 h-3 border border-[#0a1128]/40 border-t-[#0a1128] rounded-full animate-spin" /> : <Send className="w-3 h-3" />}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}