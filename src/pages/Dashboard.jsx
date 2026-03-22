import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import AssignmentCard from "@/components/dashboard/AssignmentCard";
import EmergencyButton from "@/components/dashboard/EmergencyButton";
import StatusBar from "@/components/dashboard/StatusBar";
import QuickActionGrid from "@/components/dashboard/QuickActionGrid";
import SOPQuickAccess from "@/components/dashboard/SOPQuickAccess";
import SpecialEventsDropdown from "@/components/dashboard/SpecialEventsDropdown";
import NotifyTeamButton from "@/components/dashboard/NotifyTeamButton";
import SafetyCheckInPanel from "@/components/dashboard/SafetyCheckInPanel";
import useOfflineData from "@/hooks/useOfflineData";
import TeamLocationMap from "@/components/dashboard/TeamLocationMap";
import { WifiOff } from "lucide-react";

export default function Dashboard() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const fetchAssignments = useCallback(async () => {
    if (!user) return [];
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const all = await base44.entities.Assignment.filter({ assigned_to_email: user.email }, "-service_date", 1000);
    return all.filter(a => {
      const d = new Date(a.service_date);
      return d >= startOfMonth && d <= endOfMonth;
    });
  }, [user]);

  const { data: assignments, loading, isOffline, reload } = useOfflineData("assignments", fetchAssignments, [user]);

  useEffect(() => {
    if (!user) return;
    const unsub = base44.entities.Assignment.subscribe(() => reload());
    return unsub;
  }, [user, reload]);

  if (loading && !assignments.length) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-[#d4a843] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-3 py-4 lg:px-4 lg:py-6 lg:ml-60 space-y-4">
      {isOffline && (
        <div className="flex items-center gap-2 bg-orange-900/40 border border-orange-500/30 rounded-lg px-3 py-2 text-orange-300 text-xs">
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          You're offline — showing cached data
        </div>
      )}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white">
          Welcome back, <span className="text-[#d4a843]">{user?.display_name?.split(" ")[0] || user?.full_name?.split(" ")[0] || "Officer"}</span>
        </h1>
        <p className="text-slate-300 text-xs sm:text-sm mt-1">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
        </p>
      </div>

      <SpecialEventsDropdown />

      {/* This Month's Assignments */}
      <div className="space-y-3">
        <h2 className="text-sm uppercase tracking-widest text-[#d4a843] font-semibold">This Month's Assignments</h2>
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

      {user?.role === 'admin' && <TeamLocationMap />}
      <SafetyCheckInPanel />
      <NotifyTeamButton user={user} />
      <EmergencyButton />
      <StatusBar />
      <SOPQuickAccess />
      <QuickActionGrid />
    </div>
  );
}