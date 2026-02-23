import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, CheckCircle, Clock, XCircle, ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import AssignmentForm from "@/components/assignments/AssignmentForm";

export default function Assignments() {
  const [assignments, setAssignments] = useState([]);
  const [specialEvents, setSpecialEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editData, setEditData] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const loadData = async () => {
    setLoading(true);
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const startDate = new Date(year, month, 1).toISOString().split("T")[0];
    const endDate = new Date(year, month + 1, 0).toISOString().split("T")[0];
    
    const allAssignments = await base44.entities.Assignment.list("service_date");
    const filteredAssignments = allAssignments.filter(a => a.service_date >= startDate && a.service_date <= endDate);
    setAssignments(filteredAssignments);

    const allEvents = await base44.entities.SpecialEvent.list("event_date");
    const filteredEvents = allEvents.filter(e => e.event_date >= startDate && e.event_date <= endDate);
    setSpecialEvents(filteredEvents);
    
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [currentMonth]);

  const getDaysInMonth = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();
    
    const days = [];
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    return days;
  };

  const days = getDaysInMonth();
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const monthName = currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const getAssignmentsForDate = (date) => {
    if (!date) return [];
    const dateStr = date.toISOString().split("T")[0];
    return assignments.filter(a => a.service_date === dateStr);
  };

  const getEventsForDate = (date) => {
    if (!date) return [];
    const dateStr = date.toISOString().split("T")[0];
    return specialEvents.filter(e => e.event_date === dateStr);
  };

  const goToPreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  const goToNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  const statusIcon = (status) => {
    if (status === "Confirmed") return <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />;
    if (status === "Pending") return <Clock className="w-3.5 h-3.5 text-amber-400" />;
    return <XCircle className="w-3.5 h-3.5 text-red-400" />;
  };

  const handleEventClick = (event) => {
    setEditData(event);
    setFormOpen(true);
  };

  return (
    <div className="max-w-6xl mx-auto px-3 py-4 lg:px-4 lg:py-6 lg:ml-60 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg sm:text-xl font-bold text-white">Assignments & Events</h1>
        <Button onClick={() => { setEditData(null); setFormOpen(true); }} className="bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] font-bold text-xs sm:text-sm gap-1 h-8 sm:h-10 px-2 sm:px-4">
          <Plus className="w-3 h-3 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Create</span>
        </Button>
      </div>

      {/* Month Navigation */}
      <div className="flex items-center justify-between bg-[#1a2744] rounded-xl p-3 border border-[rgba(212,168,67,0.1)]">
        <Button onClick={goToPreviousMonth} variant="ghost" size="icon" className="text-slate-400 hover:text-[#d4a843]">
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <h2 className="text-base font-bold text-white">{monthName}</h2>
        <Button onClick={goToNextMonth} variant="ghost" size="icon" className="text-slate-400 hover:text-[#d4a843]">
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>

      {/* Calendar Grid */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-[#d4a843] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div>
          {/* Day Headers */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2">
            {dayNames.map(name => (
              <div key={name} className="text-center text-xs sm:text-sm font-semibold text-slate-400 py-2">
                <span className="hidden sm:inline">{name}</span>
                <span className="sm:hidden">{name.charAt(0)}</span>
              </div>
            ))}
          </div>

          {/* Calendar Days */}
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {days.map((date, i) => {
              const dayAssignments = date ? getAssignmentsForDate(date) : [];
              const dayEvents = date ? getEventsForDate(date) : [];
              const isToday = date && date.toISOString().split("T")[0] === new Date().toISOString().split("T")[0];
              
              return (
                <div
                  key={i}
                  className={`min-h-[90px] sm:min-h-[120px] bg-[#1a2744] rounded-lg border p-1.5 sm:p-2 ${
                    date ? "border-[rgba(212,168,67,0.1)]" : "border-transparent bg-transparent"
                  }`}
                >
                  {date && (
                    <>
                      <div className={`text-xs sm:text-sm font-bold mb-1 ${isToday ? "text-[#d4a843]" : "text-slate-300"}`}>
                        {date.getDate()}
                      </div>
                      <div className="space-y-1">
                        {/* Special Events */}
                        {dayEvents.map(evt => (
                          <div
                            key={evt.id}
                            className="w-full text-left bg-purple-900/30 rounded p-1.5 border border-purple-500/30"
                          >
                            <div className="flex items-center gap-1 mb-0.5">
                              <Calendar className="w-3 h-3 text-purple-400" />
                              <span className="text-[10px] sm:text-xs text-purple-200 font-medium truncate">{evt.event_name}</span>
                            </div>
                            <Badge className="bg-purple-500/20 text-purple-300 text-[8px] sm:text-[9px] px-1 py-0 h-auto">
                              {evt.event_type}
                            </Badge>
                            <p className="text-[9px] sm:text-[10px] text-purple-300/70 mt-0.5">{evt.start_time}</p>
                          </div>
                        ))}
                        
                        {/* Assignments */}
                        {dayAssignments.map(a => (
                          <button
                            key={a.id}
                            onClick={() => { setEditData(a); setFormOpen(true); }}
                            className="w-full text-left bg-[#0a1128] rounded p-1.5 hover:bg-[#d4a843]/10 border border-transparent hover:border-[#d4a843]/30 transition-all"
                          >
                            <div className="flex items-center gap-1 mb-0.5">
                              {statusIcon(a.status)}
                              <span className="text-[10px] sm:text-xs text-white font-medium truncate">{a.position_name}</span>
                            </div>
                            <p className="text-[9px] sm:text-[10px] text-slate-400 truncate">{a.assigned_to_name}</p>
                            <p className="text-[9px] sm:text-[10px] text-slate-500">{a.start_time}</p>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <AssignmentForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditData(null); }}
        onSaved={loadData}
        editData={editData}
      />
    </div>
  );
}