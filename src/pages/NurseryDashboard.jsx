import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import {
  Baby, LogIn, LogOut, Bell, CheckCircle, Clock,
  AlertCircle, RefreshCw, Users, MessageSquare, ShieldAlert, BookUser
} from "lucide-react";
import NotificationBell from "@/components/notifications/NotificationBell";
import ChildCheckInForm from "@/components/nursery/ChildCheckInForm";
import CheckOutByCode from "@/components/nursery/CheckOutByCode";
import ParentRequestForm from "@/components/nursery/ParentRequestForm";
import NurseryChat from "@/components/nursery/NurseryChat";
import NurseryDirectory from "@/components/nursery/NurseryDirectory";
import DailySummary from "@/components/nursery/DailySummary";
import { toast } from "sonner";

const AGE_COLORS = {
  "Infant (0-12m)": "bg-pink-900/40 border-pink-500/30 text-pink-300",
  "Toddler (1-2y)": "bg-blue-900/40 border-blue-500/30 text-blue-300",
  "Pre-K (3-4y)": "bg-purple-900/40 border-purple-500/30 text-purple-300",
  "Kindergarten (5y)": "bg-green-900/40 border-green-500/30 text-green-300",
};

const TABS = [
  { id: "children", label: "Children", icon: Baby },
  { id: "requests", label: "Requests", icon: Bell },
  { id: "directory", label: "Directory", icon: BookUser },
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "alerts", label: "Alerts", icon: ShieldAlert },
];

