import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Search, Baby, Phone, Calendar, ChevronDown, ChevronUp, X, AlertCircle } from "lucide-react";

const AGE_COLORS = {
  "Infant (0-12m)": "bg-pink-900/40 border-pink-500/30 text-pink-300",
  "Toddler (1-2y)": "bg-blue-900/40 border-blue-500/30 text-blue-300",
  "Pre-K (3-4y)": "bg-purple-900/40 border-purple-500/30 text-purple-300",
  "Kindergarten (5y)": "bg-green-900/40 border-green-500/30 text-green-300",
};

export default function NurseryDirectory() {
  const [allRecords, setAllRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [filterAge, setFilterAge] = useState("All");

  useEffect(() => {
    base44.entities.NurseryChild.list("-created_date", 500)
      .then(records => setAllRecords(records))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Group by child name + parent name to deduplicate and show visit history
  const grouped = allRecords.reduce((acc, record) => {
    const key = `${record.child_name?.toLowerCase().trim()}|${record.parent_name?.toLowerCase().trim()}`;
    if (!acc[key]) {
      acc[key] = { ...record, visits: [record] };
    } else {
      acc[key].visits.push(record);
      // Keep the most recent record's base info
      if (new Date(record.created_date) > new Date(acc[key].created_date)) {
        acc[key] = { ...record, visits: acc[key].visits };
      }
    }
    return acc;
  }, {});

  const families = Object.values(grouped).sort((a, b) =>
    (a.child_name || "").localeCompare(b.child_name || "")
  );

  const ageGroups = ["All", "Infant (0-12m)", "Toddler (1-2y)", "Pre-K (3-4y)", "Kindergarten (5y)"];

  const filtered = families.filter(f => {
    const q = search.toLowerCase();
    const matchesSearch = !q ||
      f.child_name?.toLowerCase().includes(q) ||
      f.parent_name?.toLowerCase().includes(q) ||
      f.parent_phone?.toLowerCase().includes(q) ||
      f.check_in_code?.toLowerCase().includes(q);
    const matchesAge = filterAge === "All" || f.age_group === filterAge;
    return matchesSearch && matchesAge;
  });

  return (
    <div className="space-y-3">
      <h2 className="text-xs uppercase tracking-widest text-[#d4a843] font-semibold flex items-center gap-2">
        <Baby className="w-3.5 h-3.5" /> Family Directory ({families.length} families)
      </h2>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by child, parent name, or phone..."
          className="w-full bg-[#0a1128] border border-slate-700 rounded-xl pl-9 pr-9 py-2.5 text-white text-sm outline-none focus:border-[#d4a843]/60 placeholder-slate-500"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Age Filter Pills */}
      <div className="flex gap-1.5 flex-wrap">
        {ageGroups.map(ag => (
          <button
            key={ag}
            onClick={() => setFilterAge(ag)}
            className={`text-[10px] font-semibold px-2.5 py-1 rounded-full transition-colors ${
              filterAge === ag
                ? "bg-[#d4a843] text-[#0a1128]"
                : "bg-[#1a2744] text-slate-400 hover:text-white border border-[rgba(212,168,67,0.1)]"
            }`}
          >
            {ag}
          </button>
        ))}
      </div>

      {/* Results */}
      {loading ? (
        <div className="text-center text-slate-400 py-8 text-sm">Loading directory...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-8 text-center text-slate-400 text-sm">
          <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
          {search ? `No results for "${search}"` : "No records yet"}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(family => {
            const isExpanded = expandedId === family.id;
            const ageColor = AGE_COLORS[family.age_group] || "bg-[#1a2744] border-[rgba(212,168,67,0.1)] text-white";
            return (
              <div key={family.id} className={`rounded-xl border transition-all ${ageColor}`}>
                <button
                  className="w-full text-left px-4 py-3"
                  onClick={() => setExpandedId(isExpanded ? null : family.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Baby className="w-4 h-4 shrink-0" />
                        <p className="font-bold text-white">{family.child_name}</p>
                        <span className="text-[10px] opacity-60 font-medium px-1.5 py-0.5 rounded bg-black/20">{family.age_group}</span>
                        <span className="text-[10px] text-slate-300 bg-black/30 px-1.5 py-0.5 rounded font-mono">{family.visits.length}x visit{family.visits.length !== 1 ? "s" : ""}</span>
                      </div>
                      <p className="text-sm opacity-80 mt-0.5">
                        Parent: <span className="text-white font-medium">{family.parent_name}</span>
                        {family.parent_phone && (
                          <span className="ml-2 opacity-70"><Phone className="w-3 h-3 inline mr-0.5" />{family.parent_phone}</span>
                        )}
                      </p>
                      {family.allergies_notes && (
                        <p className="text-xs text-yellow-300 mt-1 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> {family.allergies_notes}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0 mt-1">
                      <span className="text-[10px] text-slate-400">
                        Last: {new Date(family.created_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                      {isExpanded ? <ChevronUp className="w-4 h-4 opacity-50" /> : <ChevronDown className="w-4 h-4 opacity-50" />}
                    </div>
                  </div>
                </button>

                {/* Expanded: visit history */}
                {isExpanded && (
                  <div className="border-t border-black/20 px-4 py-3 space-y-2">
                    <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold mb-2">Visit History</p>
                    {family.visits
                      .sort((a, b) => new Date(b.service_date) - new Date(a.service_date))
                      .map((v, i) => (
                        <div key={i} className="flex items-center justify-between text-xs bg-black/20 rounded-lg px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-3 h-3 opacity-60" />
                            <span className="text-white">{v.service_date}</span>
                          </div>
                          <div className="flex items-center gap-2 text-slate-300">
                            <span className="font-mono opacity-70">#{v.check_in_code}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${v.checked_in ? "bg-green-800 text-green-300" : "bg-slate-700 text-slate-300"}`}>
                              {v.checked_in ? "In" : "Out"}
                            </span>
                          </div>
                        </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}