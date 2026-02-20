import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { AlertTriangle, MessageSquare, CalendarCheck } from "lucide-react";
import EmergencyOverlay from "./EmergencyOverlay";
import OfflineIndicator from "./OfflineIndicator";
import { cacheData, syncPendingMessages } from "./offlineStorage";

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

        // Browser notification if permission granted
        if (Notification.permission === 'granted') {
          new Notification('🚨 EMERGENCY ALERT', {
            body: `${event.data.alert_type}: ${event.data.message}`,
            requireInteraction: true,
            vibrate: [200, 100, 200, 100, 200],
            tag: 'emergency-' + event.data.id
          });
        }
      } else if (event.type === "update" && !event.data?.is_active) {
        setEmergencyAlert(null);
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

          // Browser notification if app is in background
          if (Notification.permission === 'granted' && document.hidden) {
            new Notification(`Message from ${msg.sender_name}`, {
              body: msg.content.substring(0, 100),
              vibrate: [100, 50, 100],
              tag: 'message-' + msg.id
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