import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Baby, LogIn, LogOut, Search, RefreshCw, Users, Clock, AlertCircle, X, Filter } from "lucide-react";
import { toast } from "sonner";

const AGE_COLORS = {
  "Infant (0-12m)": "bg-pink-900/40 border-pink-500/30 text-pink-300",
  "Toddler (1-2y)": "bg-blue-900/40 border-blue-500/30 text-blue-300",
  "Pre-K (3-4y)": "bg-purple-900/40 border-purple-500/30 text-purple-300",
  "Kindergarten (5y)": "bg-green-900/40 border-green-500/30 text-green-300",
};

export default function NurseryMonitor() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all"); // all | in | out
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10));
  const [stats, setStats] = useState({ in: 0, out: 0, total: 0 });

  const loadRecords = async () => {
    setLoading(true);
    try {
      const query = filterDate ? { service_date: filterDate } : {};
      const data = await base44.entities.NurseryChild.filter(query, "-check_in_time", 200);
      setRecords(data);
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

  const handleManualCheckOut = async (child) => {
    await base44.entities.NurseryChild.update(child.id, {
      checked_in: false,
      check_out_time: new Date().toISOString(),
    });
    toast.success(`${child.child_name} manually checked out`);
  };

  const filtered = records.filter(r => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      r.child_name?.toLowerCase().includes(q) ||
      r.parent_name?.toLowerCase().includes(q) ||
      r.parent_phone?.toLowerCase().includes(q) ||
      r.check_in_code?.toLowerCase().includes(q);
    const matchStatus = filterStatus === "all" ||
      (filterStatus === "in" && r.checked_in) ||
      (filterStatus === "out" && !r.checked_in);
    return matchSearch && matchStatus;
  });

  const fmt = (dt) => dt ? new Date(dt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";
  const fmtDuration = (checkIn, checkOut) => {
    if (!checkIn) return "—";
    const end = checkOut ? new Date(checkOut) : new Date();
    const mins = Math.floor((end - new Date(checkIn)) / 60000);
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  return (
    <div className="min-h-screen bg-[#0a1128] text-white">
      {/* Header */}
      <header className="bg-[#141f3d] border-b border-[rgba(212,168,67,0.15)] px-4 py-4 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Baby className="w-6 h-6 text-[#d4a843]" />
            <div>
              <h1 className="font-bold text-white tracking-wide">Nursery Monitor</h1>
              <p className="text-[10px] text-slate-400">Admin Check-In / Check-Out Tracker</p>
            </div>
          </div>
          <button onClick={loadRecords} disabled={loading} className="text-slate-400 hover:text-[#d4a843] transition-colors p-2">
            <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-5 space-y-5">

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-4 text-center">
            <p className="text-3xl font-bold text-[#d4a843]">{stats.total}</p>
            <p className="text-xs text-slate-400 mt-1 flex items-center justify-center gap-1"><Users className="w-3.5 h-3.5" /> Total Checked In</p>
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

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          {/* Date picker */}
          <div className="flex items-center gap-2 bg-[#1a2744] border border-slate-700 rounded-xl px-3 py-2.5 flex-1">
            <Clock className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="date"
              value={filterDate}
              onChange={e => setFilterDate(e.target.value)}
              className="bg-transparent text-white text-sm outline-none w-full"
            />
          </div>

          {/* Search */}
          <div className="relative flex-[2]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search child, parent, phone, or code..."
              className="w-full bg-[#1a2744] border border-slate-700 rounded-xl pl-9 pr-9 py-2.5 text-white text-sm outline-none focus:border-[#d4a843]/60 placeholder-slate-500"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Status filter */}
          <div className="flex gap-1 bg-[#1a2744] rounded-xl border border-slate-700 p-1">
            {[["all", "All"], ["in", "In"], ["out", "Out"]].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setFilterStatus(val)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filterStatus === val ? "bg-[#d4a843] text-[#0a1128]" : "text-slate-400 hover:text-white"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Results count */}
        <p className="text-xs text-slate-500">
          Showing {filtered.length} of {records.length} record{records.length !== 1 ? "s" : ""}
          {filterDate && ` for ${new Date(filterDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric" })}`}
        </p>

        {/* Table / Cards */}
        {loading ? (
          <div className="text-center py-12 text-slate-400 text-sm">Loading records...</div>
        ) : filtered.length === 0 ? (
          <div className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-10 text-center">
            <Baby className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="text-slate-400 text-sm">No records found</p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[rgba(212,168,67,0.1)] text-[10px] uppercase tracking-widest text-slate-400">
                    <th className="text-left px-4 py-3">Child</th>
                    <th className="text-left px-4 py-3">Parent</th>
                    <th className="text-left px-4 py-3">Age Group</th>
                    <th className="text-left px-4 py-3">Check In</th>
                    <th className="text-left px-4 py-3">Check Out</th>
                    <th className="text-left px-4 py-3">Duration</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3">Code</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((child, i) => (
                    <tr key={child.id} className={`border-b border-[rgba(212,168,67,0.05)] hover:bg-white/5 transition-colors ${i % 2 === 0 ? "" : "bg-white/[0.02]"}`}>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-white">{child.child_name}</div>
                        {child.allergies_notes && (
                          <div className="text-[10px] text-yellow-400 flex items-center gap-1 mt-0.5">
                            <AlertCircle className="w-2.5 h-2.5" /> Allergy note
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        <div>{child.parent_name}</div>
                        {child.parent_phone && <div className="text-xs text-slate-500">{child.parent_phone}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${AGE_COLORS[child.age_group] || "bg-slate-700 text-slate-300 border-slate-600"}`}>
                          {child.age_group || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-300 font-mono text-xs">{fmt(child.check_in_time)}</td>
                      <td className="px-4 py-3 text-slate-300 font-mono text-xs">{child.checked_in ? <span className="text-slate-500">—</span> : fmt(child.check_out_time)}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{fmtDuration(child.check_in_time, child.check_out_time)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${child.checked_in ? "bg-green-800 text-green-300" : "bg-slate-700 text-slate-400"}`}>
                          {child.checked_in ? "In" : "Out"}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-400">{child.check_in_code}</td>
                      <td className="px-4 py-3">
                        {child.checked_in && (
                          <button
                            onClick={() => handleManualCheckOut(child)}
                            className="text-[10px] bg-slate-700 hover:bg-red-700 text-white px-2.5 py-1 rounded-lg transition-colors font-medium"
                          >
                            Check Out
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-2">
              {filtered.map(child => (
                <div key={child.id} className={`rounded-xl border px-4 py-3 ${child.checked_in ? "bg-green-900/20 border-green-500/20" : "bg-[#1a2744] border-[rgba(212,168,67,0.08)]"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-white">{child.child_name}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${child.checked_in ? "bg-green-800 text-green-300" : "bg-slate-700 text-slate-400"}`}>
                          {child.checked_in ? "In" : "Out"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">Parent: {child.parent_name}{child.parent_phone ? ` · ${child.parent_phone}` : ""}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{child.age_group}</p>
                      <div className="flex gap-3 mt-1.5 text-xs">
                        <span className="text-slate-400">In: <span className="text-white font-mono">{fmt(child.check_in_time)}</span></span>
                        {!child.checked_in && <span className="text-slate-400">Out: <span className="text-white font-mono">{fmt(child.check_out_time)}</span></span>}
                        <span className="text-slate-400">Duration: <span className="text-white">{fmtDuration(child.check_in_time, child.check_out_time)}</span></span>
                      </div>
                      {child.allergies_notes && (
                        <p className="text-[10px] text-yellow-300 mt-1">⚠ {child.allergies_notes}</p>
                      )}
                    </div>
                    {child.checked_in && (
                      <button
                        onClick={() => handleManualCheckOut(child)}
                        className="text-xs bg-red-700 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg flex-shrink-0 transition-colors"
                      >
                        Check Out
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}