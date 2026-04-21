import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { ChevronLeft, ChevronRight, User, GripVertical, X, CheckCircle, Clock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import AssignmentForm from "@/components/assignments/AssignmentForm";

const SERVICE_TYPES = ["Sunday AM", "Sunday PM", "Tuesday Bible Study", "Thursday Services"];

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getServiceDatesForMonth(year, month) {
  const dates = [];
  const d = new Date(year, month, 1);
  while (d.getMonth() === month) {
    const day = d.getDay();
    if (day === 0 || day === 2 || day === 4) {
      dates.push(new Date(d));
    }
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

function getServiceTypesForDate(date) {
  const day = date.getDay();
  if (day === 0) return ["Sunday AM", "Sunday PM"];
  if (day === 2) return ["Tuesday Bible Study"];
  if (day === 4) return ["Thursday Services"];
  return [];
}

const statusIcon = (status) => {
  if (status === "Confirmed") return <CheckCircle className="w-3 h-3 text-emerald-400" />;
  if (status === "Pending") return <Clock className="w-3 h-3 text-amber-400" />;
  return <XCircle className="w-3 h-3 text-red-400" />;
};

export default function ShiftScheduler({ onSaved, initialMonth, onMonthChange }) {
   const [currentMonth, setCurrentMonth] = useState(() => initialMonth || new Date());
   const todayRef = useRef(null);

   const handleMonthChange = (newMonth) => {
     setCurrentMonth(newMonth);
     onMonthChange?.(newMonth);
   };
   const [assignments, setAssignments] = useState([]);
   const [positions, setPositions] = useState([]);
   const [users, setUsers] = useState([]);
   const [loading, setLoading] = useState(true);
   const [editData, setEditData] = useState(null);
   const [formOpen, setFormOpen] = useState(false);
   const [dropping, setDropping] = useState(false);

   // Scroll today's date to top on mount
   useEffect(() => {
     if (todayRef.current) {
       setTimeout(() => {
         todayRef.current.scrollIntoView({ behavior: "instant", block: "start" });
         window.scrollBy(0, -60);
       }, 50);
     }
   }, []);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const monthName = currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const serviceDates = getServiceDatesForMonth(year, month);

  const loadAll = async () => {
    setLoading(true);
    const [a, p, u] = await Promise.all([
      base44.entities.Assignment.filter({}, "-service_date", 1000),
      base44.entities.Position.filter({ is_active: true }),
      base44.functions.invoke("listUsers").then(r => r?.data?.users || []).catch(() => []),
    ]);
    const d1 = toDateStr(new Date(year, month, 1));
    const d2 = toDateStr(new Date(year, month + 1, 0));
    setAssignments(a.filter(x => x.service_date >= d1 && x.service_date <= d2));
    setPositions(p);
    setUsers(u);
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, [year, month]);

  useEffect(() => {
    const unsub = base44.entities.Assignment.subscribe(() => loadAll());
    return unsub;
  }, [year, month]);

  const getAssignmentsFor = (dateStr, serviceType, positionName) =>
    assignments.filter(
      a => a.service_date === dateStr && a.service_type === serviceType && a.position_name === positionName
    );

  const handleDragEnd = async (result) => {
    if (!result.destination) return;
    const { droppableId } = result.destination;
    const parts = droppableId.split("||");
    if (parts.length !== 3) return;
    const [dateStr, serviceType, positionName] = parts;
    const userEmail = result.draggableId;
    const user = users.find(u => u.email === userEmail);
    if (!user) return;

    const pos = positions.find(p => p.name === positionName);
    setDropping(true);
    try {
      await base44.entities.Assignment.create({
        position_name: positionName,
        service_date: dateStr,
        service_type: serviceType,
        start_time: pos?.default_radio_channel ? "09:00" : "09:00",
        end_time: "12:00",
        assigned_to_email: userEmail,
        assigned_to_name: user.data?.display_name || user.display_name || user.full_name || userEmail,
        radio_channel: pos?.default_radio_channel || "",
        status: "Pending",
      });
      toast.success(`${user.data?.display_name || user.display_name || user.full_name} assigned to ${positionName}`);
      onSaved?.();
    } catch (e) {
      toast.error("Failed to create assignment");
    }
    setDropping(false);
  };

  const handleRemove = async (assignmentId) => {
    await base44.entities.Assignment.delete(assignmentId);
    await loadAll();
    onSaved?.();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-[#d4a843] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex flex-col gap-1">

        {/* Month Nav */}
        <div className="flex items-center justify-between bg-[#1a2744] rounded p-1 border border-[rgba(212,168,67,0.1)]">
          <Button onClick={() => handleMonthChange(new Date(year, month - 1))} variant="ghost" size="icon" className="text-slate-400 hover:text-[#d4a843] h-7 w-7">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <h2 className="text-xs font-bold text-white">{monthName}</h2>
          <Button onClick={() => handleMonthChange(new Date(year, month + 1))} variant="ghost" size="icon" className="text-slate-400 hover:text-[#d4a843] h-7 w-7">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        {/* Scheduler Grid + Officers Panel */}
        <div className="flex gap-2 h-[calc(100vh-220px)]">
          {/* Scheduler Grid */}
          <div className="flex-1 space-y-1 overflow-y-auto pr-1">
          {serviceDates.length === 0 && (
            <div className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-6 text-center text-slate-400 text-sm">
              No service days this month
            </div>
          )}

          {serviceDates.map(date => {
            const dateStr = toDateStr(date);
            const todayStr = toDateStr(new Date());
            const isToday = dateStr === todayStr;
            const serviceTypes = getServiceTypesForDate(date);
            const dayLabel = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

            return (
              <div ref={isToday ? todayRef : null} key={dateStr} className={`bg-[#1a2744] rounded border p-1.5 ${isToday ? "border-[#d4a843]/40" : "border-[rgba(212,168,67,0.1)]"}`}>
                <p className={`text-[10px] font-bold mb-0.5 ${isToday ? "text-[#d4a843]" : "text-slate-300"}`}>{dayLabel}</p>
                <div className="space-y-1">
                  {serviceTypes.map(svcType => (
                    <div key={svcType}>
                      <p className="text-[8px] uppercase tracking-wide text-slate-500 mb-0.5">{svcType}</p>
                      <div className="space-y-0.5">
                        {positions.length === 0 ? (
                          <p className="text-[10px] text-slate-600">No positions defined</p>
                        ) : positions.map(pos => {
                          const cellAssignments = getAssignmentsFor(dateStr, svcType, pos.name);
                          const droppableId = `${dateStr}||${svcType}||${pos.name}`;
                          return (
                            <Droppable key={droppableId} droppableId={droppableId}>
                              {(provided, snapshot) => (
                                <div
                                   ref={provided.innerRef}
                                   {...provided.droppableProps}
                                   className={`rounded px-1.5 py-0.5 min-h-[28px] border transition-all ${snapshot.isDraggingOver ? "bg-[#d4a843]/10 border-[#d4a843]/40" : "bg-[#0a1128]/60 border-transparent"}`}
                                 >
                                   <span className="text-[8px] text-slate-500 block mb-0.5 truncate">{pos.name}</span>
                                  <div className="flex flex-wrap gap-1">
                                    {cellAssignments.map(a => (
                                      <div
                                        key={a.id}
                                        className="flex items-center gap-1 bg-[#1a2744] border border-[rgba(212,168,67,0.15)] rounded px-1.5 py-0.5 text-[10px] text-white group"
                                      >
                                        {statusIcon(a.status)}
                                        <button onClick={() => { setEditData(a); setFormOpen(true); }} className="hover:text-[#d4a843] truncate max-w-[80px]">
                                          {a.assigned_to_name}
                                        </button>
                                        <button onClick={() => handleRemove(a.id)} className="opacity-0 group-hover:opacity-100 active:opacity-100 text-red-400 hover:text-red-300 transition-opacity ml-0.5">
                                          <X className="w-2.5 h-2.5" />
                                        </button>
                                      </div>
                                    ))}
                                    {cellAssignments.length === 0 && (
                                       <span className="text-[10px] text-slate-700">—</span>
                                     )}
                                  </div>
                                  {provided.placeholder}
                                </div>
                              )}
                            </Droppable>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          </div>

          {/* Officers Panel — vertical on right */}
          <div className="bg-[#1a2744] rounded border border-[rgba(212,168,67,0.1)] p-1.5 w-40 shrink-0 h-fit sticky top-2">
            <p className="text-[8px] uppercase tracking-wide text-[#d4a843] font-bold mb-1">Officers</p>
            <Droppable droppableId="officers-panel" isDropDisabled={true} direction="vertical">
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps} className="flex flex-col gap-0.5">
                 {users.map((u, i) => (
                    <Draggable key={u.email} draggableId={u.email} index={i}>
                       {(provided, snapshot) => (
                         <div
                             ref={provided.innerRef}
                             {...provided.draggableProps}
                             {...provided.dragHandleProps}
                             className={`flex items-center gap-0.5 bg-[#0a1128] rounded px-1 py-0.5 text-xs text-white cursor-grab active:cursor-grabbing transition-all ${snapshot.isDragging ? "opacity-70 scale-105 shadow-lg border border-[#d4a843]/40" : "border border-[rgba(212,168,67,0.1)]"}`}
                           >
                             <GripVertical className="w-2.5 h-2.5 text-slate-600 shrink-0" />
                             <span className="text-[8px] whitespace-nowrap truncate">{u.data?.display_name || u.display_name || u.full_name || u.email.split("@")[0]}</span>
                             <User className="w-2.5 h-2.5 text-[#d4a843] shrink-0" />
                         </div>
                       )}
                     </Draggable>
                   ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>
          </div>
          </div>

          <AssignmentForm
          open={formOpen}
          onClose={() => { setFormOpen(false); setEditData(null); }}
          onSaved={() => { loadAll(); onSaved?.(); }}
          editData={editData}
          />
          </DragDropContext>
          );
          }