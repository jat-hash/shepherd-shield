import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { LogOut, Shield, Users, RefreshCw, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { createPageUrl } from "../utils";

export default function Profile() {
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState({ assignments: 0, incidents: 0, equipment: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const u = await base44.auth.me();
      setUser(u);

      const [assignments, incidents, equipment] = await Promise.all([
        base44.entities.Assignment.filter({ assigned_to_email: u.email }),
        base44.entities.Incident.filter({ reported_by: u.full_name || u.email }),
        base44.entities.Equipment.list("-created_date", 500),
      ]);

      setStats({
        assignments: assignments.length,
        incidents: incidents.length,
        equipment: equipment.length,
      });
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-[#d4a843] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 lg:ml-60 space-y-6">
      {/* Profile Header */}
      <div className="bg-[#1a2744] rounded-2xl border border-[rgba(212,168,67,0.1)] p-6 text-center">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#d4a843] to-[#b8902a] flex items-center justify-center text-[#0a1128] text-3xl font-bold mx-auto mb-4">
          {user?.full_name?.charAt(0) || "U"}
        </div>
        <h2 className="text-xl font-bold text-white">{user?.full_name || "User"}</h2>
        <p className="text-sm text-slate-400 mt-1">{user?.email}</p>
        <span className="inline-block mt-2 px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-[#d4a843]/20 text-[#d4a843] border border-[#d4a843]/30">
          {user?.role || "Team Member"}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Assignments", value: stats.assignments, color: "text-blue-400" },
          { label: "Incidents", value: stats.incidents, color: "text-orange-400" },
          { label: "Equipment", value: stats.equipment, color: "text-emerald-400" },
        ].map(stat => (
          <div key={stat.label} className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-4 text-center">
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Menu Items */}
      <div className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] divide-y divide-[rgba(212,168,67,0.08)]">
        {user?.role === "admin" && (
          <div className="p-4 flex items-center gap-3 text-slate-300">
            <Users className="w-4 h-4 text-[#d4a843]" />
            <span className="text-sm">Manage Users</span>
            <span className="ml-auto text-[10px] bg-[#d4a843]/20 text-[#d4a843] px-2 py-0.5 rounded-full">Admin</span>
          </div>
        )}
        <Link to={createPageUrl("WatchList")} className="p-4 flex items-center gap-3 text-slate-300 hover:bg-white/5 transition-colors">
          <Shield className="w-4 h-4 text-[#d4a843]" />
          <span className="text-sm">Watch List</span>
        </Link>
        <Link to={createPageUrl("SOPLibrary")} className="p-4 flex items-center gap-3 text-slate-300 hover:bg-white/5 transition-colors">
          <FileText className="w-4 h-4 text-[#d4a843]" />
          <span className="text-sm">SOP Library</span>
        </Link>
        <Link to={createPageUrl("EquipmentInventory")} className="p-4 flex items-center gap-3 text-slate-300 hover:bg-white/5 transition-colors">
          <RefreshCw className="w-4 h-4 text-[#d4a843]" />
          <span className="text-sm">Equipment Inventory</span>
        </Link>
      </div>

      {/* Logout */}
      <Button
        onClick={() => base44.auth.logout()}
        variant="outline"
        className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 gap-2"
      >
        <LogOut className="w-4 h-4" /> Logout
      </Button>
    </div>
  );
}