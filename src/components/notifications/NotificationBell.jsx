import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Link } from "react-router-dom";
import { createPageUrl } from "../../utils";

export default function NotificationBell({ userEmail }) {
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
          // Debounce to avoid rate limiting
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
  };

  const deleteNotification = async (notificationId) => {
    await base44.entities.Notification.delete(notificationId);
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
    setUnreadCount(prev => Math.max(0, prev - (notifications.find(n => n.id === notificationId)?.read ? 0 : 1)));
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
            notifications.map((notification) => (
              <div
                key={notification.id}
                className={`p-3 border-b border-[rgba(212,168,67,0.05)] hover:bg-white/5 transition-colors ${
                  !notification.read ? 'bg-[#d4a843]/5' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white mb-1">{notification.title}</p>
                    <p className="text-xs text-slate-400 line-clamp-2">{notification.message}</p>
                    <p className="text-[10px] text-slate-500 mt-1">
                      {new Date(notification.created_date + (notification.created_date.endsWith('Z') ? '' : 'Z')).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteNotification(notification.id)}
                    className="text-slate-500 hover:text-red-400 transition-colors flex-shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {!notification.read && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => markAsRead(notification.id)}
                    className="text-xs text-[#d4a843] hover:text-[#e0bb5e] h-auto py-1 mt-2"
                  >
                    Mark as read
                  </Button>
                )}

                {notification.assignment_id && (
                  <Link
                    to={createPageUrl("Dashboard")}
                    onClick={() => setOpen(false)}
                    className="text-xs text-blue-400 hover:text-blue-300 mt-1 inline-block"
                  >
                    View assignment →
                  </Link>
                )}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}