import { Link, useLocation } from "react-router-dom";
import { Home, MessageSquare, CalendarDays, FileText, User } from "lucide-react";

const TABS = [
  { label: "Home", icon: Home, path: "/" },
  { label: "Comm", icon: MessageSquare, path: "/Communications" },
  { label: "Assign", icon: CalendarDays, path: "/Assignments" },
  { label: "Reports", icon: FileText, path: "/Incidents" },
  { label: "Profile", icon: User, path: "/Profile" },
];

export default function BottomTabs() {
  const location = useLocation();
  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#141f3d] border-t border-[rgba(212,168,67,0.15)] flex"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {TABS.map((tab) => {
        const isActive = location.pathname === tab.path;
        return (
          <Link
            key={tab.path}
            to={tab.path}
            className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 active:bg-white/5 transition-colors"
          >
            <tab.icon className={`w-5 h-5 ${isActive ? "text-[#d4a843]" : "text-slate-400"}`} />
            <span className={`text-[10px] ${isActive ? "text-[#d4a843] font-semibold" : "text-slate-400"}`}>
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}