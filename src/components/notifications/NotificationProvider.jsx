import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { AlertTriangle, MessageSquare, CalendarCheck } from "lucide-react";
import EmergencyOverlay from "./EmergencyOverlay";
import OfflineIndicator from "./OfflineIndicator";
import { cacheData, syncPendingMessages } from "./offlineStorage";

// Loud sound notification helper
const playNotificationSound = (type = 'message') => {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    if (type === 'emergency') {
      // LOUD urgent alarm - multiple beeps
      for (let i = 0; i < 3; i++) {
        setTimeout(() => {
          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();
          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);
          oscillator.frequency.value = 880;
          oscillator.type = 'square';
          gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.3);
        }, i * 400);
      }
    } else if (type === 'alert') {
      // Alert message - double beep
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.frequency.value = 660;
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.25);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.25);
    } else {
      // Regular message - single ping
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.frequency.value = 520;
      gainNode.gain.setValueAtTime(0.25, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.2);
    }
  } catch (error) {
    console.log('Audio not supported');
  }
};

export default function NotificationProvider({ children }) {
  const [user, setUser] = useState(null);
  const [emergencyAlert, setEmergencyAlert] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  // Sync when coming back online
  useEffect(() => {
    const handleOnline = async () => {
      if (user) {
        const synced = await syncPendingMessages(base44);
        if (synced) {
          toast.success('Messages synced successfully');
        }
      }
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [user]);

  // Emergency Alerts with full-screen overlay
  useEffect(() => {
    const unsubscribe = base44.entities.EmergencyAlert.subscribe((event) => {
      if (event.type === "create" && event.data?.is_active) {
        setEmergencyAlert(event.data);

        // Cache alert for offline access
        cacheData('alerts', event.data);

        // LOUD emergency sound
        playNotificationSound('emergency');

        // Vibrate if supported
        if (navigator.vibrate) {
          navigator.vibrate([300, 100, 300, 100, 300, 100, 300]);
        }

        // Send CRITICAL push notification (like Amber Alert)
        if ('serviceWorker' in navigator && Notification.permission === 'granted') {
          navigator.serviceWorker.ready.then((registration) => {
            registration.showNotification('🚨 EMERGENCY ALERT', {
              body: `${event.data.alert_type.toUpperCase()}\n\n${event.data.message}`,
              icon: '/icon-192x192.png',
              badge: '/icon-192x192.png',
              vibrate: [500, 200, 500, 200, 500, 200, 500, 200, 500],
              tag: 'emergency-' + event.data.id,
              requireInteraction: true,
              renotify: true,
              silent: false,
              urgency: 'high',
              data: {
                url: '/',
                alertId: event.data.id,
                priority: 'critical'
              },
              actions: [
                { action: 'open', title: 'Open App' },
                { action: 'dismiss', title: 'Dismiss' }
              ]
            });
          }).catch(() => {
            // Fallback to regular notification
            new Notification('🚨 EMERGENCY ALERT', {
              body: `${event.data.alert_type.toUpperCase()}\n\n${event.data.message}`,
              requireInteraction: true,
              vibrate: [500, 200, 500, 200, 500],
              tag: 'emergency-' + event.data.id,
              renotify: true,
              silent: false
            });
          });
        } else if (Notification.permission === 'granted') {
          new Notification('🚨 EMERGENCY ALERT', {
            body: `${event.data.alert_type.toUpperCase()}\n\n${event.data.message}`,
            requireInteraction: true,
            vibrate: [500, 200, 500, 200, 500],
            tag: 'emergency-' + event.data.id,
            renotify: true,
            silent: false
          });
        }
      } else if (event.type === "update") {
        if (!event.data?.is_active) {
          setEmergencyAlert(null);
        } else {
          setEmergencyAlert(event.data);
          playNotificationSound('emergency');
          if (navigator.vibrate) {
            navigator.vibrate([300, 100, 300]);
          }
        }
      }
    });
    return unsubscribe;
  }, []);

  // Team Messages (Direct/Mentions) with offline caching
  useEffect(() => {
    if (!user?.email) return;

    const unsubscribe = base44.entities.TeamMessage.subscribe((event) => {
      if (event.type === "create" && event.data) {
        const msg = event.data;
        
        // Cache message for offline access
        cacheData('messages', msg);
        
        // Skip own messages
        if (msg.sender_email === user.email) return;

        // Show if it's in a relevant channel or mentions user
        const isHighPriority = msg.message_type === "alert" || 
                               msg.content?.toLowerCase().includes(user.full_name?.toLowerCase()) ||
                               msg.content?.toLowerCase().includes(user.email?.toLowerCase());

        if (isHighPriority) {
          // Play alert sound for priority messages
          playNotificationSound(msg.message_type === 'alert' ? 'alert' : 'message');
          
          // Vibrate
          if (navigator.vibrate) {
            navigator.vibrate(msg.message_type === 'alert' ? [200, 100, 200] : [100]);
          }
          
          toast.info(
            <div className="flex items-start gap-3">
              <MessageSquare className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-sm">New Message - {msg.channel}</p>
                <p className="text-xs mt-1 text-slate-600">{msg.sender_name}</p>
                <p className="text-xs mt-1 line-clamp-2">{msg.content}</p>
              </div>
            </div>,
            {
              duration: 6000,
              position: "top-right",
              className: "border-blue-500 bg-blue-50",
            }
          );

          // Browser notification
          if (Notification.permission === 'granted') {
            new Notification(`Message from ${msg.sender_name}`, {
              body: msg.content.substring(0, 100),
              vibrate: msg.message_type === 'alert' ? [200, 100, 200] : [100],
              tag: 'message-' + msg.id,
              silent: false
            });
          }
        }
      }
    });
    return unsubscribe;
  }, [user]);

  // Assignment Updates (High Priority) with offline caching
  useEffect(() => {
    if (!user?.email) return;

    const unsubscribe = base44.entities.Assignment.subscribe((event) => {
      if (event.data?.assigned_to_email !== user.email) return;

      // Cache assignment for offline access
      if (event.type === "create" || event.type === "update") {
        cacheData('assignments', event.data);
      }

      if (event.type === "create") {
        const assignment = event.data;
        const today = new Date().toISOString().split("T")[0];
        const isToday = assignment.service_date === today;

        // Play sound for new assignment
        playNotificationSound(isToday ? 'alert' : 'message');
        
        // Vibrate
        if (navigator.vibrate) {
          navigator.vibrate(isToday ? [200, 100, 200] : [100]);
        }

        toast.success(
          <div className="flex items-start gap-3">
            <CalendarCheck className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-sm">
                {isToday ? "🔔 URGENT: " : ""}New Assignment
              </p>
              <p className="text-xs mt-1 text-slate-600">{assignment.position_name}</p>
              <p className="text-xs mt-1">
                {new Date(assignment.service_date).toLocaleDateString()} • {assignment.start_time} - {assignment.end_time}
              </p>
            </div>
          </div>,
          {
            duration: isToday ? 10000 : 6000,
            position: "top-right",
            className: isToday ? "border-amber-500 bg-amber-50" : "border-emerald-500 bg-emerald-50",
          }
        );
        
        // Browser notification
        if (Notification.permission === 'granted') {
          new Notification(isToday ? '🔔 URGENT: New Assignment' : 'New Assignment', {
            body: `${assignment.position_name} - ${new Date(assignment.service_date).toLocaleDateString()}`,
            vibrate: isToday ? [200, 100, 200] : [100],
            tag: 'assignment-' + assignment.id,
            silent: false
          });
        }
      } else if (event.type === "update") {
        const assignment = event.data;
        const statusChanged = event.data?.status !== event.old_data?.status;

        if (statusChanged && assignment.status === "Confirmed") {
          toast.success(
            <div className="flex items-start gap-3">
              <CalendarCheck className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-sm">Assignment Confirmed</p>
                <p className="text-xs mt-1">{assignment.position_name}</p>
              </div>
            </div>,
            {
              duration: 5000,
              position: "top-right",
            }
          );
        }
      }
    });
    return unsubscribe;
  }, [user]);

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  return (
    <>
      {children}
      <EmergencyOverlay 
        alert={emergencyAlert} 
        onDismiss={() => setEmergencyAlert(null)} 
      />
      <OfflineIndicator />
    </>
  );
}