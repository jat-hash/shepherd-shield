import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Baby, LogIn, Users, Bell, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { canBroadcastNotifications } from "@/lib/leadership";

export default function NurseryMonitorWidget({ user }) {
  const [stats, setStats] = useState({ in: 0, total: 0, pending: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !canBroadcastNotifications(user)) return;
    const todayStr = new Date().toISOString().slice(0, 10);

    const load = async () => {
      setLoading(true);
      try {
        const [children, requests] = await Promise.all([
          base44.entities.NurseryChild.filter({ service_date: todayStr }, "-check_in_time", 200),
          base44.entities.NurseryRequest.filter({ service_date: todayStr, status: "Pending" }, "-created_date", 50),
        ]);
        setStats({
          in: (children || []).filter(c => c.checked_in).length,
          total: (children || []).length,
          pending: (requests || []).length,
        });
      } catch {}
      setLoading(false);
    };

    load();
    const unsub1 = base44.entities.NurseryChild.subscribe(() => load());
    const unsub2 = base44.entities.NurseryRequest.subscribe(() => load());
    return () => { unsub1(); unsub2(); };
  }, [user]);

  if (!user || !canBroadcastNotifications(user)) return null;

  return (
    <Link to="/NurseryMonitor" className="block">
      <div className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.15)] p-4 hover:border-[#d4a843]/40 transition-colors">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Baby className="w-4 h-4 text-[#d4a843]" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wide">Nursery Monitor</h3>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500" />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-green-900/30 rounded-lg border border-green-500/20 p-2.5 text-center">
            <p className="text-2xl font-bold text-green-400">{loading ? "…" : stats.in}</p>
            <p className="text-[10px] text-slate-400 flex items-center justify-center gap-0.5 mt-0.5">
              <LogIn className="w-2.5 h-2.5" /> Checked In
            </p>
          </div>
          <div className="bg-[#0a1128]/50 rounded-lg border border-slate-700/30 p-2.5 text-center">
            <p className="text-2xl font-bold text-[#d4a843]">{loading ? "…" : stats.total}</p>
            <p className="text-[10px] text-slate-400 flex items-center justify-center gap-0.5 mt-0.5">
              <Users className="w-2.5 h-2.5" /> Total Today
            </p>
          </div>
          <div className={`rounded-lg border p-2.5 text-center ${stats.pending > 0 ? "bg-orange-900/40 border-orange-500/40 animate-pulse" : "bg-[#0a1128]/50 border-slate-700/30"}`}>
            <p className={`text-2xl font-bold ${stats.pending > 0 ? "text-orange-400" : "text-slate-300"}`}>{loading ? "…" : stats.pending}</p>
            <p className="text-[10px] text-slate-400 flex items-center justify-center gap-0.5 mt-0.5">
              <Bell className="w-2.5 h-2.5" /> Help Requests
            </p>
          </div>
        </div>

        {stats.pending > 0 && (
          <p className="text-xs text-orange-400 mt-2 text-center">
            {stats.pending} pending help {stats.pending === 1 ? "request" : "requests"} — tap to view
          </p>
        )}
      </div>
    </Link>
  );
}