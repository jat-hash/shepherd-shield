import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import AssignmentCard from "@/components/dashboard/AssignmentCard";
import EmergencyButton from "@/components/dashboard/EmergencyButton";
import StatusBar from "@/components/dashboard/StatusBar";
import QuickActionGrid from "@/components/dashboard/QuickActionGrid";
import SOPQuickAccess from "@/components/dashboard/SOPQuickAccess";

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [nextAssignment, setNextAssignment] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    const u = await base44.auth.me();
    setUser(u);
    const today = new Date().toISOString().split("T")[0];
    const allAssignments = await base44.entities.Assignment.filter({
      assigned_to_email: u.email
    }, "service_date");
    const upcoming = allAssignments.filter(a => a.service_date >= today);
    setNextAssignment(upcoming?.[0] || null);
    setLoading(false);
  };

  useEffect(() => { 
    loadData(); 
    
    const unsub = base44.entities.Assignment.subscribe((event) => {
      loadData();
    });
    
    return unsub;
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-[#d4a843] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 lg:ml-60 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">
          Welcome back, <span className="text-[#d4a843]">{user?.full_name?.split(" ")[0] || "Officer"}</span>
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
        </p>
      </div>

      <AssignmentCard assignment={nextAssignment} onUpdate={loadData} />
      <EmergencyButton />
      <StatusBar />
      <SOPQuickAccess />
      <QuickActionGrid />
    </div>
  );
}