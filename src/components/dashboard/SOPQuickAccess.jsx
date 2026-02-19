import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { BookOpen, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "../../utils";

const PRIORITY_SOPS = [
  "Incident Response Positioning Guide - During Service",
  "Critical Safety Principles",
  "Children's Wing Security Protocol"
];

export default function SOPQuickAccess() {
  const [sops, setSops] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.SOP.list("-updated_date", 10).then(all => {
      const priority = all.filter(s => PRIORITY_SOPS.includes(s.title));
      setSops(priority.slice(0, 3));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading || sops.length === 0) return null;

  return (
    <div className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-[#d4a843]" />
          <h3 className="text-sm font-bold text-white">Critical SOPs</h3>
        </div>
        <Link to={createPageUrl("SOPLibrary")} className="text-xs text-[#d4a843] hover:text-[#e0bb5e] flex items-center gap-1">
          All SOPs <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      
      <div className="space-y-2">
        {sops.map(sop => (
          <Link
            key={sop.id}
            to={createPageUrl("SOPLibrary")}
            className="block bg-[#0a1128] rounded-lg p-2.5 border border-slate-700/50 hover:border-[#d4a843]/30 transition-all group"
          >
            <p className="text-xs font-medium text-slate-300 group-hover:text-white line-clamp-1">
              {sop.title}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">{sop.category}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}