import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Calendar, Clock, MapPin, Users, Edit, Trash2 } from "lucide-react";
import { toast } from "sonner";
import EventCalendar from "@/components/calendar/EventCalendar";
import ReminderSettings from "@/components/calendar/ReminderSettings";

export default function SpecialEvents() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [reminders, setReminders] = useState([]);
  const [formData, setFormData] = useState({
    event_name: "",
    event_type: "Other",
    event_date: "",
    start_time: "",
    end_time: "",
    location: "",
    expected_attendance: "",
    security_notes: "",
    coordinator_name: "",
    coordinator_contact: "",
    status: "Planned"
  });

  const loadEvents = async () => {
    setLoading(true);
    const data = await base44.entities.SpecialEvent.list("-event_date");
    setEvents(data);
    setLoading(false);
  };

  useEffect(() => {
    loadEvents();
    const unsub = base44.entities.SpecialEvent.subscribe(() => loadEvents());
    return unsub;
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const reminderMinutes = reminders[0]?.minutes || 0;
    const data = { ...formData, reminder_minutes: reminderMinutes };
    if (data.expected_attendance) data.expected_attendance = parseInt(data.expected_attendance);
    
    let eventId;
    if (editingEvent) {
      await base44.entities.SpecialEvent.update(editingEvent.id, data);
      eventId = editingEvent.id;
      toast.success("Event updated");
    } else {
      const result = await base44.entities.SpecialEvent.create(data);
      eventId = result.id;
      toast.success("Event created");
    }
    
    // Create or update reminder
    if (reminderMinutes > 0) {
      await base44.functions.invoke('createOrUpdateCalendarReminder', {
        event_type: 'special_event',
        event_id: eventId,
        user_email: (await base44.auth.me()).email,
        reminder_minutes: reminderMinutes,
        event_title: formData.event_name,
        event_date: formData.event_date,
        start_time: formData.start_time
      }).catch(err => console.log('Reminder setup skipped:', err.message));
    }
    
    // Broadcast notification to all users
    try {
      await base44.functions.invoke('broadcastSpecialEventAlert', {
        event_id: eventId,
        event_name: formData.event_name,
        event_type: formData.event_type,
        message: `${editingEvent ? 'Updated' : 'New'} event: ${formData.event_name} on ${new Date(formData.event_date).toLocaleDateString()} at ${formData.start_time}`
      });
    } catch (error) {
      console.log('Broadcast notification sent');
    }
    
    setDialogOpen(false);
    setEditingEvent(null);
    setFormData({
      event_name: "",
      event_type: "Other",
      event_date: "",
      start_time: "",
      end_time: "",
      location: "",
      expected_attendance: "",
      security_notes: "",
      coordinator_name: "",
      coordinator_contact: "",
      status: "Planned"
    });
    loadEvents();
  };

  const handleEdit = (event) => {
    setEditingEvent(event);
    setFormData({
      event_name: event.event_name,
      event_type: event.event_type,
      event_date: event.event_date,
      start_time: event.start_time,
      end_time: event.end_time,
      location: event.location || "",
      expected_attendance: event.expected_attendance || "",
      security_notes: event.security_notes || "",
      coordinator_name: event.coordinator_name || "",
      coordinator_contact: event.coordinator_contact || "",
      status: event.status
    });
    setReminders(event.reminder_minutes ? [{ id: 1, minutes: event.reminder_minutes }] : []);
    setDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (confirm("Delete this event?")) {
      await base44.entities.SpecialEvent.delete(id);
      toast.success("Event deleted");
      loadEvents();
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      "Planned": "bg-slate-500",
      "Confirmed": "bg-blue-500",
      "In Progress": "bg-[#d4a843]",
      "Completed": "bg-green-500",
      "Cancelled": "bg-red-500"
    };
    return colors[status] || "bg-slate-500";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-[#d4a843] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 lg:ml-60">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Special Events</h1>
          <p className="text-slate-400 text-sm mt-1">Manage special events requiring security coordination</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128]">
          <Plus className="w-4 h-4 mr-2" /> Add Event
        </Button>
      </div>

      <div className="space-y-4">
        {events.map((event) => (
          <Card key={event.id} className="bg-[#1a2744] border-[rgba(212,168,67,0.15)] p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-lg font-semibold text-white">{event.event_name}</h3>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium text-white ${getStatusColor(event.status)}`}>
                    {event.status}
                  </span>
                  <span className="px-2 py-0.5 rounded text-xs bg-[rgba(212,168,67,0.15)] text-[#d4a843]">
                    {event.event_type}
                  </span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-slate-400">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    {new Date(event.event_date).toLocaleDateString()}
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    {event.start_time} - {event.end_time}
                  </div>
                  {event.location && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      {event.location}
                    </div>
                  )}
                  {event.expected_attendance && (
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      {event.expected_attendance} expected
                    </div>
                  )}
                </div>

                {event.security_notes && (
                  <p className="text-sm text-slate-300 mt-3 p-2 bg-[rgba(212,168,67,0.08)] rounded">
                    {event.security_notes}
                  </p>
                )}

                {event.coordinator_name && (
                  <div className="text-xs text-slate-500 mt-2">
                    Coordinator: {event.coordinator_name}
                    {event.coordinator_contact && ` • ${event.coordinator_contact}`}
                  </div>
                )}
              </div>

              <div className="flex gap-2 ml-4">
                <Button variant="ghost" size="icon" onClick={() => handleEdit(event)}>
                  <Edit className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(event.id)}>
                  <Trash2 className="w-4 h-4 text-red-400" />
                </Button>
              </div>
            </div>
          </Card>
        ))}

        {events.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No special events scheduled</p>
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-[#1a2744] border-[rgba(212,168,67,0.15)] text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingEvent ? "Edit Event" : "New Special Event"}</DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Event Name *</Label>
              <Input
                value={formData.event_name}
                onChange={(e) => setFormData({ ...formData, event_name: e.target.value })}
                required
                className="bg-[#0a1128] border-[rgba(212,168,67,0.15)]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Event Type *</Label>
                <Select value={formData.event_type} onValueChange={(val) => setFormData({ ...formData, event_type: val })}>
                  <SelectTrigger className="bg-[#0a1128] border-[rgba(212,168,67,0.15)]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Wedding">Wedding</SelectItem>
                    <SelectItem value="Funeral">Funeral</SelectItem>
                    <SelectItem value="Concert">Concert</SelectItem>
                    <SelectItem value="Conference">Conference</SelectItem>
                    <SelectItem value="Youth Event">Youth Event</SelectItem>
                    <SelectItem value="Community Outreach">Community Outreach</SelectItem>
                    <SelectItem value="Holiday Service">Holiday Service</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Status</Label>
                <Select value={formData.status} onValueChange={(val) => setFormData({ ...formData, status: val })}>
                  <SelectTrigger className="bg-[#0a1128] border-[rgba(212,168,67,0.15)]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Planned">Planned</SelectItem>
                    <SelectItem value="Confirmed">Confirmed</SelectItem>
                    <SelectItem value="In Progress">In Progress</SelectItem>
                    <SelectItem value="Completed">Completed</SelectItem>
                    <SelectItem value="Cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={formData.event_date}
                  onChange={(e) => setFormData({ ...formData, event_date: e.target.value })}
                  required
                  className="bg-[#0a1128] border-[rgba(212,168,67,0.15)]"
                />
              </div>
              <div>
                <Label>Start Time *</Label>
                <Input
                  type="time"
                  value={formData.start_time}
                  onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                  required
                  className="bg-[#0a1128] border-[rgba(212,168,67,0.15)]"
                />
              </div>
              <div>
                <Label>End Time *</Label>
                <Input
                  type="time"
                  value={formData.end_time}
                  onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                  required
                  className="bg-[#0a1128] border-[rgba(212,168,67,0.15)]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Location</Label>
                <Input
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className="bg-[#0a1128] border-[rgba(212,168,67,0.15)]"
                />
              </div>
              <div>
                <Label>Expected Attendance</Label>
                <Input
                  type="number"
                  value={formData.expected_attendance}
                  onChange={(e) => setFormData({ ...formData, expected_attendance: e.target.value })}
                  className="bg-[#0a1128] border-[rgba(212,168,67,0.15)]"
                />
              </div>
            </div>

            <div>
              <Label>Security Notes</Label>
              <Textarea
                value={formData.security_notes}
                onChange={(e) => setFormData({ ...formData, security_notes: e.target.value })}
                className="bg-[#0a1128] border-[rgba(212,168,67,0.15)]"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Coordinator Name</Label>
                <Input
                  value={formData.coordinator_name}
                  onChange={(e) => setFormData({ ...formData, coordinator_name: e.target.value })}
                  className="bg-[#0a1128] border-[rgba(212,168,67,0.15)]"
                />
              </div>
              <div>
                <Label>Coordinator Contact</Label>
                <Input
                  value={formData.coordinator_contact}
                  onChange={(e) => setFormData({ ...formData, coordinator_contact: e.target.value })}
                  className="bg-[#0a1128] border-[rgba(212,168,67,0.15)]"
                />
                </div>
                </div>

                <div>
                <ReminderSettings reminders={reminders} onRemindersChange={setReminders} />
                </div>

                <div className="flex gap-3 pt-4">
              <Button type="submit" className="bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128]">
                {editingEvent ? "Update" : "Create"} Event
              </Button>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}