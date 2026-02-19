import { MapPin, Clock, CheckCircle, BookOpen } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { createPageUrl } from "../../utils";

export default function AssignmentCard({ assignment, onUpdate }) {
  if (!assignment) {
    return (
      <div className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-6 text-center">
        <p className="text-slate-400 text-sm">No assignments for today</p>
      </div>
    );
  }

  const handleCheckIn = async () => {
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    await base44.entities.Assignment.update(assignment.id, {
      checked_in: true,
      check_in_time: now,
      status: "Confirmed"
    });
    onUpdate?.();
  };

  const handleCheckOut = async () => {
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    await base44.entities.Assignment.update(assignment.id, {
      checked_out: true,
      check_out_time: now
    });
    onUpdate?.();
  };

  return (
    <div className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-[#d4a843] font-semibold mb-1">Today's Assignment</p>
          <h3 className="text-lg font-bold text-white">{assignment.position_name}</h3>
        </div>
        <span className={`text-[10px] px-2 py-1 rounded-full font-semibold ${
          assignment.status === "Confirmed" ? "bg-emerald-500/20 text-emerald-400" :
          assignment.status === "Pending" ? "bg-amber-500/20 text-amber-400" :
          "bg-red-500/20 text-red-400"
        }`}>
          {assignment.status}
        </span>
      </div>

      <div className="flex flex-wrap gap-4 text-sm text-slate-400">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          <span>{assignment.start_time} – {assignment.end_time}</span>
        </div>
        {assignment.radio_channel && (
          <div className="flex items-center gap-1.5">
            <span className="text-[#d4a843]">CH</span>
            <span>{assignment.radio_channel}</span>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        {!assignment.checked_in ? (
          <>
            <Button onClick={handleCheckIn} className="flex-1 bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] font-bold text-sm">
              <CheckCircle className="w-4 h-4 mr-2" /> Check In
            </Button>
            <Link to={createPageUrl("SOPLibrary")}>
              <Button variant="outline" size="icon" className="border-[#d4a843]/30 text-[#d4a843] hover:bg-[#d4a843]/10">
                <BookOpen className="w-4 h-4" />
              </Button>
            </Link>
          </>
        ) : !assignment.checked_out ? (
          <>
            <Button onClick={handleCheckOut} variant="outline" className="flex-1 border-[#d4a843] text-[#d4a843] hover:bg-[#d4a843]/10 font-bold text-sm">
              Check Out
            </Button>
            <Link to={createPageUrl("SOPLibrary")}>
              <Button variant="outline" size="icon" className="border-[#d4a843]/30 text-[#d4a843] hover:bg-[#d4a843]/10">
                <BookOpen className="w-4 h-4" />
              </Button>
            </Link>
          </>
        ) : (
          <div className="flex-1 text-center text-emerald-400 text-sm font-medium py-2">
            ✓ Completed ({assignment.check_in_time} – {assignment.check_out_time})
          </div>
        )}
      </div>
    </div>
  );
}