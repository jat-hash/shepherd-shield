import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Plus, CheckCircle, Clock, XCircle, ChevronLeft, ChevronRight, Calendar, WifiOff, LayoutGrid } from "lucide-react";
import ShiftScheduler from "@/components/assignments/ShiftScheduler";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import AssignmentForm from "@/components/assignments/AssignmentForm";
import useOfflineData from "@/hooks/useOfflineData";

export default function Assignments() {
  const { user: authUser } = useAuth();
  const [formOpen, setFormOpen] = useState(false);
  const [editData, setEditData] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [schedulerView, setSchedulerView] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    if (authUser) setCurrentUser(authUser);
    else base44.auth.me().then(setCurrentUser).catch(() => {});
  }, [authUser]);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => { window.removeEventListener("online", handleOnline); window.removeEventListener("offline", handleOffline); };
  }, []);

  const isAdmin = currentUser?.role === "admin";

  const { data: assignments, loading: loadingA, reload: reloadA } = useOfflineData(
    "assignments",
    useCallback(async () => base44.entities.Assignment.filter({}, "-service_date", 1000), []),
    [currentMonth]
  );

  const { data: specialEvents, loading: loadingE, reload: reloadE } = useOfflineData(
    "specialEvents",
    useCallback(async () => base44.entities.SpecialEvent.filter({}, "event_date", 1000), []),
    [currentMonth]
  );

  const loading = loadingA || loadingE;

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const d1 = new Date(year, month, 1);
  const d2 = new Date(year, month + 1, 0);
  const startDate = `${d1.getFullYear()}-${String(d1.getMonth() + 1).padStart(2, '0')}-${String(d1.getDate()).padStart(2, '0')}`;
  const endDate = `${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, '0')}-${String(d2.getDate()).padStart(2, '0')}`;

  const filteredAssignments = assignments.filter(a => a.service_date >= startDate && a.service_date <= endDate);
  const filteredEvents = specialEvents.filter(e => e.event_date >= startDate && e.event_date <= endDate);

  const loadData = () => { reloadA(); reloadE(); };

  useEffect(() => {
    const unsubA = base44.entities.Assignment.subscribe(() => reloadA());
    const unsubE = base44.entities.SpecialEvent.subscribe(() => reloadE());
    return () => { unsubA(); unsubE(); };
  }, []);

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
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return filteredAssignments.filter(a => a.service_date === dateStr);
  };

  const getEventsForDate = (date) => {
    if (!date) return [];
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return filteredEvents.filter(e => e.event_date === dateStr);
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
    <div className="px-3 py-4 lg:px-6 lg:py-6 space-y-4 max-w-full overflow-hidden">
      {isOffline && (
        <div className="flex items-center gap-2 bg-orange-900/40 border border-orange-500/30 rounded-lg px-3 py-2 text-orange-300 text-xs">
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          You're offline — showing cached data
        </div>
      )}
      <div className="flex items-center justify-between">
        <h1 className="text-lg sm:text-xl font-bold text-white">Assignments & Events</h1>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button
              onClick={() => setSchedulerView(!schedulerView)}
              variant="outline"
              className={`text-xs gap-1 h-8 px-3 border-[rgba(212,168,67,0.3)] ${schedulerView ? "bg-[#d4a843]/20 text-[#d4a843]" : "text-slate-400 hover:text-[#d4a843]"}`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{schedulerView ? "Calendar" : "Scheduler"}</span>
            </Button>
          )}
          {isAdmin && !schedulerView && (
            <Button onClick={() => { setEditData(null); setFormOpen(true); }} className="bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] font-bold text-xs sm:text-sm gap-1 h-8 sm:h-10 px-2 sm:px-4">
              <Plus className="w-3.5 h-3.5" /> Create
            </Button>
          )}
        </div>
      </div>

      {isAdmin && schedulerView && (
        <ShiftScheduler onSaved={loadData} />
      )}

      {!schedulerView && (
      <>
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

      {/* Calendar Rows */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-[#d4a843] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-1.5">
          {days.filter(Boolean).map((date, i) => {
            const dayAssignments = getAssignmentsForDate(date);
            const dayEvents = getEventsForDate(date);
            const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            const todayStr = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
            const isToday = dateStr === todayStr;
            const hasItems = dayAssignments.length > 0 || dayEvents.length > 0;

            const isSunday = date.getDay() === 0;
            const amAssignments = isSunday ? dayAssignments.filter(a => a.service_type === "Sunday AM") : [];
            const pmAssignments = isSunday ? dayAssignments.filter(a => a.service_type === "Sunday PM") : [];
            const otherAssignments = isSunday ? dayAssignments.filter(a => a.service_type !== "Sunday AM" && a.service_type !== "Sunday PM") : dayAssignments;

            const renderAssignment = (a) => (
              <button
                key={a.id}
                onClick={() => isAdmin && (setEditData(a), setFormOpen(true))}
                className={`flex items-center gap-1.5 bg-[#0a1128] rounded px-2 py-1.5 border border-transparent transition-all text-left min-w-0 max-w-full ${isAdmin ? "hover:border-[#d4a843]/30 hover:bg-[#d4a843]/10 cursor-pointer" : "cursor-default"}`}
              >
                {statusIcon(a.status)}
                <div className="min-w-0">
                  <p className="text-xs text-white font-medium truncate">{a.position_name}</p>
                  <p className="text-[10px] text-slate-400 truncate">{a.assigned_to_name} · {a.start_time}</p>
                </div>
              </button>
            );

            return (
              <div
                key={i}
                className={`flex gap-3 bg-[#1a2744] rounded-lg border p-3 min-w-0 ${isToday ? "border-[#d4a843]/40" : "border-[rgba(212,168,67,0.1)]"}`}
              >
                {/* Date label */}
                <div className="flex flex-col items-center justify-start w-10 shrink-0 pt-0.5">
                  <span className={`text-xs font-semibold ${isToday ? "text-[#d4a843]" : isSunday ? "text-[#d4a843]/70" : "text-slate-500"}`}>
                    {dayNames[date.getDay()]}
                  </span>
                  <span className={`text-lg font-bold leading-tight ${isToday ? "text-[#d4a843]" : "text-slate-300"}`}>
                    {date.getDate()}
                  </span>
                </div>

                {/* Items */}
                <div className="flex-1 min-w-0 space-y-2">
                  {/* Events */}
                  {dayEvents.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {dayEvents.map(evt => (
                        <div key={evt.id} className="flex items-center gap-1.5 bg-purple-900/30 rounded px-2 py-1.5 border border-purple-500/30">
                          <Calendar className="w-3 h-3 text-purple-400 shrink-0" />
                          <div>
                            <p className="text-xs text-purple-200 font-medium">{evt.event_name}</p>
                            <p className="text-[10px] text-purple-300/70">{evt.event_type} · {evt.start_time}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Sunday AM / PM sections */}
                  {isSunday ? (
                    <>
                      {/* Sunday AM */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400">Sunday AM</span>
                          {isAdmin && (
                            <button
                              onClick={() => { setEditData({ service_date: dateStr, service_type: "Sunday AM" }); setFormOpen(true); }}
                              className="text-[10px] text-[#d4a843] hover:text-[#e0bb5e] flex items-center gap-0.5"
                            >
                              <Plus className="w-3 h-3" /> Add
                            </button>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {amAssignments.length === 0 ? (
                            <span className="text-[10px] text-slate-600">No assignments</span>
                          ) : amAssignments.map(renderAssignment)}
                        </div>
                      </div>

                      {/* Sunday PM */}
                      <div className="space-y-1 border-t border-[rgba(212,168,67,0.07)] pt-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-sky-400">Sunday PM</span>
                          {isAdmin && (
                            <button
                              onClick={() => { setEditData({ service_date: dateStr, service_type: "Sunday PM" }); setFormOpen(true); }}
                              className="text-[10px] text-[#d4a843] hover:text-[#e0bb5e] flex items-center gap-0.5"
                            >
                              <Plus className="w-3 h-3" /> Add
                            </button>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {pmAssignments.length === 0 ? (
                            <span className="text-[10px] text-slate-600">No assignments</span>
                          ) : pmAssignments.map(renderAssignment)}
                        </div>
                      </div>

                      {/* Other Sunday assignments (no service_type match) */}
                      {otherAssignments.length > 0 && (
                        <div className="flex flex-wrap gap-2 border-t border-[rgba(212,168,67,0.07)] pt-2">
                          {otherAssignments.map(renderAssignment)}
                        </div>
                      )}
                    </>
                  ) : (
                    /* Non-Sunday days */
                    <div className="space-y-1">
                      {(date.getDay() === 2 || date.getDay() === 4) && (
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                            {date.getDay() === 2 ? "Tuesday Bible Study" : "Thursday Services"}
                          </span>
                          {isAdmin && (
                            <button
                              onClick={() => { setEditData({ service_date: dateStr, service_type: date.getDay() === 2 ? "Tuesday Bible Study" : "Thursday Services" }); setFormOpen(true); }}
                              className="text-[10px] text-[#d4a843] hover:text-[#e0bb5e] flex items-center gap-0.5"
                            >
                              <Plus className="w-3 h-3" /> Add
                            </button>
                          )}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {dayAssignments.length === 0 && dayEvents.length === 0 && (
                          <span className="text-xs text-slate-600 self-center">No assignments</span>
                        )}
                        {dayAssignments.map(renderAssignment)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      </>
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