import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";
import { AlertTriangle, MessageSquare, CalendarCheck } from "lucide-react";
import EmergencyOverlay from "./EmergencyOverlay";
import OfflineIndicator from "./OfflineIndicator";
import UrgentAlertSystem from "./UrgentAlertSystem";
import { cacheData, syncPendingMessages } from "@/lib/offlineStorage";

export default function NotificationProvider({ children }) {
  const { user } = useAuth();
  const [emergencyAlert, setEmergencyAlert] = useState(null);
  const emergencyAlertRef = useRef(emergencyAlert);
  const mountTimeRef = useRef(Date.now());  // only process events created after mount

  useEffect(() => {
    emergencyAlertRef.current = emergencyAlert;
  }, [emergencyAlert]);

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
      // Ignore events that existed before this session mounted
      const eventTime = event.data?.created_date ? new Date(event.data.created_date).getTime() : 0;
      if (eventTime && eventTime < mountTimeRef.current - 5000) return;

      if (event.type === "create" && event.data?.is_active) {
        setEmergencyAlert(event.data);

        // Cache alert for offline access
        cacheData('alerts', event.data);

        // INTENSE vibration pattern (like Amber Alert)
        if (navigator.vibrate) {
          // Long vibration bursts - 10 seconds of vibration
          navigator.vibrate([
            1000, 200, 1000, 200, 1000, 200,
            1000, 200, 1000, 200, 1000, 200,
            1000, 200, 1000, 200, 1000
          ]);
        }

        // Send alert to service worker to open app automatically
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: 'EMERGENCY_ALERT',
            alert: event.data
          });
        }

        // Send CRITICAL push notification (like Amber Alert)
        if ('serviceWorker' in navigator && 'Notification' in window && window.Notification?.permission === 'granted') {
          navigator.serviceWorker.ready.then((registration) => {
            registration.showNotification('🚨 EMERGENCY ALERT', {
              body: `${event.data.alert_type.toUpperCase()}\n\n${event.data.message}`,
              icon: '/icon-192x192.png',
              badge: '/icon-192x192.png',
              vibrate: [1000, 200, 1000, 200, 1000, 200, 1000, 200, 1000],
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
            if ('Notification' in window && window.Notification?.permission === 'granted') {
              try { new window.Notification('🚨 EMERGENCY ALERT', {
                body: `${event.data.alert_type.toUpperCase()}\n\n${event.data.message}`,
                requireInteraction: true,
                tag: 'emergency-' + event.data.id,
              }); } catch (_) {}
            }
          });
        } else if ('Notification' in window && window.Notification?.permission === 'granted') {
          try { new window.Notification('🚨 EMERGENCY ALERT', {
            body: `${event.data.alert_type.toUpperCase()}\n\n${event.data.message}`,
            requireInteraction: true,
            vibrate: [1000, 200, 1000, 200, 1000],
            tag: 'emergency-' + event.data.id,
            renotify: true,
            silent: false
          }); } catch (_) {}
        }
      } else if (event.type === "update") {
        if (!event.data?.is_active) {
          setEmergencyAlert(null);
        } else {
          setEmergencyAlert(event.data);
          if (navigator.vibrate) {
            navigator.vibrate([1000, 200, 1000, 200, 1000, 200, 1000]);
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
        // Ignore old messages that existed before this session mounted
        const msgTime = msg.created_date ? new Date(msg.created_date).getTime() : 0;
        if (msgTime && msgTime < mountTimeRef.current - 5000) return;
        
        // Cache message for offline access
        cacheData('messages', msg);
        
        // Skip own messages
        if (msg.sender_email === user.email) return;

        // For DM channels, only show notification if current user is a participant
        const isDM = msg.channel?.startsWith('DM: ');
        if (isDM && !msg.channel.includes(user.email)) return;

        // Show if it's in a relevant channel or mentions user
        const isHighPriority = msg.message_type === "alert" || 
                               msg.content?.toLowerCase().includes(user.full_name?.toLowerCase()) ||
                               msg.content?.toLowerCase().includes(user.email?.toLowerCase());

        if (isHighPriority) {
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
          if ('Notification' in window && window.Notification?.permission === 'granted') {
            try { new window.Notification(`Message from ${msg.sender_name}`, {
              body: msg.content.substring(0, 100),
              vibrate: msg.message_type === 'alert' ? [200, 100, 200] : [100],
              tag: 'message-' + msg.id,
              silent: false
            }); } catch (_) {}
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
      // Ignore old assignments that existed before this session mounted
      const evtTime = event.data?.created_date ? new Date(event.data.created_date).getTime() : 0;
      if (event.type === "create" && evtTime && evtTime < mountTimeRef.current - 5000) return;

      // Cache assignment for offline access
      if (event.type === "create" || event.type === "update") {
        cacheData('assignments', event.data);
      }

      if (event.type === "create") {
        const assignment = event.data;
        const today = new Date().toISOString().split("T")[0];
        const isToday = assignment.service_date === today;

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
        if ('Notification' in window && window.Notification?.permission === 'granted') {
          try { new window.Notification(isToday ? '🔔 URGENT: New Assignment' : 'New Assignment', {
            body: `${assignment.position_name} - ${new Date(assignment.service_date).toLocaleDateString()}`,
            vibrate: isToday ? [200, 100, 200] : [100],
            tag: 'assignment-' + assignment.id,
            silent: false
          }); } catch (_) {}
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

  // Request notification permission on mount (non-blocking)
  useEffect(() => {
    if ('Notification' in window && window.Notification?.permission === 'default') {
      // Try to request permission, but don't block the app if user denies
      window.Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          console.log('Background notifications enabled - alerts will work when app is closed');
        } else if (permission === 'denied') {
          console.warn('Notifications are blocked - some features may not work');
        }
      }).catch(() => {
        // Request failed - continue anyway
      });
    }

    // Keep app alive in background by pinging periodically
    const keepAlive = setInterval(() => {
      if (document.visibilityState === 'hidden') {
        base44.entities.EmergencyAlert.filter({ is_active: true }).then(alerts => {
          if (alerts.length > 0 && !emergencyAlertRef.current) {
            setEmergencyAlert(alerts[0]);
          }
        }).catch(() => {});
      }
    }, 120000); // Check every 2 minutes when backgrounded

    return () => clearInterval(keepAlive);
  }, []); // No dependency on emergencyAlert — use ref to avoid interval reset

  return (
    <>
      {children}
      <UrgentAlertSystem />
      <EmergencyOverlay 
        alert={emergencyAlert} 
        onDismiss={() => setEmergencyAlert(null)} 
      />
      <OfflineIndicator />
    </>
  );
}