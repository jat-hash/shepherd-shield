import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Home, MessageSquare, CalendarDays, FileText, User, Shield, Menu, X, Bell, ChevronDown, Eye, Wrench, BookOpen, MapPin, Calendar, Bot, FolderOpen, RotateCw, Baby, MonitorCheck, ChevronLeft } from "lucide-react";

import NotificationBell from "@/components/notifications/NotificationBell";
import { cacheUserVibrationPrefs, primeAudioContext } from "@/lib/notificationEffects";
import { canAccessMainApp, canAccessNursery } from "@/lib/leadership";
import EmergencyOverrideFlash from "@/components/notifications/EmergencyOverrideFlash";
import AlertNotificationSystem from "@/components/notifications/AlertNotificationSystem";
import UserSwitcher from "@/components/UserSwitcher";
import NotificationToast from "@/components/notifications/NotificationToast";
import EmergencyOverlay from "@/components/notifications/EmergencyOverlay";
import BottomTabs from "@/components/BottomTabs";

const NAV_ITEMS = [
  { name: "Dashboard", icon: Home, page: "Dashboard" },
  { name: "Comm", icon: MessageSquare, page: "Communications" },
  { name: "Assign", icon: CalendarDays, page: "Assignments" },
  { name: "Reports", icon: FileText, page: "Incidents" },
  { name: "Members", icon: User, page: "Members" },
  { name: "Team Map", icon: MapPin, page: "TeamMap" },
];

const ROOT_PAGES = ["Dashboard", "Communications", "Assignments", "Incidents", "Profile"];

const PAGE_TITLES = {
  Members: "Team Members",
  TeamMap: "Live Map",
  WatchList: "Watch List",
  SOPLibrary: "SOP Library",
  Positions: "Positions",
  EquipmentInventory: "Equipment",
  SpecialEvents: "Special Events",
  AutoRotation: "Auto Rotate Schedule",
  Documents: "Documents",
  AdminMonitor: "Admin Monitor",
  NurseryDashboard: "Nursery",
  NurseryMonitor: "Nursery Monitor",
  WhatsAppAdmin: "WhatsApp Admin",
  PushDiagnostics: "Push Diagnostics",
};

