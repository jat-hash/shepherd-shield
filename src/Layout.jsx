import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Home, MessageSquare, CalendarDays, FileText, User, Shield, Menu, X, Bell, ChevronDown, Eye, Wrench, BookOpen, MapPin, Calendar, Bot, FolderOpen, MessageCircle } from "lucide-react";
import { Toaster } from "sonner";

import NotificationProvider from "@/components/notifications/NotificationProvider";
import NotificationBell from "@/components/notifications/NotificationBell";
import PWAInstaller from "@/components/PWAInstaller";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

const NAV_ITEMS = [
  { name: "Dashboard", icon: Home, page: "Dashboard" },
  { name: "WhatsApp", icon: MessageCircle, page: "WhatsAppAdmin" },
  { name: "Comm", icon: MessageSquare, page: "Communications" },
  { name: "Assign", icon: CalendarDays, page: "Assignments" },
  { name: "Reports", icon: FileText, page: "Incidents" },

  { name: "Members", icon: User, page: "Members" },
  { name: "Team Map", icon: MapPin, page: "TeamMap" },
];

export default function Layout({ children, currentPageName }) {
  const [user, setUser] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
    base44.entities.EmergencyAlert.filter({ is_active: true }).then(setAlerts).catch(() => {});

    const unsub = base44.entities.EmergencyAlert.subscribe((event) => {
      if (event.type === "create" && event.data?.is_active) {
        setAlerts(prev => [...prev, event.data]);
      } else if (event.type === "update") {
        setAlerts(prev => event.data?.is_active
          ? prev.map(a => a.id === event.id ? event.data : a)
          : prev.filter(a => a.id !== event.id)
        );
      } else if (event.type === "delete") {
        setAlerts(prev => prev.filter(a => a.id !== event.id));
      }
    });
    return unsub;
  }, []);

  const noLayoutPages = ["Login"];
  if (noLayoutPages.includes(currentPageName)) return children;

  return (
    <NotificationProvider>
      <ServiceWorkerRegister />
      <Toaster richColors closeButton position="top-right" />
      <PWAInstaller />
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
      <header className="bg-[#141f3d] border-b border-[rgba(212,168,67,0.15)] px-4 py-3 flex items-center justify-between sticky top-0 z-40">
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="lg:hidden p-1">
          {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>

        <div className="flex items-center gap-2">
          <Shield className="w-6 h-6 text-[#d4a843]" />
          <span className="font-bold text-sm tracking-widest uppercase hidden sm:inline">Shepherd Shield</span>
        </div>

        <div className="flex items-center gap-3">
          <NotificationBell userEmail={user?.email} />
          <Link to={createPageUrl("Profile")}>
            <div className="w-8 h-8 rounded-full bg-[#d4a843] flex items-center justify-center text-[#0a1128] font-bold text-xs cursor-pointer hover:bg-[#e0bb5e] transition-colors" title={user?.display_name || user?.full_name || "User"}>
              {(user?.display_name || user?.full_name)?.charAt(0) || "U"}
            </div>
          </Link>
        </div>
      </header>

      {/* Mobile Sidebar */}
      {sidebarOpen && (
        <>
          <div className="fixed inset-0 bg-black/60 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
          <nav className="fixed left-0 top-[57px] bottom-0 w-64 bg-[#141f3d] border-r border-[rgba(212,168,67,0.15)] flex flex-col py-4 z-40 lg:hidden overflow-y-auto">
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
                      { name: "Auto Rotate Schedule", page: "AutoRotation", icon: Bot },
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
      <main className="flex-1 pb-6 overflow-auto">
        {children}
      </main>



      {/* Desktop Sidebar Nav (hidden on mobile) */}
      <nav className="hidden lg:flex fixed left-0 top-[57px] bottom-0 w-56 bg-[#141f3d] border-r border-[rgba(212,168,67,0.15)] flex-col py-4 z-30 overflow-y-auto">
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
                  { name: "Auto Rotate Schedule", page: "AutoRotation", icon: Bot },
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
    </div>
    </NotificationProvider>
  );
}