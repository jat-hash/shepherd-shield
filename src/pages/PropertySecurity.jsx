import { useState, useEffect, useMemo, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { ShieldCheck, ShieldAlert, Plus, History, Lock, FileText, Settings } from "lucide-react";
import PropertySecurityCheckForm, { DEFAULT_LOCATIONS } from "@/components/property/PropertySecurityCheckForm";
import PropertyManager from "@/components/property/PropertyManager";

export default function PropertySecurity() {
  const { user } = useAuth();
  const [checks, setChecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [formLocation, setFormLocation] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [incidents, setIncidents] = useState({});
  const [fallbackUser, setFallbackUser] = useState(null);
  const [posts, setPosts] = useState([]);
  const [managerOpen, setManagerOpen] = useState(false);
  const seedingRef = useRef(false);
  const currentUser = user || fallbackUser;

  useEffect(() => {
    if (!user) {
      base44.auth.me().then(setFallbackUser).catch(() => {});
    }
  }, [user]);

  const loadPosts = async () => {
    try {
      let recs = await base44.entities.PropertyPost.filter({ is_active: true }, "order", 200);
      // First-run fallback: seed defaults if the roster is empty so the
      // dashboard always shows the known campus posts.
      if (recs.length === 0 && !seedingRef.current) {
        seedingRef.current = true;
        try {
          await base44.entities.PropertyPost.bulkCreate(
            DEFAULT_LOCATIONS.map((name, i) => ({ name, is_active: true, order: i }))
          );
          recs = await base44.entities.PropertyPost.filter({ is_active: true }, "order", 200);
        } catch {}
      }
      recs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.name || "").localeCompare(b.name || ""));
      setPosts(recs);
    } catch {}
  };

  const load = async () => {
    try {
      const all = await base44.entities.PropertySecurityCheck.list("-checked_at", 500);
      setChecks(all);
      const incIds = [...new Set(all.map(c => c.incident_id).filter(Boolean))];
      const incMap = {};
      await Promise.all(incIds.map(async id => {
        try { incMap[id] = await base44.entities.Incident.get(id); } catch {}
      }));
      setIncidents(incMap);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    loadPosts();
    load();
    const unsub = base44.entities.PropertySecurityCheck.subscribe(() => load());
    return unsub;
  }, []);

  // Latest check per location name
  const latestByLocation = useMemo(() => {
    const map = {};
    for (const c of checks) {
      const existing = map[c.location_name];
      if (!existing || new Date(c.checked_at) > new Date(existing.checked_at)) {
        map[c.location_name] = c;
      }
    }
    return map;
  }, [checks]);

  // Build the full location list (managed roster + any custom seen in history)
  const rosterNames = posts.map(p => p.name);
  const locations = useMemo(() => {
    const list = rosterNames.map(name =>
      latestByLocation[name] || { location_name: name, status: null }
    );
    Object.keys(latestByLocation).forEach(name => {
      if (!rosterNames.includes(name)) list.push(latestByLocation[name]);
    });
    // Sort: unsecured (needs attention) first, then unchecked, then secure
    const priority = (l) => (l.status === "Unsecured" ? 0 : !l.status ? 1 : 2);
    list.sort((a, b) => priority(a) - priority(b));
    return list;
  }, [latestByLocation, rosterNames]);

  const stats = useMemo(() => {
    const total = locations.length;
    const secured = locations.filter(l => l.status === "Secure").length;
    const unsecured = locations.filter(l => l.status === "Unsecured").length;
    const unchecked = locations.filter(l => !l.status).length;
    return { total, secured, unsecured, unchecked };
  }, [locations]);

  const openForm = (locationName) => {
    setFormLocation(locationName);
    setFormOpen(true);
  };

  const fmtTime = (iso) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("en-US", {
        month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
      });
    } catch { return iso; }
  };

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Lock className="w-6 h-6 text-[#d4a843]" />
          <h1 className="text-white font-bold text-xl">Property Security</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setManagerOpen(true)}
            className="flex items-center gap-2 bg-[#141f3d] hover:bg-[#1a2744] text-slate-300 border border-[rgba(212,168,67,0.15)] px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Settings className="w-4 h-4" />
            Manage
          </button>
          <button
            onClick={() => setShowHistory(v => !v)}
            className="flex items-center gap-2 bg-[#141f3d] hover:bg-[#1a2744] text-slate-300 border border-[rgba(212,168,67,0.15)] px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <History className="w-4 h-4" />
            {showHistory ? "Current Status" : "History"}
          </button>
          <button
            onClick={() => { setFormLocation(null); setFormOpen(true); }}
            className="flex items-center gap-2 bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] px-3 py-2 rounded-lg text-sm font-bold transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Check
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-3 text-center">
          <p className="text-2xl font-bold text-white">{stats.total}</p>
          <p className="text-xs text-slate-400 uppercase tracking-wide">Locations</p>
        </div>
        <div className="bg-[#1a2744] rounded-xl border border-green-500/20 p-3 text-center">
          <p className="text-2xl font-bold text-green-400">{stats.secured}</p>
          <p className="text-xs text-slate-400 uppercase tracking-wide">Secure</p>
        </div>
        <div className="bg-[#1a2744] rounded-xl border border-red-500/20 p-3 text-center">
          <p className="text-2xl font-bold text-red-400">{stats.unsecured}</p>
          <p className="text-xs text-slate-400 uppercase tracking-wide">Unsecured</p>
        </div>
        <div className="bg-[#1a2744] rounded-xl border border-slate-600/20 p-3 text-center">
          <p className="text-2xl font-bold text-slate-400">{stats.unchecked}</p>
          <p className="text-xs text-slate-400 uppercase tracking-wide">Not Checked</p>
        </div>
      </div>

      {/* Overall status banner — quick at-a-glance summary */}
      {!loading && !showHistory && (
        <div className={`rounded-xl border p-4 flex items-center gap-3 ${
          stats.unsecured > 0 ? "bg-red-900/40 border-red-500/50"
            : stats.unchecked > 0 ? "bg-yellow-900/30 border-yellow-500/40"
            : "bg-green-900/30 border-green-500/40"
        }`}>
          {stats.unsecured > 0
            ? <ShieldAlert className="w-6 h-6 text-red-400 shrink-0" />
            : stats.unchecked > 0
              ? <Lock className="w-6 h-6 text-yellow-400 shrink-0" />
              : <ShieldCheck className="w-6 h-6 text-green-400 shrink-0" />}
          <div>
            <p className={`font-bold text-sm ${
              stats.unsecured > 0 ? "text-red-200"
                : stats.unchecked > 0 ? "text-yellow-200"
                : "text-green-200"
            }`}>
              {stats.unsecured > 0
                ? `${stats.unsecured} location${stats.unsecured > 1 ? "s" : ""} need attention`
                : stats.unchecked > 0
                  ? `${stats.unchecked} not yet checked`
                  : "All locations secure"}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              {stats.secured} of {stats.total} secure · last updated {fmtTime(checks[0]?.checked_at)}
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-slate-400 text-sm">Loading…</div>
      ) : showHistory ? (
        /* ── History feed ── */
        <div className="space-y-2">
          {checks.length === 0 && (
            <p className="text-center text-slate-400 py-8 text-sm">No checks recorded yet.</p>
          )}
          {checks.map(c => (
            <div key={c.id} className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-3 flex items-start gap-3">
              {c.status === "Secure"
                ? <ShieldCheck className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                : <ShieldAlert className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-white font-semibold text-sm">{c.location_name}</p>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.status === "Secure" ? "bg-green-500/15 text-green-300" : "bg-red-500/15 text-red-300"}`}>
                    {c.status}
                  </span>
                </div>
                {c.unsecured_reasons?.length > 0 && (
                  <p className="text-red-300/80 text-xs mt-1">⚠ {c.unsecured_reasons.join(", ")}</p>
                )}
                {c.notes && <p className="text-slate-400 text-xs mt-1">{c.notes}</p>}
                <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 flex-wrap">
                  <span>{c.checked_by || "—"}</span>
                  <span>·</span>
                  <span>{fmtTime(c.checked_at)}</span>
                  {c.incident_id && incidents[c.incident_id] && (
                    <>
                      <span>·</span>
                      <span className="text-[#d4a843] flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        {incidents[c.incident_id].title}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ── Current status grid ── */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {locations.map(loc => {
            const isSecure = loc.status === "Secure";
            const isUnsecured = loc.status === "Unsecured";
            const unchecked = !loc.status;
            return (
              <div
                key={loc.location_name}
                className={`bg-[#1a2744] rounded-xl border p-4 flex flex-col gap-3 ${
                  isSecure ? "border-green-500/30" : isUnsecured ? "border-red-500/40" : "border-[rgba(212,168,67,0.1)]"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {isSecure
                      ? <ShieldCheck className="w-5 h-5 text-green-400" />
                      : isUnsecured
                        ? <ShieldAlert className="w-5 h-5 text-red-400" />
                        : <Lock className="w-5 h-5 text-slate-500" />}
                    <p className="text-white font-semibold text-sm">{loc.location_name}</p>
                  </div>
                  {loc.status && (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isSecure ? "bg-green-500/15 text-green-300" : "bg-red-500/15 text-red-300"}`}>
                      {loc.status}
                    </span>
                  )}
                </div>

                {unchecked && <p className="text-slate-500 text-xs">No check recorded yet.</p>}

                {isUnsecured && loc.unsecured_reasons?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {loc.unsecured_reasons.map(r => (
                      <span key={r} className="text-xs bg-red-500/10 text-red-300 px-2 py-0.5 rounded-full border border-red-500/20">
                        {r}
                      </span>
                    ))}
                  </div>
                )}

                {loc.notes && <p className="text-slate-400 text-xs">{loc.notes}</p>}

                {loc.incident_id && incidents[loc.incident_id] && (
                  <div className="flex items-center gap-1.5 text-xs text-[#d4a843] bg-[#d4a843]/5 border border-[#d4a843]/20 rounded-lg px-2 py-1.5">
                    <FileText className="w-3.5 h-3.5" />
                    <span className="truncate">{incidents[loc.incident_id].title}</span>
                  </div>
                )}

                {loc.status && (
                  <p className="text-xs text-slate-500">
                    Checked {fmtTime(loc.checked_at)} by {loc.checked_by || "—"}
                  </p>
                )}

                <button
                  onClick={() => openForm(loc.location_name)}
                  className="w-full bg-[#0a1128] hover:bg-[#141f3d] border border-[rgba(212,168,67,0.2)] text-[#d4a843] text-sm font-medium py-2 rounded-lg transition-colors mt-auto"
                >
                  {unchecked ? "Check Now" : "Update Status"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {formOpen && (
        <PropertySecurityCheckForm
          user={currentUser}
          initialLocation={formLocation}
          availableLocations={rosterNames.length ? rosterNames : DEFAULT_LOCATIONS}
          onClose={() => setFormOpen(false)}
          onSaved={() => load()}
        />
      )}

      {managerOpen && (
        <PropertyManager
          onClose={() => setManagerOpen(false)}
          onChanged={() => { loadPosts(); load(); }}
        />
      )}
    </div>
  );
}