export default function Layout({ children, currentPageName }) {
  const { user: authUser } = useAuth();
  const [fallbackUser, setFallbackUser] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [alerts, setAlerts] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [alertUnreadCount, setAlertUnreadCount] = useState(0);
  const [overlayAlert, setOverlayAlert] = useState(null);
  const acknowledgedIdsRef = useRef(new Set());
  const mountedRef = useRef(false);
  const vibrationPrimedRef = useRef(false);

  const user = authUser || fallbackUser;

  const isRootPage = ROOT_PAGES.includes(currentPageName);
  const pageTitle = PAGE_TITLES[currentPageName] || currentPageName;
  const goBack = () => { if (window.history.length > 1) navigate(-1); else navigate("/"); };

  // Nursery access is restricted to authorized users — redirect others away.
  // Nursery-only users are redirected to the Nursery dashboard from any main app page.
  useEffect(() => {
    if (!user) return;
    const onNurseryPage = location.pathname === '/NurseryDashboard' || location.pathname === '/NurseryMonitor';
    if (!canAccessMainApp(user) && !onNurseryPage) {
      navigate('/NurseryDashboard', { replace: true });
    }
    if (!canAccessNursery(user) && onNurseryPage) {
      navigate('/', { replace: true });
    }
  }, [user, location.pathname]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    window.dispatchEvent(new CustomEvent("app:refresh"));
    setTimeout(() => setIsRefreshing(false), 1500);
  };

  // Auto-refresh the app when it returns to the foreground after being
  // backgrounded or closed (e.g. switching apps on mobile). A threshold
  // avoids reloading on quick app switches.
  useEffect(() => {
    let hiddenAt = null;

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
      } else if (document.visibilityState === 'visible' && hiddenAt) {
        hiddenAt = null;
        // Always reload when returning to the foreground so the app is fresh.
        window.location.reload();
      }
    };

    const onPageShow = (e) => {
      // Restored from bfcache or tab/app reopened — always refresh.
      window.location.reload();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);

  useEffect(() => {
    if (!authUser) {
      base44.auth.me().then(u => { setFallbackUser(u); cacheUserVibrationPrefs(u); }).catch(() => {});
    } else {
      cacheUserVibrationPrefs(authUser);
    }
  }, [authUser]);

  // Prime the vibration API + AudioContext on user interaction. We keep listening
  // (not once-only) because Android Chrome's "sticky" user activation for
  // navigator.vibrate can lapse after a few seconds of inactivity — re-priming
  // on every touch/click keeps it unlocked so alerts vibrate reliably.
  useEffect(() => {
    const prime = () => {
      if (navigator.vibrate) {
        try { navigator.vibrate(1); } catch (_) {} // silent 1ms vibration to unlock the API
      }
      primeAudioContext(); // unlock AudioContext for beep fallback (iOS + restricted browsers)
      vibrationPrimedRef.current = true;
    };
    window.addEventListener("touchstart", prime, { passive: true });
    window.addEventListener("click", prime, { passive: true });
    return () => {
      window.removeEventListener("touchstart", prime);
      window.removeEventListener("click", prime);
    };
  }, []);

  useEffect(() => {
    base44.entities.EmergencyAlert.filter({ is_active: true }).then(activeAlerts => {
      setAlerts(activeAlerts);
      // Show overlay for any active alert not yet acknowledged
      if (activeAlerts.length > 0) {
        const unacked = activeAlerts.find(a => !acknowledgedIdsRef.current.has(a.id));
        if (unacked) setOverlayAlert(unacked);
      }
      mountedRef.current = true;
    }).catch(() => { mountedRef.current = true; });

    const unsub = base44.entities.EmergencyAlert.subscribe((event) => {
      if (event.type === "create" && event.data?.is_active) {
        setAlerts(prev => [...prev, event.data]);
        if (!acknowledgedIdsRef.current.has(event.data.id)) {
          setOverlayAlert(event.data);
        }
      } else if (event.type === "update") {
        setAlerts(prev => event.data?.is_active
          ? prev.map(a => a.id === event.id ? event.data : a)
          : prev.filter(a => a.id !== event.id)
        );
        // Show overlay if a newly updated alert is active and unacknowledged
        if (event.data?.is_active && !acknowledgedIdsRef.current.has(event.data.id)) {
          setOverlayAlert(event.data);
        }
        if (!event.data?.is_active) {
          setOverlayAlert(prev => prev?.id === event.id ? null : prev);
        }
      } else if (event.type === "delete") {
        setAlerts(prev => prev.filter(a => a.id !== event.id));
        setOverlayAlert(prev => prev?.id === event.id ? null : prev);
      }
    });
    return unsub;
  }, []);

  const noLayoutPages = ["Login"];
  if (noLayoutPages.includes(currentPageName)) return children;

  // All authenticated users get the full app layout.
  const canSeeNursery = canAccessNursery(user);


  return (
    <>
      <AlertNotificationSystem onUnreadCountChange={setAlertUnreadCount} />
      <div className="min-h-screen bg-[#0a1128] text-white flex flex-col">
      <style>{`
        :root {
          --navy: #0a1128;
          --navy-light: #141f3d;
          --navy-card: #1a2744;
          --gold: #d4a843;
          --gold-hover: #e0bb5e;
          --red-alert: #dc2626;
          --red-alert-hover: #ef4444;
          --text-primary: #f1f5f9;
          --text-secondary: #94a3b8;
          --border-color: rgba(212, 168, 67, 0.15);
        }
        body { background: #0a1128; }
        * { scrollbar-width: thin; scrollbar-color: #1a2744 #0a1128; }
      `}</style>

      {/* Active Emergency Banner */}
      {alerts.length > 0 && (
        <div className="bg-red-600 animate-pulse text-white py-3 px-3 text-sm font-bold tracking-wider flex items-center justify-between gap-2 relative z-50">
          <div className="flex-1 text-center pr-2">
            🚨 ACTIVE ALERT: {alerts[0]?.alert_type?.toUpperCase()} — {alerts[0]?.message}
          </div>
          <button
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              const alertId = alerts[0]?.id;
              if (alertId) {
                try {
                  await base44.entities.EmergencyAlert.update(alertId, { is_active: false });
                  setAlerts([]);
                } catch (error) {
                  console.error('Failed to dismiss alert:', error);
                }
              }
            }}
            onTouchEnd={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              const alertId = alerts[0]?.id;
              if (alertId) {
                try {
                  await base44.entities.EmergencyAlert.update(alertId, { is_active: false });
                  setAlerts([]);
                } catch (error) {
                  console.error('Failed to dismiss alert:', error);
                }
              }
            }}
            className="flex-shrink-0 hover:bg-white/20 active:bg-white/30 rounded p-2 transition-colors cursor-pointer touch-manipulation min-w-[40px] min-h-[40px] flex items-center justify-center"
            title="Dismiss alert"
            type="button"
            aria-label="Dismiss alert"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Top Bar */}
      <header
        className="bg-[#141f3d] border-b border-[rgba(212,168,67,0.15)] px-4 py-3 flex items-center justify-between sticky top-0 z-40"
        style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}
      >
        {isRootPage ? (
          <>
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="lg:hidden p-1">
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div className="flex items-center gap-2">
              <Shield className="w-6 h-6 text-[#d4a843]" />
              <span className="font-bold text-sm tracking-widest uppercase hidden sm:inline">Shepherd Shield</span>
            </div>
          </>
        ) : (
          <>
            <button onClick={goBack} className="lg:hidden p-1 -ml-1 text-slate-300 hover:text-white flex items-center">
              <ChevronLeft className="w-6 h-6" />
            </button>
            <span className="lg:hidden font-bold text-sm tracking-wide text-white">{pageTitle}</span>
            <div className="hidden lg:flex items-center gap-2">
              <Shield className="w-6 h-6 text-[#d4a843]" />
              <span className="font-bold text-sm tracking-widest uppercase">Shepherd Shield</span>
            </div>
          </>
        )}

        <div className="flex items-center gap-3">
          {user?.role === 'admin' && <UserSwitcher user={user} />}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 text-slate-400 hover:text-[#d4a843] transition-colors disabled:opacity-50"
            title="Refresh page"
          >
            <RotateCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
          <NotificationBell userEmail={user?.email} />
          <Link to={createPageUrl("Profile")}>
            <div className="w-8 h-8 rounded-full bg-[#d4a843] flex items-center justify-center text-[#0a1128] font-bold text-xs cursor-pointer hover:bg-[#e0bb5e] transition-colors" title={user?.display_name}>
              {(user?.display_name || "").charAt(0).toUpperCase() || "?"}
            </div>
          </Link>
        </div>
      </header>

      {/* Mobile Sidebar */}
      {sidebarOpen && (
        <>
          <div className="fixed inset-0 bg-black/60 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
          <nav className="fixed left-0 bottom-0 w-64 bg-[#141f3d] border-r border-[rgba(212,168,67,0.15)] flex flex-col py-4 z-40 lg:hidden overflow-y-auto" style={{ top: "calc(57px + env(safe-area-inset-top))" }}>
            {NAV_ITEMS.map(item => {
              const isActive = currentPageName === item.page;
              return (
                <Link
                  key={item.page}
                  to={createPageUrl(item.page)}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-5 py-3 text-sm font-medium transition-all ${
                    isActive
                      ? "text-[#d4a843] bg-[rgba(212,168,67,0.08)] border-r-2 border-[#d4a843]"
                      : "text-slate-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.name === "Comm" ? "Communications" : item.name === "Assign" ? "Assignments" : item.name === "Reports" ? "Incident Reports" : item.name === "Map" ? "Live Map" : item.name}
                </Link>
              );
            })}

            <div className="border-t border-[rgba(212,168,67,0.15)] mt-4 pt-4">
              {canSeeNursery && (
                <Link
                  to="/NurseryDashboard"
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-5 py-3 text-sm font-medium transition-all ${
                    currentPageName === "NurseryDashboard"
                      ? "text-[#d4a843] bg-[rgba(212,168,67,0.08)] border-r-2 border-[#d4a843]"
                      : "text-slate-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <Baby className="w-4 h-4" />
                  Nursery
                </Link>
              )}
              {canAccessNursery(user) && (
                <Link
                  to="/NurseryMonitor"
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-5 py-3 text-sm font-medium transition-all ${
                    currentPageName === "NurseryMonitor"
                      ? "text-[#d4a843] bg-[rgba(212,168,67,0.08)] border-r-2 border-[#d4a843]"
                      : "text-slate-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <MonitorCheck className="w-4 h-4" />
                  Nursery Monitor
                </Link>
              )}
              {user?.role === 'admin' && (
                <Link
                  to={createPageUrl("AdminMonitor")}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-5 py-3 text-sm font-medium transition-all ${
                    currentPageName === "AdminMonitor"
                      ? "text-[#d4a843] bg-[rgba(212,168,67,0.08)] border-r-2 border-[#d4a843]"
                      : "text-slate-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <Shield className="w-4 h-4" />
                  Admin Monitor
                </Link>
              )}

              {/* Resources Dropdown */}
              <div>
                <button
                  onClick={() => setResourcesOpen(!resourcesOpen)}
                  className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <BookOpen className="w-4 h-4" />
                    Resources
                  </div>
                  <ChevronDown className={`w-4 h-4 transition-transform ${resourcesOpen ? "rotate-180" : ""}`} />
                </button>
                {resourcesOpen && (
                  <div className="bg-[#0a1128]/30">
                    {[
                      { name: "Watch List", page: "WatchList", icon: Eye },
                      { name: "SOP Library", page: "SOPLibrary", icon: BookOpen },
                      { name: "Positions", page: "Positions", icon: MapPin },
                    ].map(item => (
                      <Link
                        key={item.page}
                        to={createPageUrl(item.page)}
                        onClick={() => setSidebarOpen(false)}
                        className={`flex items-center gap-3 px-5 py-2.5 pl-12 text-sm font-medium transition-all ${
                          currentPageName === item.page
                            ? "text-[#d4a843] bg-[rgba(212,168,67,0.08)] border-r-2 border-[#d4a843]"
                            : "text-slate-400 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        <item.icon className="w-3.5 h-3.5" />
                        {item.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Tools Dropdown */}
              <div>
                <button
                  onClick={() => setToolsOpen(!toolsOpen)}
                  className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <Wrench className="w-4 h-4" />
                    Tools
                  </div>
                  <ChevronDown className={`w-4 h-4 transition-transform ${toolsOpen ? "rotate-180" : ""}`} />
                </button>
                {toolsOpen && (
                  <div className="bg-[#0a1128]/30">
                    {[
                      { name: "Equipment", page: "EquipmentInventory", icon: Wrench },
                      { name: "Special Events", page: "SpecialEvents", icon: Calendar },
                      ...(user?.role === 'admin' ? [{ name: "Auto Rotate Schedule", page: "AutoRotation", icon: Bot }] : []),
                      { name: "Documents", page: "Documents", icon: FolderOpen },
                    ].map(item => (
                      <Link
                        key={item.page}
                        to={createPageUrl(item.page)}
                        onClick={() => setSidebarOpen(false)}
                        className={`flex items-center gap-3 px-5 py-2.5 pl-12 text-sm font-medium transition-all ${
                          currentPageName === item.page
                            ? "text-[#d4a843] bg-[rgba(212,168,67,0.08)] border-r-2 border-[#d4a843]"
                            : "text-slate-400 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        <item.icon className="w-3.5 h-3.5" />
                        {item.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </nav>
        </>
      )}

      {/* Main Content */}
      <main className="flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-6 lg:ml-56 overflow-x-hidden">
        {children}
      </main>
      <nav className="hidden lg:flex fixed left-0 top-[57px] bottom-0 w-56 bg-[#141f3d] border-r border-[rgba(212,168,67,0.15)] flex-col py-4 z-[1001] overflow-y-auto">
        {NAV_ITEMS.map(item => {
          const isActive = currentPageName === item.page;
          return (
            <Link
              key={item.page}
              to={createPageUrl(item.page)}
              className={`flex items-center gap-3 px-5 py-3 text-sm font-medium transition-all ${
                isActive
                  ? "text-[#d4a843] bg-[rgba(212,168,67,0.08)] border-r-2 border-[#d4a843]"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.name === "Comm" ? "Communications" : item.name === "Assign" ? "Assignments" : item.name === "Reports" ? "Incident Reports" : item.name === "Map" ? "Live Map" : item.name}
            </Link>
          );
        })}

        <div className="border-t border-[rgba(212,168,67,0.15)] mt-4 pt-4">
          {canSeeNursery && (
            <Link
              to="/NurseryDashboard"
              className={`flex items-center gap-3 px-5 py-3 text-sm font-medium transition-all ${
                currentPageName === "NurseryDashboard"
                  ? "text-[#d4a843] bg-[rgba(212,168,67,0.08)] border-r-2 border-[#d4a843]"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <Baby className="w-4 h-4" />
              Nursery
            </Link>
          )}
          {canAccessNursery(user) && (
            <Link
              to="/NurseryMonitor"
              className={`flex items-center gap-3 px-5 py-3 text-sm font-medium transition-all ${
                currentPageName === "NurseryMonitor"
                  ? "text-[#d4a843] bg-[rgba(212,168,67,0.08)] border-r-2 border-[#d4a843]"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <MonitorCheck className="w-4 h-4" />
              Nursery Monitor
            </Link>
          )}
          {user?.role === 'admin' && (
            <Link
              to={createPageUrl("AdminMonitor")}
              className={`flex items-center gap-3 px-5 py-3 text-sm font-medium transition-all ${
                currentPageName === "AdminMonitor"
                  ? "text-[#d4a843] bg-[rgba(212,168,67,0.08)] border-r-2 border-[#d4a843]"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <Shield className="w-4 h-4" />
              Admin Monitor
            </Link>
          )}

          {/* Resources Dropdown */}
          <div>
            <button
              onClick={() => setResourcesOpen(!resourcesOpen)}
              className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-all"
            >
              <div className="flex items-center gap-3">
                <BookOpen className="w-4 h-4" />
                Resources
              </div>
              <ChevronDown className={`w-4 h-4 transition-transform ${resourcesOpen ? "rotate-180" : ""}`} />
            </button>
            {resourcesOpen && (
              <div className="bg-[#0a1128]/30">
                {[
                  { name: "Watch List", page: "WatchList", icon: Eye },
                  { name: "SOP Library", page: "SOPLibrary", icon: BookOpen },
                  { name: "Positions", page: "Positions", icon: MapPin },
                ].map(item => (
                  <Link
                    key={item.page}
                    to={createPageUrl(item.page)}
                    className={`flex items-center gap-3 px-5 py-2.5 pl-12 text-sm font-medium transition-all ${
                      currentPageName === item.page
                        ? "text-[#d4a843] bg-[rgba(212,168,67,0.08)] border-r-2 border-[#d4a843]"
                        : "text-slate-400 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <item.icon className="w-3.5 h-3.5" />
                    {item.name}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Tools Dropdown */}
          <div>
            <button
              onClick={() => setToolsOpen(!toolsOpen)}
              className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-all"
            >
              <div className="flex items-center gap-3">
                <Wrench className="w-4 h-4" />
                Tools
              </div>
              <ChevronDown className={`w-4 h-4 transition-transform ${toolsOpen ? "rotate-180" : ""}`} />
            </button>
            {toolsOpen && (
              <div className="bg-[#0a1128]/30">
                {[
                  { name: "Equipment", page: "EquipmentInventory", icon: Wrench },
                  { name: "Special Events", page: "SpecialEvents", icon: Calendar },
                  ...(user?.role === 'admin' ? [{ name: "Auto Rotate Schedule", page: "AutoRotation", icon: Bot }] : []),
                  { name: "Documents", page: "Documents", icon: FolderOpen },
                ].map(item => (
                  <Link
                    key={item.page}
                    to={createPageUrl(item.page)}
                    className={`flex items-center gap-3 px-5 py-2.5 pl-12 text-sm font-medium transition-all ${
                      currentPageName === item.page
                        ? "text-[#d4a843] bg-[rgba(212,168,67,0.08)] border-r-2 border-[#d4a843]"
                        : "text-slate-400 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <item.icon className="w-3.5 h-3.5" />
                    {item.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </nav>
      <BottomTabs />
    </div>
    <NotificationToast userEmail={user?.email} />
    {/* Emergency Override: only for admins and Wilbert Ryan */}
    {user?.emergency_override && alerts.length > 0 && (user?.role === 'admin' || user?.email === 'wilbert.ryan@gmail.com') && (
      <EmergencyOverrideFlash alert={alerts[0]} />
    )}
    <EmergencyOverlay
      alert={overlayAlert}
      onDismiss={() => {
        if (overlayAlert) acknowledgedIdsRef.current.add(overlayAlert.id);
        setOverlayAlert(null);
      }}
    />
    </>
  );
}