import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function EventCalendar({ events, onEventClick }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [displayEvents, setDisplayEvents] = useState([]);

  useEffect(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const filtered = events.filter(event => {
      const eventDate = new Date(event.event_date || event.service_date);
      return eventDate.getFullYear() === year && eventDate.getMonth() === month;
    });

    setDisplayEvents(filtered);
  }, [currentDate, events]);

  const getDaysInMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const daysInMonth = getDaysInMonth(currentDate);
  const firstDay = getFirstDayOfMonth(currentDate);
  const days = [];

  for (let i = 0; i < firstDay; i++) {
    days.push(null);
  }

  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  };

  const getEventsForDay = (day) => {
    if (!day) return [];
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return displayEvents.filter(e => (e.event_date || e.service_date) === dateStr);
  };

  const monthName = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="bg-[#141f3d] border border-[rgba(212,168,67,0.15)] rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">{monthName}</h3>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" onClick={handlePrevMonth} className="text-slate-400">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleNextMonth} className="text-slate-400">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2 mb-2">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="text-center text-xs font-semibold text-slate-400">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {days.map((day, idx) => {
          const dayEvents = getEventsForDay(day);
          return (
            <div
              key={idx}
              className={`min-h-20 rounded p-2 text-xs ${
                day
                  ? 'bg-[#0a1128] border border-[rgba(212,168,67,0.1)]'
                  : 'bg-transparent'
              }`}
            >
              {day && (
                <>
                  <div className="font-semibold text-slate-300 mb-1">{day}</div>
                  <div className="space-y-1">
                    {dayEvents.slice(0, 2).map(event => (
                      <button
                        key={event.id}
                        onClick={() => onEventClick(event)}
                        className="block w-full text-left px-1 py-0.5 bg-[#d4a843]/20 text-[#d4a843] rounded truncate hover:bg-[#d4a843]/30 transition-colors"
                      >
                        {event.position_name || event.event_name}
                      </button>
                    ))}
                    {dayEvents.length > 2 && (
                      <div className="text-slate-500 px-1">+{dayEvents.length - 2} more</div>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}