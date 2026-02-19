import { Link } from "react-router-dom";
import { createPageUrl } from "../../utils";
import { CalendarDays, MessageSquare, FileWarning, Eye, Wrench, BookOpen } from "lucide-react";

const ACTIONS = [
  { label: "Assignments", icon: CalendarDays, page: "Assignments", color: "from-blue-600/20 to-blue-800/10" },
  { label: "Communications", icon: MessageSquare, page: "Communications", color: "from-emerald-600/20 to-emerald-800/10" },
  { label: "Incident Report", icon: FileWarning, page: "Incidents", color: "from-orange-600/20 to-orange-800/10" },
  { label: "Watch List", icon: Eye, page: "WatchList", color: "from-red-600/20 to-red-800/10" },
  { label: "Equipment", icon: Wrench, page: "EquipmentInventory", color: "from-purple-600/20 to-purple-800/10" },
  { label: "SOP Library", icon: BookOpen, page: "SOPLibrary", color: "from-cyan-600/20 to-cyan-800/10" },
];

export default function QuickActionGrid() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {ACTIONS.map(action => (
        <Link
          key={action.page}
          to={createPageUrl(action.page)}
          className={`bg-gradient-to-br ${action.color} border border-[rgba(212,168,67,0.1)] rounded-xl p-4 flex flex-col items-center gap-2 hover:border-[#d4a843]/40 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]`}
        >
          <action.icon className="w-6 h-6 text-[#d4a843]" />
          <span className="text-xs font-medium text-slate-300">{action.label}</span>
        </Link>
      ))}
    </div>
  );
}