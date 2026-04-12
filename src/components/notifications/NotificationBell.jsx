import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Bell, X, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "../../utils";

function extractUrl(text) {
  if (!text) return null;
  const match = text.match(/https?:\/\/[^\s]+/);
  return match ? match[0] : null;
}

function getNotificationPage(notification) {
  const type = notification.type || "";
  if (notification.assignment_id || type.includes("assignment")) return "Assignments";
  if (type === "general" && notification.message?.toLowerCase().includes("message")) return "Communications";
  if (type.includes("message") || type.includes("comm")) return "Communications";
  return null;
}

export default function NotificationBell({ userEmail }) {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const debounceTimer = useRef(null);
  const prevUnreadCount = useRef(0);

  const playNotificationSound = () => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.frequency.value = 660;
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (e) {}
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
  };

  useEffect(() => {
    if (!userEmail) return;
    loadNotifications();

    let unsub;
    try {
      unsub = base44.entities.Notification.subscribe((event) => {
        if (event.data?.user_email === userEmail || event.old_data?.user_email === userEmail) {
          clearTimeout(debounceTimer.current);
          debounceTimer.current = setTimeout(() => {
            loadNotifications();
          }, 500);
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
      if (newUnread > prevUnreadCount.current) {
        playNotificationSound();
      }
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

  const deleteNotification = async (notificationId) => {
    const notif = notifications.find(n => n.id === notificationId);
    await base44.entities.Notification.delete(notificationId);
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
    setUnreadCount(prev => Math.max(0, prev - (notif?.read ? 0 : 1)));
  };

  const handleNotificationClick = (notification) => {
    const url = extractUrl(notification.message);
    const targetPage = getNotificationPage(notification);
    if (url) return; // links handled by <a> tag
    if (targetPage) {
      markAsRead(notification.id);
      setOpen(false);
      navigate(createPageUrl(targetPage));
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
            <Button size="sm" variant="ghost" onClick={markAllRead} className="text-xs text-[#d4a843] hover:text-[#e0bb5e] h-auto py-1">
              Mark all read
            </Button>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-sm">No notifications</div>
          ) : (
            notifications.map((notification) => {
              const url = extractUrl(notification.message);
              const targetPage = getNotificationPage(notification);
              const isClickable = !url && !!targetPage;

              return (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`p-3 border-b border-[rgba(212,168,67,0.05)] transition-colors ${isClickable ? 'cursor-pointer hover:bg-white/10' : 'hover:bg-white/5'} ${!notification.read ? 'bg-[#d4a843]/5' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white mb-1">{notification.title}</p>
                      {url ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => { e.stopPropagation(); setOpen(false); }}
                          className="text-xs text-blue-400 hover:text-blue-300 underline flex items-center gap-1 mt-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                          {notification.message.replace(url, "").trim() || url}
                        </a>
                      ) : (
                        <p className="text-xs text-slate-400 line-clamp-2">{notification.message}</p>
                      )}
                      <p className="text-[10px] text-slate-500 mt-1">
                        {new Date(notification.created_date + (notification.created_date.endsWith('Z') ? '' : 'Z')).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}
                      </p>
                      {isClickable && (
                        <p className="text-xs text-[#d4a843] mt-1">Tap to open {targetPage} →</p>
                      )}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteNotification(notification.id); }}
                      className="text-slate-500 hover:text-red-400 transition-colors flex-shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {!notification.read && !isClickable && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => { e.stopPropagation(); markAsRead(notification.id); }}
                      className="text-xs text-[#d4a843] hover:text-[#e0bb5e] h-auto py-1 mt-2"
                    >
                      Mark as read
                    </Button>
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