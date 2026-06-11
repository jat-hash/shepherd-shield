import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Baby, LogIn, LogOut, Bell, CheckCircle, Clock, AlertCircle, RefreshCw, Users } from "lucide-react";
import NotificationBell from "@/components/notifications/NotificationBell";
import ChildCheckInForm from "@/components/nursery/ChildCheckInForm";
import CheckOutByCode from "@/components/nursery/CheckOutByCode";
import ParentRequestForm from "@/components/nursery/ParentRequestForm";
import NurseryChat from "@/components/nursery/NurseryChat";
import { toast } from "sonner";

const AGE_COLORS = {
  "Infant (0-12m)": "bg-pink-900/40 border-pink-500/30 text-pink-300",
  "Toddler (1-2y)": "bg-blue-900/40 border-blue-500/30 text-blue-300",
  "Pre-K (3-4y)": "bg-purple-900/40 border-purple-500/30 text-purple-300",
  "Kindergarten (5y)": "bg-green-900/40 border-green-500/30 text-green-300",
};

export default function NurseryDashboard() {
  const { user: authUser } = useAuth();
  const [user, setUser] = useState(null);
  const [children, setChildren] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [showCheckOut, setShowCheckOut] = useState(false);
  const [showRequest, setShowRequest] = useState(false);
  const [staffCheckedIn, setStaffCheckedIn] = useState(false);
  const todayStr = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (authUser) setUser(authUser);
    else base44.auth.me().then(setUser).catch(() => {});
  }, [authUser]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [kids, reqs] = await Promise.all([
        base44.entities.NurseryChild.filter({ service_date: todayStr, checked_in: true }, "-check_in_time", 100),
        base44.entities.NurseryRequest.filter({ service_date: todayStr }, "-created_date", 20),
      ]);
      setChildren(kids);
      setRequests(reqs);
    } catch { }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  // Real-time updates
  useEffect(() => {
    const unsub1 = base44.entities.NurseryChild.subscribe(() => loadData());
    const unsub2 = base44.entities.NurseryRequest.subscribe(() => loadData());
    return () => { unsub1(); unsub2(); };
  }, []);

  const resolveRequest = async (req) => {
    await base44.entities.NurseryRequest.update(req.id, { status: "Resolved" });
    toast.success("Request resolved");
  };

  const pendingRequests = requests.filter(r => r.status === "Pending");

  return (
    <div className="min-h-screen bg-[#0a1128]">
      {/* Header */}
      <header className="bg-[#141f3d] border-b border-[rgba(212,168,67,0.15)] px-4 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <Baby className="w-6 h-6 text-[#d4a843]" />
          <span className="font-bold text-white tracking-wider">Nursery</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={loadData} disabled={loading} className="text-slate-400 hover:text-[#d4a843] transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <NotificationBell userEmail={user?.email} />
          <div className="w-8 h-8 rounded-full bg-[#d4a843] flex items-center justify-center text-[#0a1128] font-bold text-xs">
            {(user?.display_name || user?.full_name || "N").charAt(0).toUpperCase()}
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-3 py-4 space-y-4">
        {/* Staff check-in status */}
        <div className={`flex items-center justify-between rounded-xl border px-4 py-3 ${staffCheckedIn ? "bg-green-900/30 border-green-500/40" : "bg-[#1a2744] border-[rgba(212,168,67,0.1)]"}`}>
          <div className="flex items-center gap-2">
            {staffCheckedIn ? <CheckCircle className="w-5 h-5 text-green-400" /> : <Clock className="w-5 h-5 text-slate-400" />}
            <div>
              <p className="text-white text-sm font-semibold">{staffCheckedIn ? "You're checked in" : "Not checked in"}</p>
              <p className="text-xs text-slate-400">{staffCheckedIn ? `On duty since ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Tap to log your arrival"}</p>
            </div>
          </div>
          <button
            onClick={() => setStaffCheckedIn(v => !v)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${staffCheckedIn ? "bg-red-700 hover:bg-red-600 text-white" : "bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128]"}`}
          >
            {staffCheckedIn ? "Check Out" : "Check In"}
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-3 text-center">
            <p className="text-2xl font-bold text-[#d4a843]">{children.length}</p>
            <p className="text-xs text-slate-400 mt-0.5">Children In</p>
          </div>
          <div className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-3 text-center">
            <p className="text-2xl font-bold text-orange-400">{pendingRequests.length}</p>
            <p className="text-xs text-slate-400 mt-0.5">Pending Requests</p>
          </div>
          <div className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-3 text-center">
            <p className="text-2xl font-bold text-blue-400">{new Date().toLocaleDateString("en-US", { weekday: "short" })}</p>
            <p className="text-xs text-slate-400 mt-0.5">{new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => setShowCheckIn(true)}
            className="bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] rounded-xl py-4 font-bold text-sm flex flex-col items-center gap-1.5 transition-colors"
          >
            <LogIn className="w-5 h-5" />
            Check In Child
          </button>
          <button
            onClick={() => setShowCheckOut(true)}
            className="bg-slate-700 hover:bg-slate-600 text-white rounded-xl py-4 font-bold text-sm flex flex-col items-center gap-1.5 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            Check Out
          </button>
          <button
            onClick={() => setShowRequest(true)}
            className="bg-orange-700 hover:bg-orange-600 text-white rounded-xl py-4 font-bold text-sm flex flex-col items-center gap-1.5 transition-colors"
          >
            <Bell className="w-5 h-5" />
            Request Help
          </button>
        </div>

        {/* Pending Requests */}
        {pendingRequests.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-xs uppercase tracking-widest text-orange-400 font-semibold flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5" /> Pending Requests
            </h2>
            {pendingRequests.map(req => (
              <div key={req.id} className="bg-orange-900/30 border border-orange-500/30 rounded-xl px-4 py-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-white font-semibold text-sm">{req.request_type} — {req.child_name}</p>
                  {req.message && <p className="text-orange-300 text-xs mt-0.5">{req.message}</p>}
                  <p className="text-slate-400 text-xs mt-1">By {req.requested_by}</p>
                </div>
                <button
                  onClick={() => resolveRequest(req)}
                  className="bg-green-700 hover:bg-green-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex-shrink-0"
                >
                  Resolve
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Children currently checked in */}
        <div className="space-y-2">
          <h2 className="text-xs uppercase tracking-widest text-[#d4a843] font-semibold flex items-center gap-2">
            <Users className="w-3.5 h-3.5" /> Children Checked In ({children.length})
          </h2>
          {children.length === 0 ? (
            <div className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-6 text-center text-slate-400 text-sm">
              No children checked in yet today
            </div>
          ) : (
            children.map(child => (
              <div key={child.id} className={`rounded-xl border px-4 py-3 ${AGE_COLORS[child.age_group] || "bg-[#1a2744] border-[rgba(212,168,67,0.1)]"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Baby className="w-4 h-4 shrink-0" />
                      <p className="font-bold text-white">{child.child_name}</p>
                      <span className="text-xs opacity-70 font-mono bg-black/30 px-1.5 py-0.5 rounded">#{child.check_in_code}</span>
                    </div>
                    <p className="text-xs mt-1 opacity-80">Parent: {child.parent_name}{child.parent_phone ? ` · ${child.parent_phone}` : ""}</p>
                    <p className="text-xs opacity-60 mt-0.5">{child.age_group} · In at {child.check_in_time ? new Date(child.check_in_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</p>
                    {child.allergies_notes && (
                      <p className="text-xs text-yellow-300 mt-1">⚠ {child.allergies_notes}</p>
                    )}
                  </div>
                  <button
                    onClick={async () => {
                      await base44.entities.NurseryChild.update(child.id, { checked_in: false, check_out_time: new Date().toISOString() });
                      toast.success(`${child.child_name} checked out`);
                    }}
                    className="text-xs bg-black/30 hover:bg-black/50 text-white px-2.5 py-1.5 rounded-lg flex-shrink-0 transition-colors"
                  >
                    Check Out
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Nursery Team Chat */}
        <NurseryChat user={user} />
      </div>

      {/* Modals */}
      {showCheckIn && (
        <ChildCheckInForm
          user={user}
          onClose={() => setShowCheckIn(false)}
          onCheckedIn={() => loadData()}
        />
      )}
      {showCheckOut && (
        <CheckOutByCode
          onClose={() => setShowCheckOut(false)}
          onCheckedOut={() => loadData()}
        />
      )}
      {showRequest && (
        <ParentRequestForm
          children={children}
          user={user}
          onClose={() => setShowRequest(false)}
        />
      )}
    </div>
  );
}