import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Baby, LogIn, LogOut, RefreshCw, Users, Clock, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export default function NurseryMonitor() {
  const [stats, setStats] = useState({ in: 0, out: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10));

  const loadRecords = async () => {
    setLoading(true);
    try {
      const query = filterDate ? { service_date: filterDate } : {};
      const data = await base44.entities.NurseryChild.filter(query, "-check_in_time", 200);
      setStats({
        in: data.filter(r => r.checked_in).length,
        out: data.filter(r => !r.checked_in).length,
        total: data.length,
      });
    } catch {
      toast.error("Failed to load records");
    }
    setLoading(false);
  };

  useEffect(() => { loadRecords(); }, [filterDate]);

  useEffect(() => {
    const unsub = base44.entities.NurseryChild.subscribe(() => loadRecords());
    return unsub;
  }, [filterDate]);

  const isToday = filterDate === new Date().toISOString().slice(0, 10);
  const nurseryEmpty = isToday && !loading && stats.in === 0;

  return (
    <div className="min-h-screen bg-[#0a1128] text-white">
      {/* Header */}
      <header className="bg-[#141f3d] border-b border-[rgba(212,168,67,0.15)] px-4 py-4 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Baby className="w-6 h-6 text-[#d4a843]" />
            <div>
              <h1 className="font-bold text-white tracking-wide">Nursery Monitor</h1>
              <p className="text-[10px] text-slate-400">Check-In / Check-Out Counts</p>
            </div>
          </div>
          <button onClick={loadRecords} disabled={loading} className="text-slate-400 hover:text-[#d4a843] transition-colors p-2">
            <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-5 space-y-5">
        {/* Date picker */}
        <div className="flex items-center gap-2 bg-[#1a2744] border border-slate-700 rounded-xl px-3 py-2.5 max-w-xs">
          <Clock className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="date"
            value={filterDate}
            onChange={e => setFilterDate(e.target.value)}
            className="bg-transparent text-white text-sm outline-none w-full"
          />
        </div>

        {/* Empty alert */}
        {nurseryEmpty && (
          <div className="bg-orange-900/30 border border-orange-500/40 rounded-xl p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-orange-400 shrink-0" />
            <div>
              <p className="text-orange-300 font-bold text-sm">Nursery is empty</p>
              <p className="text-slate-400 text-xs mt-0.5">No children currently checked in. Ryan, Pacheco, and James Winters have been alerted.</p>
            </div>
          </div>
        )}

        {/* Stats — counts only, no names */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-4 text-center">
            <p className="text-3xl font-bold text-[#d4a843]">{stats.total}</p>
            <p className="text-xs text-slate-400 mt-1 flex items-center justify-center gap-1"><Users className="w-3.5 h-3.5" /> Total Today</p>
          </div>
          <div className="bg-green-900/30 rounded-xl border border-green-500/30 p-4 text-center">
            <p className="text-3xl font-bold text-green-400">{stats.in}</p>
            <p className="text-xs text-slate-400 mt-1 flex items-center justify-center gap-1"><LogIn className="w-3.5 h-3.5" /> Currently In</p>
          </div>
          <div className="bg-slate-800/50 rounded-xl border border-slate-600/30 p-4 text-center">
            <p className="text-3xl font-bold text-slate-300">{stats.out}</p>
            <p className="text-xs text-slate-400 mt-1 flex items-center justify-center gap-1"><LogOut className="w-3.5 h-3.5" /> Checked Out</p>
          </div>
        </div>

        {loading && <div className="text-center py-8 text-slate-400 text-sm">Loading counts...</div>}

        <p className="text-xs text-slate-500 text-center">
          For privacy, only counts are shown — no child names or details.
        </p>
      </div>
    </div>
  );
}