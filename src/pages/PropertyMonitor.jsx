import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useNavigate } from "react-router-dom";
import { canAccessPropertyMonitor } from "@/lib/leadership";
import { ShieldCheck, ShieldAlert, FileText, Lock, Filter, MapPin, ChevronUp, ChevronDown, GripVertical } from "lucide-react";
import { DEFAULT_LOCATIONS } from "@/components/property/PropertySecurityCheckForm";

const fmtTime = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
    });
  } catch { return iso; }
};

export default function PropertyMonitor() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [checks, setChecks] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // all | unsecured | secure
  const [locFilter, setLocFilter] = useState("all");
  const [reorderOpen, setReorderOpen] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [cycleAt, setCycleAt] = useState(null);
  const [reportMonth, setReportMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const loadPosts = async () => {
    try {
      const recs = await base44.entities.PropertyPost.filter({ is_active: true }, "order", 200);
      recs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setPosts(recs);
    } catch {}
  };

  const load = async () => {
    try {
      const allChecks = await base44.entities.PropertySecurityCheck.list("-checked_at", 1000);
      setChecks(allChecks);
      const incIds = [...new Set(allChecks.map(c => c.incident_id).filter(Boolean))];
      // Also pull all Unsecured Property category incidents for a full history.
      const propIncidents = await base44.entities.Incident.filter({ category: "Unsecured Property" }, "-created_date", 500);
      const incMap = {};
      for (const id of [...new Set([...incIds, ...propIncidents.map(i => i.id)])]) {
        if (incMap[id]) continue;
        try { incMap[id] = await base44.entities.Incident.get(id); } catch {}
      }
      setIncidents(Object.values(incMap));
    } catch {}
    setLoading(false);
  };

  const loadCycle = async () => {
    try {
      const recs = await base44.entities.PropertySecurityCycle.list("-last_reset_at", 1);
      setCycleAt(recs.length > 0 ? recs[0].last_reset_at : null);
    } catch {}
  };

  useEffect(() => {
    loadPosts();
    load();
    loadCycle();
    const unsub = base44.entities.PropertySecurityCheck.subscribe(() => load());
    const unsubInc = base44.entities.Incident.subscribe(() => load());
    const unsubCycle = base44.entities.PropertySecurityCycle.subscribe(() => loadCycle());
    return () => { unsub && unsub(); unsubInc && unsubInc(); unsubCycle && unsubCycle(); };
  }, []);

  const rosterNames = posts.map(p => p.name);
  const locationNames = useMemo(() => {
    const set = new Set([...rosterNames, ...checks.map(c => c.location_name)]);
    return [...set].sort();
  }, [rosterNames, checks]);

  const movePost = async (idx, dir) => {
    const target = idx + dir;
    if (target < 0 || target >= posts.length) return;
    const next = [...posts];
    [next[idx], next[target]] = [next[target], next[idx]];
    next.forEach((p, i) => (p.order = i));
    setPosts(next);
    setReordering(true);
    try {
      await base44.entities.PropertyPost.bulkUpdate(
        next.map(p => ({ id: p.id, order: p.order }))
      );
      await loadPosts();
    } catch {
      await loadPosts();
    } finally {
      setReordering(false);
    }
  };

  const filtered = useMemo(() => {
    return checks.filter(c => {
      if (filter === "unsecured" && c.status !== "Unsecured") return false;
      if (filter === "secure" && c.status !== "Secure") return false;
      if (locFilter !== "all" && c.location_name !== locFilter) return false;
      return true;
    });
  }, [checks, filter, locFilter]);

  const incidentById = useMemo(() => {
    const m = {};
    for (const i of incidents) m[i.id] = i;
    return m;
  }, [incidents]);

  const stats = useMemo(() => {
    const total = checks.length;
    const secured = checks.filter(c => c.status === "Secure").length;
    const unsecured = checks.filter(c => c.status === "Unsecured").length;
    const openIncidents = incidents.filter(i => i.status === "Open" || i.status === "Under Review").length;
    return { total, secured, unsecured, openIncidents };
  }, [checks, incidents]);

  const monthlyUnsecured = useMemo(() => {
    const map = {};
    for (const c of checks) {
      if (c.status !== "Unsecured") continue;
      const d = new Date(c.checked_at);
      if (d.getFullYear() === reportMonth.year && d.getMonth() === reportMonth.month) {
        map[c.location_name] = (map[c.location_name] || 0) + 1;
      }
    }
    return map;
  }, [checks, reportMonth]);

  const shiftMonth = (delta) => {
    setReportMonth(prev => {
      const d = new Date(prev.year, prev.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };
  const monthLabel = new Date(reportMonth.year, reportMonth.month, 1)
    .toLocaleString("en-US", { month: "long", year: "numeric" });

  if (user && !canAccessPropertyMonitor(user)) {
    navigate("/", { replace: true });
    return null;
  }

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Lock className="w-6 h-6 text-[#d4a843]" />
          <h1 className="text-white font-bold text-xl">Property Monitor</h1>
        </div>
        <button
          onClick={() => setReorderOpen(o => !o)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border bg-[#0a1128] border-slate-700 text-slate-300 hover:border-[#d4a843]/60 hover:text-[#d4a843] transition-colors"
        >
          <GripVertical className="w-3.5 h-3.5" />
          {reorderOpen ? "Done" : "Reorder"}
        </button>
      </div>

      {cycleAt && (
        <p className="text-xs text-slate-500">
          Last cycle reset {fmtTime(cycleAt)} · statuses reset automatically after each service
        </p>
      )}

      {/* Reorder panel */}
      {reorderOpen && (
        <div className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.15)] p-3 space-y-2">
          <p className="text-xs text-slate-400 uppercase tracking-wide">Location order</p>
          {posts.length === 0 ? (
            <p className="text-slate-500 text-sm py-3 text-center">No managed locations.</p>
          ) : (
            posts.map((p, i) => (
              <div
                key={p.id}
                className="flex items-center gap-2 bg-[#0a1128] border border-slate-700 rounded-lg px-3 py-2"
              >
                <GripVertical className="w-4 h-4 text-slate-500" />
                <span className="flex-1 text-white text-sm font-medium truncate">{p.name}</span>
                <button
                  disabled={reordering || i === 0}
                  onClick={() => movePost(i, -1)}
                  className="p-1.5 rounded-lg text-slate-300 hover:text-[#d4a843] hover:bg-white/5 disabled:opacity-30 transition-colors"
                  title="Move up"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  disabled={reordering || i === posts.length - 1}
                  onClick={() => movePost(i, 1)}
                  className="p-1.5 rounded-lg text-slate-300 hover:text-[#d4a843] hover:bg-white/5 disabled:opacity-30 transition-colors"
                  title="Move down"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-3 text-center">
          <p className="text-2xl font-bold text-white">{stats.total}</p>
          <p className="text-xs text-slate-400 uppercase tracking-wide">Total Checks</p>
        </div>
        <div className="bg-[#1a2744] rounded-xl border border-green-500/20 p-3 text-center">
          <p className="text-2xl font-bold text-green-400">{stats.secured}</p>
          <p className="text-xs text-slate-400 uppercase tracking-wide">Secure</p>
        </div>
        <div className="bg-[#1a2744] rounded-xl border border-red-500/20 p-3 text-center">
          <p className="text-2xl font-bold text-red-400">{stats.unsecured}</p>
          <p className="text-xs text-slate-400 uppercase tracking-wide">Unsecured</p>
        </div>
        <div className="bg-[#1a2744] rounded-xl border border-yellow-500/20 p-3 text-center">
          <p className="text-2xl font-bold text-yellow-400">{stats.openIncidents}</p>
          <p className="text-xs text-slate-400 uppercase tracking-wide">Open Incidents</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="w-4 h-4 text-slate-400" />
        <div className="flex gap-1.5">
          {[
            { id: "all", label: "All" },
            { id: "unsecured", label: "Unsecured" },
            { id: "secure", label: "Secure" },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                filter === f.id
                  ? "bg-[#d4a843]/15 border-[#d4a843]/60 text-[#d4a843]"
                  : "bg-[#0a1128] border-slate-700 text-slate-400 hover:border-slate-600"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <select
          value={locFilter}
          onChange={e => setLocFilter(e.target.value)}
          className="bg-[#0a1128] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-[#d4a843]/60"
        >
          <option value="all">All Locations</option>
          {locationNames.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      {/* Incident history timeline */}
      {loading ? (
        <div className="text-center py-12 text-slate-400 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-slate-400 py-8 text-sm">No checks match the current filters.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => {
            const inc = c.incident_id ? incidentById[c.incident_id] : null;
            const isUnsecured = c.status === "Unsecured";
            return (
              <div
                key={c.id}
                className={`bg-[#1a2744] rounded-xl border p-3 flex items-start gap-3 ${
                  isUnsecured ? "border-red-500/30" : "border-[rgba(212,168,67,0.1)]"
                }`}
              >
                {isUnsecured
                  ? <ShieldAlert className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                  : <ShieldCheck className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-white font-semibold text-sm flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-500" />
                      {c.location_name}
                    </p>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      isUnsecured ? "bg-red-500/15 text-red-300" : "bg-green-500/15 text-green-300"
                    }`}>
                      {c.status}
                    </span>
                  </div>

                  {c.unsecured_reasons?.length > 0 && (
                    <p className="text-red-300/80 text-xs mt-1">⚠ {c.unsecured_reasons.join(", ")}</p>
                  )}
                  {c.notes && <p className="text-slate-400 text-xs mt-1">{c.notes}</p>}

                  {inc && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-[#d4a843] bg-[#d4a843]/5 border border-[#d4a843]/20 rounded-lg px-2 py-1.5">
                      <FileText className="w-3.5 h-3.5" />
                      <span className="truncate flex-1">{inc.title}</span>
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                        inc.status === "Open" ? "bg-red-500/20 text-red-300"
                          : inc.status === "Resolved" || inc.status === "Closed" ? "bg-green-500/20 text-green-300"
                          : "bg-yellow-500/20 text-yellow-300"
                      }`}>
                        {inc.status}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-500 flex-wrap">
                    <span>{c.checked_by || "—"}</span>
                    <span>·</span>
                    <span>{fmtTime(c.checked_at)}</span>
                    {c.checked_by_email && (
                      <>
                        <span>·</span>
                        <span className="truncate">{c.checked_by_email}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Monthly unsecured report */}
      <div className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-3">
        <div className="flex items-center justify-between mb-2 gap-2">
          <h3 className="text-white font-semibold text-sm flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-red-400" />
            Monthly Unsecured Report
          </h3>
          <div className="flex items-center gap-1">
            <button
              onClick={() => shiftMonth(-1)}
              className="px-2 py-1 rounded-lg text-xs bg-[#0a1128] border border-slate-700 text-slate-300 hover:border-[#d4a843]/60 transition-colors"
            >
              ‹
            </button>
            <span className="text-xs text-slate-300 min-w-[120px] text-center">{monthLabel}</span>
            <button
              onClick={() => shiftMonth(1)}
              className="px-2 py-1 rounded-lg text-xs bg-[#0a1128] border border-slate-700 text-slate-300 hover:border-[#d4a843]/60 transition-colors"
            >
              ›
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {locationNames.map(loc => {
            const count = monthlyUnsecured[loc] || 0;
            return (
              <div key={loc} className="bg-[#0a1128] border border-slate-700 rounded-lg px-3 py-2 flex items-center justify-between">
                <span className="text-slate-300 text-xs truncate">{loc}</span>
                <span className={`text-sm font-bold ml-2 ${count > 0 ? "text-red-400" : "text-slate-500"}`}>{count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}