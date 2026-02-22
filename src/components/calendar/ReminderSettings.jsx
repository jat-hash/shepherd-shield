import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { X, Plus } from "lucide-react";

export default function ReminderSettings({ reminders, onRemindersChange }) {
  const handleAddReminder = () => {
    onRemindersChange([...reminders, { minutes: 15, id: Date.now() }]);
  };

  const handleRemoveReminder = (id) => {
    onRemindersChange(reminders.filter(r => r.id !== id));
  };

  const handleChangeReminder = (id, minutes) => {
    onRemindersChange(
      reminders.map(r => r.id === id ? { ...r, minutes: parseInt(minutes) || 0 } : r)
    );
  };

  return (
    <div className="space-y-3">
      <Label>Reminders (custom times in minutes before event)</Label>
      {reminders.map(reminder => (
        <div key={reminder.id} className="flex items-center gap-2">
          <Input
            type="number"
            min="0"
            max="10080"
            step="5"
            value={reminder.minutes}
            onChange={(e) => handleChangeReminder(reminder.id, e.target.value)}
            placeholder="Minutes"
            className="bg-[#0a1128] border-[rgba(212,168,67,0.15)] w-24"
          />
          <span className="text-xs text-slate-400">
            {reminder.minutes === 0
              ? 'No reminder'
              : reminder.minutes < 60
              ? `${reminder.minutes} min before`
              : reminder.minutes < 1440
              ? `${Math.round(reminder.minutes / 60)} hours before`
              : `${Math.round(reminder.minutes / 1440)} day(s) before`}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleRemoveReminder(reminder.id)}
            className="h-8 w-8"
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={handleAddReminder}
        className="border-[rgba(212,168,67,0.3)] text-[#d4a843] hover:bg-[rgba(212,168,67,0.1)]"
      >
        <Plus className="w-3 h-3 mr-1" /> Add Reminder
      </Button>
    </div>
  );
}