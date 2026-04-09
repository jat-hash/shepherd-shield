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
import { WifiOff, MapPin, X, Bell } from "lucide-react";
import RadioCheckInScanner from "@/components/dashboard/RadioCheckInScanner";
import PersonalCheckIn from "@/components/dashboard/PersonalCheckIn";

export default function Dashboard() {
  const { user: authUser } = useAuth();
  const [user, setUser] = useState(null);
  const [userLoaded, setUserLoaded] = useState(false);
  const [locationDismissed, setLocationDismissed] = useState(() => sessionStorage.getItem('locationPromptDismissed') === 'true');
  const [locationGranted, setLocationGranted] = useState(true);
  const [notifDismissed, setNotifDismissed] = useState(() => sessionStorage.getItem('notifPromptDismissed') === 'true');
  const [notifGranted, setNotifGranted] = useState(() => ('Notification' in window) && window.Notification?.permission === 'granted');

  useEffect(() => {
    if (!navigator.geolocation) return;
    if (navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' }).then((result) => {
        if (result.state !== 'granted') setLocationGranted(false);
        result.onchange = () => { if (result.state === 'granted') setLocationGranted(true); };
      });
    } else {
      // Fallback: try to get location silently
      navigator.geolocation.getCurrentPosition(
        () => setLocationGranted(true),
        () => setLocationGranted(false),
        { timeout: 3000 }
      );
    }
  }, []);

  const requestLocation = () => {
    navigator.geolocation.getCurrentPosition(
      () => { setLocationGranted(true); },
      () => {},
      { enableHighAccuracy: true }
    );
  };

  const dismissLocation = () => {
    sessionStorage.setItem('locationPromptDismissed', 'true');
    setLocationDismissed(true);
  };

  const requestNotifications = async () => {
    if (!('Notification' in window)) return;
    const permission = await window.Notification.requestPermission();
    if (permission === 'granted') {
      setNotifGranted(true);
      // Trigger FCM token registration now that permission is granted
      window.dispatchEvent(new CustomEvent('push:register'));
    }
  };

  const dismissNotif = () => {
    sessionStorage.setItem('notifPromptDismissed', 'true');
    setNotifDismissed(true);
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

  useEffect(() => { reload(); }, [reload]);

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

  if (!userLoaded || (loading && !assignments.length && user)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-[#d4a843] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-3 py-4 lg:px-4 lg:py-6 lg:ml-60 space-y-4">
      {!navigator.onLine && (
        <div className="flex items-center gap-2 bg-orange-900/40 border border-orange-500/30 rounded-lg px-3 py-2 text-orange-300 text-xs">
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          You're offline — showing cached data
        </div>
      )}
      {'Notification' in window && !notifGranted && !notifDismissed && (
        <div className="flex items-start gap-3 bg-yellow-900/50 border border-yellow-400/40 rounded-lg px-4 py-3 text-yellow-200 text-sm shadow-lg">
          <Bell className="w-5 h-5 shrink-0 mt-0.5 text-yellow-400" />
          <div className="flex-1">
            <p className="font-bold text-white">🔔 Enable Push Notifications</p>
            <p className="text-xs text-yellow-300 mt-0.5">Get instant alerts for emergencies, assignments, and team messages directly on your device.</p>
            <button
              onClick={requestNotifications}
              className="mt-2 bg-yellow-600 hover:bg-yellow-500 text-white text-xs font-bold px-3 py-1.5 rounded-md transition-colors"
            >
              Enable Notifications
            </button>
          </div>
          <button onClick={dismissNotif} className="text-yellow-400 hover:text-white mt-0.5">
            <X className="w-4 h-4" />
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
          </div>
          <button onClick={dismissLocation} className="text-blue-400 hover:text-white mt-0.5">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">
            Welcome back, <span className="text-[#d4a843]">{(authUser?.full_name || user?.full_name)?.split(" ")[0] || (authUser?.display_name || user?.display_name)?.split(" ")[0] || "Officer"}</span>
          </h1>
          <p className="text-slate-300 text-xs sm:text-sm mt-1">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          </p>
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          <NotifyTeamButton user={user} />
          <EmergencyButton />
        </div>
      </div>

      <SpecialEventsDropdown />

      <PersonalCheckIn user={user} />
      <RadioCheckInScanner user={user} />

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
  );
}