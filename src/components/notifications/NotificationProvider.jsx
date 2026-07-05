import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import EmergencyOverlay from "./EmergencyOverlay";
import OfflineIndicator from "./OfflineIndicator";
import UrgentAlertSystem from "./UrgentAlertSystem";
import { cacheData, syncPendingMessages } from "@/lib/offlineStorage";
import { triggerNotificationEffect } from "@/lib/notificationEffects";
import WebPushRegistrar from "./WebPushRegistrar";
import BrowserNotificationDispatcher from "./BrowserNotificationDispatcher";

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

        // INTENSE vibration + screen flash (works on iOS too)
        triggerNotificationEffect('emergency');

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
          triggerNotificationEffect('emergency');
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

        // Only trigger sensory effect for alert-type messages (not DMs — those come via Notification entity)
        const isAlertMessage = msg.message_type === "alert";
        if (isAlertMessage) {
          triggerNotificationEffect('alert');
        }
        // DM and general message toasts are handled by NotificationToast via the Notification entity
        // to avoid duplicates. We only handle alert-type messages here.
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

      // Only trigger sensory effects here — toasts are handled by NotificationToast
      // via the Notification entity to avoid duplicates
      if (event.type === "create") {
        triggerNotificationEffect('assignment');
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
      <WebPushRegistrar />
      <BrowserNotificationDispatcher />
      <UrgentAlertSystem />
      <EmergencyOverlay 
        alert={emergencyAlert} 
        onDismiss={() => setEmergencyAlert(null)} 
      />
      <OfflineIndicator />
    </>
  );
}