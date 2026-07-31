import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ShieldCheck, ShieldAlert, Lock } from "lucide-react";
import PropertySecurityCheckForm, { DEFAULT_LOCATIONS } from "@/components/property/PropertySecurityCheckForm";

// Match an assignment's position name to a known property location.
const matchLocation = (positionName) => {
  if (!positionName) return null;
  const name = positionName.toLowerCase().trim();
  for (const loc of DEFAULT_LOCATIONS) {
    const l = loc.toLowerCase();
    if (name === l || name.includes(l) || l.includes(name)) return loc;
  }
  return null;
};

export default function PropertySecurityWidget({ user }) {
  const [posts, setPosts] = useState([]);
  const [latestByLoc, setLatestByLoc] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [formLoc, setFormLoc] = useState("");

  useEffect(() => {
    if (!user?.email) return;

    const loadChecks = () => {
      base44.entities.PropertySecurityCheck.list("-checked_at", 200)
        .then(checks => {
          const map = {};
          for (const c of checks) {
            if (!map[c.location_name]) map[c.location_name] = c;
          }
          setLatestByLoc(map);
        })
        .catch(() => {});
    };

    const loadAssignments = async () => {
      try {
        const todayStr = new Date().toISOString().slice(0, 10);
        const all = await base44.entities.Assignment.filter({ assigned_to_email: user.email }, "-service_date", 1000);
        const matched = [];
        const seen = new Set();
        for (const a of all) {
          if ((a.service_date || "").slice(0, 10) < todayStr) continue;
          const loc = matchLocation(a.position_name);
          if (loc && !seen.has(loc)) {
            seen.add(loc);
            matched.push({ location: loc, assignment: a });
          }
        }
        setPosts(matched);
        if (matched.length > 0) loadChecks();
      } catch {}
    };

    loadAssignments();
    const unsub = base44.entities.PropertySecurityCheck.subscribe(() => loadChecks());
    return () => unsub && unsub();
  }, [user]);

  if (posts.length === 0) return null;

  const openForm = (loc) => { setFormLoc(loc); setShowForm(true); };

  return (
    <div className="space-y-3">
      <h2 className="text-sm uppercase tracking-widest text-[#d4a843] font-semibold flex items-center gap-2">
        <Lock className="w-4 h-4" />
        Property Security
      </h2>
      {posts.map(({ location, assignment }) => {
        const latest = latestByLoc[location];
        const secure = latest?.status === "Secure";
        const hasCheck = !!latest;
        return (
          <div key={location} className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {hasCheck ? (
                  secure ? <ShieldCheck className="w-5 h-5 text-green-400 shrink-0" /> : <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" />
                ) : (
                  <Lock className="w-5 h-5 text-slate-400 shrink-0" />
                )}
                <div>
                  <p className="text-white font-semibold text-sm">{location}</p>
                  <p className="text-slate-400 text-xs">
                    {hasCheck ? (secure ? "Secure" : "Unsecured") : "Not checked yet"}
                    {assignment.service_date && ` · ${assignment.service_date.slice(0, 10)}`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => openForm(location)}
                className="bg-[#d4a843]/15 hover:bg-[#d4a843]/25 text-[#d4a843] text-xs font-semibold px-3 py-2 rounded-lg transition-colors shrink-0"
              >
                {hasCheck ? "Update Status" : "Check Now"}
              </button>
            </div>
          </div>
        );
      })}
      {showForm && (
        <PropertySecurityCheckForm
          user={user}
          initialLocation={formLoc}
          onClose={() => setShowForm(false)}
          onSaved={() => setShowForm(false)}
        />
      )}
    </div>
  );
}