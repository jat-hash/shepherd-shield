import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, CheckCircle, Clock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import AssignmentForm from "@/components/assignments/AssignmentForm";

export default function Assignments() {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editData, setEditData] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);

  const loadAssignments = async () => {
    setLoading(true);
    const all = await base44.entities.Assignment.filter({ service_date: selectedDate }, "start_time");
    setAssignments(all);
    setLoading(false);
  };

  useEffect(() => { loadAssignments(); }, [selectedDate]);

  const getWeekDates = () => {
    const today = new Date(selectedDate);
    const day = today.getDay();
    const start = new Date(today);
    start.setDate(today.getDate() - day);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  };

  const weekDates = getWeekDates();
  const dayNames = ["S", "M", "T", "W", "T", "F", "S"];

  const statusIcon = (status) => {
    if (status === "Confirmed") return <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />;
    if (status === "Pending") return <Clock className="w-3.5 h-3.5 text-amber-400" />;
    return <XCircle className="w-3.5 h-3.5 text-red-400" />;
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 lg:ml-60 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Assignments</h1>
        <Button onClick={() => { setEditData(null); setFormOpen(true); }} className="bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] font-bold text-sm gap-1">
          <Plus className="w-4 h-4" /> Create
        </Button>
      </div>

      {/* Week View */}
      <div className="grid grid-cols-7 gap-1">
        {weekDates.map((d, i) => {
          const dateStr = d.toISOString().split("T")[0];
          const isSelected = dateStr === selectedDate;
          const isToday = dateStr === new Date().toISOString().split("T")[0];
          return (
            <button
              key={i}
              onClick={() => setSelectedDate(dateStr)}
              className={`flex flex-col items-center py-2 rounded-xl transition-all ${
                isSelected ? "bg-[#d4a843] text-[#0a1128]" : "bg-[#1a2744] text-slate-400 hover:bg-[#1a2744]/80"
              }`}
            >
              <span className="text-[10px] font-medium">{dayNames[i]}</span>
              <span className={`text-sm font-bold ${isToday && !isSelected ? "text-[#d4a843]" : ""}`}>
                {d.getDate()}
              </span>
            </button>
          );
        })}
      </div>

      {/* Assignments List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-[#d4a843] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : assignments.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-slate-500 text-sm">No assignments for this date</p>
        </div>
      ) : (
        <div className="space-y-3">
          {assignments.map(a => (
            <button
              key={a.id}
              onClick={() => { setEditData(a); setFormOpen(true); }}
              className="w-full text-left bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-4 hover:border-[#d4a843]/30 transition-all"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">{a.position_name}</h3>
                  {a.service_type && a.service_type !== "Custom Date" && (
                    <p className="text-xs text-[#d4a843] font-medium mt-0.5">{a.service_type}</p>
                  )}
                  <p className="text-xs text-slate-400 mt-1">{a.assigned_to_name} • {a.start_time} – {a.end_time}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  {statusIcon(a.status)}
                  <span className="text-[10px] text-slate-400">{a.status}</span>
                </div>
              </div>
              {a.checked_in && (
                <p className="text-[10px] text-emerald-400 mt-2">
                  ✓ Checked in at {a.check_in_time}
                  {a.checked_out && ` • Out at ${a.check_out_time}`}
                </p>
              )}
            </button>
          ))}
        </div>
      )}

      <AssignmentForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditData(null); }}
        onSaved={loadAssignments}
        editData={editData}
      />
    </div>
  );
}