export default function NurseryDashboard() {
  const { user: authUser } = useAuth();
  const [user, setUser] = useState(null);
  const [children, setChildren] = useState([]);
  const [requests, setRequests] = useState([]);
  const [emergencyAlerts, setEmergencyAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [showCheckOut, setShowCheckOut] = useState(false);
  const [showRequest, setShowRequest] = useState(false);
  const [staffCheckedIn, setStaffCheckedIn] = useState(false);
  const [checkInRecord, setCheckInRecord] = useState(null);
  const [activeTab, setActiveTab] = useState("children");
  const todayStr = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (authUser) setUser(authUser);
    else base44.auth.me().then(setUser).catch(() => {});
  }, [authUser]);

  // Check if staff already clocked in today
  useEffect(() => {
    if (!user?.email) return;
    base44.entities.PersonalCheckIn.filter(
      { user_email: user.email, check_in_date: todayStr },
      "-created_date", 1
    ).then(records => {
      if (records.length > 0 && !records[0].check_out_time) {
        setStaffCheckedIn(true);
        setCheckInRecord(records[0]);
      }
    }).catch(() => {});
  }, [user]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [kids, reqs, alerts] = await Promise.all([
        base44.entities.NurseryChild.filter({ service_date: todayStr, checked_in: true }, "-check_in_time", 100),
        base44.entities.NurseryRequest.filter({ service_date: todayStr }, "-created_date", 20),
        base44.entities.EmergencyAlert.filter({ is_active: true }),
      ]);
      setChildren(kids);
      setRequests(reqs);
      setEmergencyAlerts(alerts);
    } catch { }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    const unsub1 = base44.entities.NurseryChild.subscribe(() => loadData());
    const unsub2 = base44.entities.NurseryRequest.subscribe(() => loadData());
    const unsub3 = base44.entities.EmergencyAlert.subscribe(() => loadData());
    return () => { unsub1(); unsub2(); unsub3(); };
  }, []);

  const handleStaffCheckIn = async () => {
    if (!user) return;
    if (staffCheckedIn) {
      if (checkInRecord) {
        await base44.entities.PersonalCheckIn.update(checkInRecord.id, {
          check_out_time: new Date().toISOString()
        });
      }
      setStaffCheckedIn(false);
      setCheckInRecord(null);
      toast.success("Checked out — have a great day!");
    } else {
      const record = await base44.entities.PersonalCheckIn.create({
        user_email: user.email,
        user_name: user.display_name || user.full_name || user.email,
        check_in_date: todayStr,
        check_in_time: new Date().toISOString(),
      });
      setStaffCheckedIn(true);
      setCheckInRecord(record);
      toast.success("Checked in — welcome to nursery duty!");
    }
  };

  const resolveRequest = async (req) => {
    await base44.entities.NurseryRequest.update(req.id, { status: "Resolved" });
    toast.success("Request resolved");
  };

  const pendingRequests = requests.filter(r => r.status === "Pending");
  const hasAlerts = emergencyAlerts.length > 0;

  return (
    <div className="min-h-screen bg-[#0a1128] flex flex-col">

      {/* Active Emergency Banner */}
      {hasAlerts && (
        <div className="bg-red-600 animate-pulse text-white py-2.5 px-3 text-sm font-bold tracking-wider text-center z-50">
          🚨 SECURITY ALERT: {emergencyAlerts[0]?.alert_type?.toUpperCase()} — {emergencyAlerts[0]?.message}
        </div>
      )}

      {/* Header */}
      <header className="bg-[#141f3d] border-b border-[rgba(212,168,67,0.15)] px-4 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <Baby className="w-6 h-6 text-[#d4a843]" />
          <div>
            <span className="font-bold text-white tracking-wider text-sm">Nursery Dashboard</span>
            <p className="text-[10px] text-slate-400">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
          </div>
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

      <div className="max-w-2xl mx-auto w-full px-3 py-4 space-y-4 flex-1 flex flex-col">

        {/* Staff Check-In Bar */}
        <div className={`flex items-center justify-between rounded-xl border px-4 py-3 ${staffCheckedIn ? "bg-green-900/30 border-green-500/40" : "bg-[#1a2744] border-[rgba(212,168,67,0.1)]"}`}>
          <div className="flex items-center gap-2">
            {staffCheckedIn ? <CheckCircle className="w-5 h-5 text-green-400" /> : <Clock className="w-5 h-5 text-slate-400" />}
            <div>
              <p className="text-white text-sm font-semibold">{staffCheckedIn ? "On Duty" : "Not Checked In"}</p>
              <p className="text-xs text-slate-400">{staffCheckedIn ? `Signed in at ${checkInRecord?.check_in_time ? new Date(checkInRecord.check_in_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}` : "Tap to log your arrival"}</p>
            </div>
          </div>
          <button
            onClick={handleStaffCheckIn}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${staffCheckedIn ? "bg-red-700 hover:bg-red-600 text-white" : "bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128]"}`}
          >
            {staffCheckedIn ? "Check Out" : "Check In"}
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-3 text-center">
            <p className="text-2xl font-bold text-[#d4a843]">{children.length}</p>
            <p className="text-xs text-slate-400 mt-0.5">Children In</p>
          </div>
          <div className={`rounded-xl border p-3 text-center ${pendingRequests.length > 0 ? "bg-orange-900/30 border-orange-500/40" : "bg-[#1a2744] border-[rgba(212,168,67,0.1)]"}`}>
            <p className="text-2xl font-bold text-orange-400">{pendingRequests.length}</p>
            <p className="text-xs text-slate-400 mt-0.5">Pending Requests</p>
          </div>
          <div className={`rounded-xl border p-3 text-center ${hasAlerts ? "bg-red-900/30 border-red-500/40" : "bg-[#1a2744] border-[rgba(212,168,67,0.1)]"}`}>
            <p className={`text-2xl font-bold ${hasAlerts ? "text-red-400" : "text-green-400"}`}>{hasAlerts ? emergencyAlerts.length : "✓"}</p>
            <p className="text-xs text-slate-400 mt-0.5">{hasAlerts ? "Active Alerts" : "All Clear"}</p>
          </div>
        </div>

        {/* Quick Action Buttons */}
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => setShowCheckIn(true)}
            className="bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] rounded-xl py-4 font-bold text-sm flex flex-col items-center gap-1.5 transition-colors"
          >
            <LogIn className="w-5 h-5" />
            Check In
          </button>
          <button
            onClick={() => setShowCheckOut(true)}
            className="bg-slate-700 hover:bg-slate-600 text-white rounded-xl py-4 font-bold text-sm flex flex-col items-center gap-1.5 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            Check Out
          </button>
          <button
            onClick={() => { setShowRequest(true); }}
            className={`rounded-xl py-4 font-bold text-sm flex flex-col items-center gap-1.5 transition-colors relative ${pendingRequests.length > 0 ? "bg-orange-600 hover:bg-orange-500 text-white" : "bg-orange-700 hover:bg-orange-600 text-white"}`}
          >
            <Bell className="w-5 h-5" />
            Request Help
            {pendingRequests.length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {pendingRequests.length}
              </span>
            )}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex bg-[#141f3d] rounded-xl border border-[rgba(212,168,67,0.1)] p-1 gap-1">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const badge = tab.id === "requests" ? pendingRequests.length
              : tab.id === "alerts" ? emergencyAlerts.length : 0;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all relative ${
                  activeTab === tab.id
                    ? "bg-[#d4a843] text-[#0a1128]"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{tab.label}</span>
                {badge > 0 && (
                  <span className={`absolute -top-1 -right-1 w-4 h-4 text-white text-[9px] font-bold rounded-full flex items-center justify-center ${tab.id === "alerts" ? "bg-red-500" : "bg-orange-500"}`}>
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="flex-1">

          {/* CHILDREN TAB */}
          {activeTab === "children" && (
            <div className="space-y-3">
              <DailySummary />
              <h2 className="text-xs uppercase tracking-widest text-[#d4a843] font-semibold flex items-center gap-2 pt-1">
                <Users className="w-3.5 h-3.5" /> Children Checked In ({children.length})
              </h2>
              {children.length === 0 ? (
                <div className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-8 text-center text-slate-400 text-sm">
                  <Baby className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No children checked in yet today
                </div>
              ) : (
                children.map(child => (
                  <div key={child.id} className={`rounded-xl border px-4 py-3 ${AGE_COLORS[child.age_group] || "bg-[#1a2744] border-[rgba(212,168,67,0.1)]"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Baby className="w-4 h-4 shrink-0" />
                          <p className="font-bold text-white">{child.child_name?.trim() || `Child of ${child.parent_name}`}</p>
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
                          toast.success(`${child.child_name?.trim() || `Child of ${child.parent_name}`} checked out`);
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
          )}

          {/* REQUESTS TAB */}
          {activeTab === "requests" && (
            <div className="space-y-2">
              <h2 className="text-xs uppercase tracking-widest text-orange-400 font-semibold flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5" /> Parent Requests
              </h2>
              {requests.length === 0 ? (
                <div className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-8 text-center text-slate-400 text-sm">
                  <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No requests today
                </div>
              ) : (
                requests.map(req => (
                  <div key={req.id} className={`rounded-xl border px-4 py-3 flex items-start justify-between gap-3 ${req.status === "Resolved" ? "bg-[#1a2744] border-[rgba(212,168,67,0.05)] opacity-50" : "bg-orange-900/30 border-orange-500/30"}`}>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-white font-semibold text-sm">{req.request_type}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${req.status === "Resolved" ? "bg-green-800 text-green-300" : req.status === "Acknowledged" ? "bg-blue-800 text-blue-300" : "bg-orange-800 text-orange-300"}`}>
                          {req.status}
                        </span>
                      </div>
                      <p className="text-slate-300 text-sm">{req.child_name}</p>
                      {req.message && <p className="text-orange-300 text-xs mt-0.5">{req.message}</p>}
                      <p className="text-slate-400 text-xs mt-1">By {req.requested_by} · {new Date(req.created_date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                    {req.status === "Pending" && (
                      <button
                        onClick={() => resolveRequest(req)}
                        className="bg-green-700 hover:bg-green-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex-shrink-0"
                      >
                        Resolve
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* DIRECTORY TAB */}
          {activeTab === "directory" && (
            <NurseryDirectory />
          )}

          {/* CHAT TAB */}
          {activeTab === "chat" && (
            <NurseryChat user={user} />
          )}

          {/* ALERTS TAB */}
          {activeTab === "alerts" && (
            <div className="space-y-2">
              <h2 className="text-xs uppercase tracking-widest text-red-400 font-semibold flex items-center gap-2">
                <ShieldAlert className="w-3.5 h-3.5" /> Security Alerts
              </h2>
              {emergencyAlerts.length === 0 ? (
                <div className="bg-green-900/20 rounded-xl border border-green-500/20 p-8 text-center">
                  <CheckCircle className="w-10 h-10 mx-auto mb-3 text-green-400" />
                  <p className="text-green-300 font-semibold">All Clear</p>
                  <p className="text-slate-400 text-xs mt-1">No active security alerts</p>
                </div>
              ) : (
                emergencyAlerts.map(alert => (
                  <div key={alert.id} className="bg-red-900/40 border border-red-500/40 rounded-xl px-4 py-4">
                    <div className="flex items-start gap-3">
                      <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-red-300 font-bold text-sm uppercase tracking-wide">{alert.alert_type}</p>
                        <p className="text-white text-sm mt-1">{alert.message}</p>
                        <p className="text-slate-400 text-xs mt-2">Triggered by {alert.triggered_by} · {new Date(alert.created_date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                        <p className="text-yellow-300 text-xs mt-2 font-semibold">⚠ Stay with the children and await further instructions from security</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-4 text-xs text-slate-400 space-y-1">
                <p className="text-[#d4a843] font-semibold text-sm mb-2">Emergency Guidelines</p>
                <p>🔒 Lock nursery doors if instructed</p>
                <p>📍 Keep all children in your care</p>
                <p>📵 Do not open doors to unknown people</p>
                <p>📞 Contact security before releasing any child</p>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Modals */}
      {showCheckIn && (
        <ChildCheckInForm user={user} onClose={() => setShowCheckIn(false)} onCheckedIn={() => loadData()} />
      )}
      {showCheckOut && (
        <CheckOutByCode onClose={() => setShowCheckOut(false)} onCheckedOut={() => loadData()} />
      )}
      {showRequest && (
        <ParentRequestForm children={children} user={user} onClose={() => setShowRequest(false)} />
      )}
    </div>
  );
}