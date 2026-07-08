import { useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import AssignmentCard from "@/components/dashboard/AssignmentCard";
import EmergencyButton from "@/components/dashboard/EmergencyButton";
import StatusBar from "@/components/dashboard/StatusBar";
import QuickActionGrid from "@/components/dashboard/QuickActionGrid";
import SOPQuickAccess from "@/components/dashboard/SOPQuickAccess";
import SpecialEventsDropdown from "@/components/dashboard/SpecialEventsDropdown";
import NotifyTeamButton from "@/components/dashboard/NotifyTeamButton";
import SafetyCheckInPanel from "@/components/dashboard/SafetyCheckInPanel";
import { WifiOff, MapPin, X, Bell, AlertTriangle } from "lucide-react";
import RadioCheckInScanner from "@/components/dashboard/RadioCheckInScanner";
import QuickEquipmentCheckIn from "@/components/dashboard/QuickEquipmentCheckIn";
import PersonalCheckIn from "@/components/dashboard/PersonalCheckIn";
import AdminDashboardPanel from "@/components/dashboard/AdminDashboardPanel";
import MyCheckInStatus from "@/components/dashboard/MyCheckInStatus";
import ChurchServiceAlerts from "@/components/dashboard/ChurchServiceAlerts";
import PullToRefresh from "@/components/PullToRefresh";
import { toast } from "sonner";

export default function Dashboard() {
  const { user: authUser } = useAuth();
  const [user, setUser] = useState(null);
  const [userLoaded, setUserLoaded] = useState(false);
  const [locationDismissed, setLocationDismissed] = useState(() => localStorage.getItem('locationPromptDismissed') === 'true');
  const [locationGranted, setLocationGranted] = useState(() => localStorage.getItem('locationGranted') === 'true');
  const [notifGranted, setNotifGranted] = useState(() => ('Notification' in window) && window.Notification?.permission === 'granted');
  // Tracks whether a push token is actually saved — the green "enabled" banner
  // must reflect real registration, not just browser permission (which can be
  // granted while the FCM token save silently failed).
  const [pushRegistered, setPushRegistered] = useState(false);

  useEffect(() => {
    if (!navigator.geolocation) return;
    // Only check permission status without ever firing a GPS fetch here —
    // calling getCurrentPosition on every Dashboard mount would re-trigger the
    // browser's native location prompt (especially on iOS Safari, which has no
    // Permissions API), which is why permission keeps being asked. We rely on the
    // Permissions API when available; otherwise we just assume not-granted and
    // let the user opt in via the banner button below.
    if (navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' }).then((result) => {
        const granted = result.state === 'granted';
        setLocationGranted(granted);
        if (granted) localStorage.setItem('locationGranted', 'true');
        result.onchange = () => {
          const g = result.state === 'granted';
          setLocationGranted(g);
          if (g) localStorage.setItem('locationGranted', 'true');
        };
      }).catch(() => {});
    }
  }, []);

  const requestLocation = () => {
    navigator.geolocation.getCurrentPosition(
      () => {
        setLocationGranted(true);
        localStorage.setItem('locationGranted', 'true');
        setLocationDismissed(true);
        localStorage.setItem('locationPromptDismissed', 'true');
      },
      () => {},
      { enableHighAccuracy: true }
    );
  };

  const dismissLocation = () => {
    localStorage.setItem('locationPromptDismissed', 'true');
    setLocationDismissed(true);
  };

  // Detect if we're inside the Base44 builder preview iframe — service workers
  // can't register in cross-origin iframes, so push notifications are impossible
  // here. We show a clear message instead of a confusing "not supported" error.
  const isInPreview = () => {
    try { return window.self !== window.top; } catch (_) { return true; }
  };

  // iOS Safari (before PWA installation) has NO Notification API at all — so
  // every push banner below is hidden, and users see nothing. We detect iOS and
  // show an "Add to Home Screen" prompt instead.
  const isIOS = () => {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    const isIPhone = /iPad|iPhone|iPod/.test(ua);
    const isIPadDesktop = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    // Standalone means it's already installed as a PWA — in which case Notification
    // IS available and we don't need this banner.
    const isStandalone = window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true;
    return (isIPhone || isIPadDesktop) && !isStandalone;
  };

  const requestNotifications = async () => {
    if (isInPreview()) {
      toast.error('Push can\'t be enabled in the builder preview. Open the published app in Chrome to enable.', { duration: 8000 });
      return;
    }
    if (!('Notification' in window)) {
      toast.error('This browser doesn\'t support notifications', { duration: 6000 });
      return;
    }
    toast.info('Requesting notification permission...', { duration: 3000 });
    const permission = await window.Notification.requestPermission();
    if (permission === 'granted') {
      setNotifGranted(true);
      toast.success('Permission granted — registering your device...', { duration: 3000 });
      // Trigger FCM token registration now that permission is granted
      window.dispatchEvent(new CustomEvent('push:register'));
    } else if (permission === 'denied') {
      toast.error('Notifications were blocked. Go to browser Settings → Site Permissions → Notifications to allow this site.', { duration: 10000 });
    } else {
      toast('Permission dismissed — tap "Enable Now" again to retry', { duration: 5000 });
    }
  };



  useEffect(() => {
    if (authUser) {
      setUser(authUser);
      setUserLoaded(true);
    } else {
      // Failsafe: don't spin forever if auth is slow
      const t = setTimeout(() => setUserLoaded(true), 5000);
      return () => clearTimeout(t);
    }
  }, [authUser]);

  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [allUsers, setAllUsers] = useState([]);

  const reloadTimeout = useRef(null);
  const reload = useCallback(() => {
    if (reloadTimeout.current) clearTimeout(reloadTimeout.current);
    reloadTimeout.current = setTimeout(async () => {
      if (!user) return;
      setLoading(true);
      try {
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        const all = await base44.entities.Assignment.filter({ assigned_to_email: user.email }, "-service_date", 1000);
        const monthAssignments = all.filter(a => {
          const d = new Date(a.service_date);
          return d >= startOfMonth && d <= endOfMonth;
        });
        // Only show upcoming assignments (today and future), nearest first
        const upcoming = all
          .filter(a => a.service_date.slice(0, 10) >= todayStr)
          .sort((a, b) => a.service_date.slice(0, 10).localeCompare(b.service_date.slice(0, 10)));
        setAssignments(upcoming.slice(0, 3));
      } catch {}
      setLoading(false);
    }, 300);
  }, [user]);

  // Check whether this user has an actual saved FCM token. Re-checks after any
  // registration attempt (push:register event) so the banner updates in real time.
  useEffect(() => {
    if (!user?.email) return;
    const check = async () => {
      try {
        // FCM (Android/Chrome/desktop) OR native Web Push (iOS Safari PWA)
        const [fcmDevices, webPushSubs] = await Promise.all([
          base44.entities.UserDevice.filter({ user_email: user.email }),
          base44.entities.PushSubscription.filter({ user_email: user.email }),
        ]);
        setPushRegistered(
          (fcmDevices && fcmDevices.length > 0) ||
          (webPushSubs && webPushSubs.length > 0)
        );
      } catch {
        setPushRegistered(false);
      }
    };
    check();
    window.addEventListener('push:register', check);
    return () => window.removeEventListener('push:register', check);
  }, [user]);

  // Load active alerts
  useEffect(() => {
    base44.entities.EmergencyAlert.filter({ is_active: true }).then(setActiveAlerts).catch(() => {});
    const unsub = base44.entities.EmergencyAlert.subscribe((event) => {
      if (event.type === "create" && event.data?.is_active) setActiveAlerts(prev => [...prev, event.data]);
      else if (event.type === "update") setActiveAlerts(prev => event.data?.is_active ? prev.map(a => a.id === event.id ? event.data : a) : prev.filter(a => a.id !== event.id));
      else if (event.type === "delete") setActiveAlerts(prev => prev.filter(a => a.id !== event.id));
    });
    return unsub;
  }, []);

  // Load allUsers for admin panel
  useEffect(() => {
    if (user?.role === 'admin') {
      base44.functions.invoke("listUsers").then(res => setAllUsers(res?.data?.users || [])).catch(() => {});
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const unsub = base44.entities.Assignment.subscribe(() => reload());
    return unsub;
  }, [user, reload]);

  useEffect(() => {
    const onRefresh = () => reload();
    window.addEventListener("app:refresh", onRefresh);
    return () => window.removeEventListener("app:refresh", onRefresh);
  }, [reload]);

  if (!userLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0a1128]">
        <div className="w-8 h-8 border-2 border-[#d4a843] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={reload}>
    <div className="max-w-2xl mx-auto px-3 py-4 lg:px-4 lg:py-6 space-y-4">
      {/* Active Emergency Alerts */}
      {activeAlerts.map(alert => (
        <div key={alert.id} className="flex items-start gap-3 bg-red-900/60 border border-red-500/50 rounded-lg px-4 py-3 text-red-200 text-sm shadow-lg animate-pulse">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-red-400" />
          <div className="flex-1">
            <p className="font-bold text-white">🚨 ACTIVE ALERT: {alert.alert_type}</p>
            <p className="text-xs text-red-300 mt-0.5">{alert.message}</p>
          </div>
          {user?.role === 'admin' && (
            <button
              onClick={async () => {
                await base44.entities.EmergencyAlert.update(alert.id, { is_active: false });
                setActiveAlerts(prev => prev.filter(a => a.id !== alert.id));
              }}
              className="text-red-400 hover:text-white mt-0.5 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
      {!navigator.onLine && (
        <div className="flex items-center gap-2 bg-orange-900/40 border border-orange-500/30 rounded-lg px-3 py-2 text-orange-300 text-xs">
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          You're offline — showing cached data
        </div>
      )}
      {!('Notification' in window) && isIOS() && !isInPreview() && (
        <div className="flex items-start gap-3 bg-purple-900/60 border-2 border-purple-400/60 rounded-lg px-4 py-3 text-purple-200 text-sm shadow-lg animate-pulse">
          <Bell className="w-6 h-6 shrink-0 mt-0.5 text-purple-300 animate-bounce" />
          <div className="flex-1">
            <p className="font-bold text-white">🔔 Install App to Enable Alerts</p>
            <p className="text-xs text-purple-200 mt-0.5">On iPhone, push notifications only work when the app is installed. Tap the <span className="font-bold">Share</span> button at the bottom of Safari, then <span className="font-bold">"Add to Home Screen"</span>. Open the app from your home screen to enable vibration alerts.</p>
          </div>
        </div>
      )}
      {isInPreview() && !notifGranted && (
        <div className="flex items-center gap-3 bg-blue-900/50 border border-blue-400/40 rounded-lg px-4 py-3 text-blue-200 text-sm shadow-lg">
          <Bell className="w-6 h-6 shrink-0 text-blue-300" />
          <div className="flex-1">
            <p className="font-bold text-white">🔔 Push Notifications</p>
            <p className="text-xs text-blue-300 mt-0.5">Push notifications can't be enabled in the builder preview. Open the published app in Chrome on your phone or desktop to enable vibration alerts.</p>
          </div>
        </div>
      )}
      {'Notification' in window && !isInPreview() && !notifGranted && (
        <div className="flex items-center gap-3 bg-yellow-900/70 border-2 border-yellow-400/70 rounded-lg px-4 py-3 text-yellow-200 text-sm shadow-lg animate-pulse">
          <Bell className="w-6 h-6 shrink-0 text-yellow-300 animate-bounce" />
          <div className="flex-1">
            <p className="font-bold text-white">🔔 Enable Push Notifications</p>
            <p className="text-xs text-yellow-200 mt-0.5">Receive vibration alerts and messages even when this app is closed or in the background.</p>
          </div>
          <button
            onClick={requestNotifications}
            className="shrink-0 bg-yellow-600 hover:bg-yellow-500 active:bg-yellow-700 text-white text-xs font-bold px-4 py-2 rounded-md transition-colors touch-manipulation"
          >
            Enable Now
          </button>
        </div>
      )}
      {'Notification' in window && notifGranted && pushRegistered && (
        <div className="flex items-center gap-3 bg-green-900/50 border border-green-500/50 rounded-lg px-4 py-3 text-green-200 text-sm">
          <span className="text-lg">✅</span>
          <p className="text-xs">Push notifications enabled — your phone will vibrate when alerts arrive.</p>
        </div>
      )}
      {'Notification' in window && notifGranted && !pushRegistered && (
        <div className="flex items-center gap-3 bg-orange-900/60 border-2 border-orange-400/60 rounded-lg px-4 py-3 text-orange-200 text-sm shadow-lg animate-pulse">
          <span className="text-lg">⚠️</span>
          <div className="flex-1">
            <p className="font-bold text-white">Push setup incomplete</p>
            <p className="text-xs text-orange-200 mt-0.5">Permission granted, but this device isn't registered. Tap to finish setup.</p>
            <button
              onClick={async () => {
                toast.info('Force resetting all push data...', { duration: 3000 });
                try {
                  // Unregister ALL service workers (clears stale SW from old Firebase projects)
                  if ('serviceWorker' in navigator) {
                    const regs = await navigator.serviceWorker.getRegistrations();
                    for (const reg of regs) await reg.unregister();
                  }
                  // Clear all caches
                  if ('caches' in window) {
                    const keys = await caches.keys();
                    for (const key of keys) await caches.delete(key);
                  }
                  // Clear all Firebase-related IndexedDB databases (stale token cache)
                  if (typeof indexedDB.databases === 'function') {
                    const dbs = await indexedDB.databases();
                    for (const db of dbs) {
                      if (db.name && (db.name.includes('firebase') || db.name.includes('fcm'))) {
                        await new Promise((resolve) => {
                          const req = indexedDB.deleteDatabase(db.name);
                          req.onsuccess = resolve;
                          req.onerror = resolve;
                          req.onblocked = () => resolve();
                        });
                      }
                    }
                  }
                  toast.success('Cleared! Reloading page...', { duration: 2000 });
                  setTimeout(() => window.location.reload(), 1200);
                } catch (err) {
                  toast.error('Reset failed: ' + err.message, { duration: 5000 });
                }
              }}
              className="mt-1.5 text-orange-300 hover:text-white text-xs underline"
            >
              Still not working? Force reset
            </button>
          </div>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('push:register'))}
            className="shrink-0 bg-orange-600 hover:bg-orange-500 active:bg-orange-700 text-white text-xs font-bold px-4 py-2 rounded-md transition-colors touch-manipulation"
          >
            Retry
          </button>
        </div>
      )}
      {!locationGranted && !locationDismissed && (
        <div className="flex items-start gap-3 bg-blue-900/50 border border-blue-400/40 rounded-lg px-4 py-3 text-blue-200 text-sm shadow-lg">
          <MapPin className="w-5 h-5 shrink-0 mt-0.5 text-blue-400" />
          <div className="flex-1">
            <p className="font-bold text-white">📍 Location Access Required</p>
            <p className="text-xs text-blue-300 mt-0.5">Enable GPS so your team can see your location on the Team Map during services.</p>
            <button
              onClick={requestLocation}
              className="mt-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-1.5 rounded-md transition-colors"
            >
              Allow Location
            </button>
            <button
              onClick={dismissLocation}
              className="ml-2 mt-2 text-blue-300 hover:text-white text-xs underline"
            >
              Not now
            </button>
          </div>
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">
            Welcome back, <span className="text-[#d4a843]">{(authUser?.data?.display_name || authUser?.display_name || authUser?.full_name || user?.data?.display_name || user?.display_name || user?.full_name)?.split(" ")[0] || "Officer"}</span>
          </h1>
          <p className="text-slate-300 text-xs sm:text-sm mt-1">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          </p>
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          <NotifyTeamButton user={user} />
          <EmergencyButton user={user} />
        </div>
      </div>

      {/* Church Service Alert Buttons */}
      <ChurchServiceAlerts user={user} />

      {/* My Check-in Status Banner */}
      {user && <MyCheckInStatus user={user} />}

      {/* Personal Check-in Status */}
      {user && <PersonalCheckIn user={user} />}

      {/* Admin: Team Status Panel */}
      {user?.role === 'admin' && <AdminDashboardPanel allUsers={allUsers} />}

      <SpecialEventsDropdown />

      <RadioCheckInScanner user={user} />
      <QuickEquipmentCheckIn />

      <div className="space-y-3">
        <h2 className="text-sm uppercase tracking-widest text-[#d4a843] font-semibold">Next Assignment</h2>
        {assignments.length === 0 ? (
          <div className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-6 text-center">
            <p className="text-slate-200 text-sm">No assignments this month</p>
          </div>
        ) : (
          assignments.map(assignment => (
            <AssignmentCard key={assignment.id} assignment={assignment} onUpdate={reload} />
          ))
        )}
      </div>

      <SafetyCheckInPanel />
      <StatusBar />
      <SOPQuickAccess />
      <QuickActionGrid />
    </div>
    </PullToRefresh>
  );
}