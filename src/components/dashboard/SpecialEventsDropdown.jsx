import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ChevronDown, Calendar, Clock, MapPin } from "lucide-react";
import { Card } from "@/components/ui/card";

export default function SpecialEventsDropdown() {
  const [events, setEvents] = useState([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadEvents = async () => {
      setLoading(true);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const allEvents = await base44.entities.SpecialEvent.list("-event_date");
      const upcomingEvents = allEvents.filter(e => {
        const eventDate = new Date(e.event_date);
        eventDate.setHours(0, 0, 0, 0);
        return eventDate >= today;
      }).slice(0, 5);
      
      setEvents(upcomingEvents);
      setLoading(false);
    };
    
    loadEvents();
    
    const unsub = base44.entities.SpecialEvent.subscribe(() => {
      loadEvents();
    });
    
    return unsub;
  }, []);

  if (loading) return null;
  if (events.length === 0) return null;

  return (
    <div className="space-y-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-[#1a2744] border border-[rgba(212,168,67,0.15)] rounded-lg hover:bg-[#1f2e4d] transition-colors"
      >
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-[#d4a843]" />
          <span className="text-sm font-semibold text-white">
            Upcoming Events ({events.length})
          </span>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="space-y-2">
          {events.map(event => (
            <Card key={event.id} className="bg-[#141f3d] border-[rgba(212,168,67,0.15)] p-3">
              <h4 className="text-sm font-semibold text-[#d4a843] mb-2">{event.event_name}</h4>
              <div className="space-y-1 text-xs text-slate-300">
                <div className="flex items-center gap-2">
                  <Calendar className="w-3 h-3 text-slate-500" />
                  {new Date(event.event_date).toLocaleDateString()}
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-3 h-3 text-slate-500" />
                  {event.start_time} - {event.end_time}
                </div>
                {event.location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3 h-3 text-slate-500" />
                    {event.location}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}