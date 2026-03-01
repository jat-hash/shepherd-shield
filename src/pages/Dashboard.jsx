import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import AssignmentCard from "@/components/dashboard/AssignmentCard";
import EmergencyButton from "@/components/dashboard/EmergencyButton";
import StatusBar from "@/components/dashboard/StatusBar";
import QuickActionGrid from "@/components/dashboard/QuickActionGrid";
import SOPQuickAccess from "@/components/dashboard/SOPQuickAccess";
import SpecialEventsDropdown from "@/components/dashboard/SpecialEventsDropdown";
import NotifyTeamButton from "@/components/dashboard/NotifyTeamButton";

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const u = await base44.auth.me();
      setUser(u);
      
      // Get start and end of current month
      const today = new Date();
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      
      const allAssignments = await base44.entities.Assignment.filter({
        assigned_to_email: u.email
      }, "service_date");
      
      // Filter assignments for this month
      const monthAssignments = allAssignments.filter(a => {
        const assignmentDate = new Date(a.service_date);
        return assignmentDate >= startOfMonth && assignmentDate <= endOfMonth;
      });
      
      setAssignments(monthAssignments);
    } catch (error) {
      console.error("Error loading data:", error);
    }
    setLoading(false);
  };

  useEffect(() => { 
    loadData();
  }, []);

  useEffect(() => {
    if (!user) return;
    
    const unsub = base44.entities.Assignment.subscribe((event) => {
      if (event.data?.assigned_to_email === user.email || 
          event.old_data?.assigned_to_email === user.email) {
        loadData();
      }
    });
    
    return unsub;
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-[#d4a843] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-3 py-4 lg:px-4 lg:py-6 lg:ml-60 space-y-4">
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
            <AssignmentCard key={assignment.id} assignment={assignment} onUpdate={loadData} />
          ))
        )}
      </div>

      <EmergencyButton />
      <StatusBar />
      <SOPQuickAccess />
      <QuickActionGrid />
    </div>
  );
}