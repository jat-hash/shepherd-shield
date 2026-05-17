import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Vibrate, Play } from "lucide-react";
import { toast } from "sonner";
import { vibrateOrBeep, flashScreen } from "@/lib/notificationEffects";

const PATTERNS = {
  off:       { label: "Off",              vibration: null,                  desc: "No vibration" },
  single:    { label: "Single Buzz",      vibration: [200],                 desc: "One short pulse" },
  double:    { label: "Double Pulse",     vibration: [200, 100, 200],       desc: "Two quick pulses" },
  triple:    { label: "Triple Tap",       vibration: [150, 80, 150, 80, 150], desc: "Three fast taps" },
  long:      { label: "Long Buzz",        vibration: [600],                 desc: "One sustained buzz" },
  sos:       { label: "SOS (Urgent)",     vibration: [100,80,100,80,100,200,300,200,300,200,300,200,100,80,100,80,100], desc: "Short-short-short-long-long-long" },
  escalate:  { label: "Escalating",       vibration: [100, 100, 200, 100, 400], desc: "Builds in intensity" },
};

const NOTIFICATION_TYPES = [
  { key: "vib_dm",         label: "Direct Messages",    default: "double",  color: "text-blue-400",   icon: "💬" },
  { key: "vib_team_msg",   label: "Team Messages",      default: "single",  color: "text-slate-300",  icon: "📢" },
  { key: "vib_incident",   label: "Incident Alerts",    default: "escalate",color: "text-orange-400", icon: "⚠️" },
  { key: "vib_emergency",  label: "Emergency Alerts",   default: "sos",     color: "text-red-400",    icon: "🚨" },
  { key: "vib_assignment", label: "Assignment Updates",  default: "single",  color: "text-emerald-400",icon: "📋" },
];

export default function VibrationSettings({ user, onSave }) {
  const [prefs, setPrefs] = useState({});
  const [saving, setSaving] = useState(null);

  useEffect(() => {
    const loaded = {};
    NOTIFICATION_TYPES.forEach(t => {
      loaded[t.key] = user?.[t.key] ?? t.default;
    });
    setPrefs(loaded);
  }, [user]);

  const handleChange = async (key, value) => {
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    setSaving(key);
    await base44.auth.updateMe({ [key]: value });
    if (onSave) onSave({ [key]: value });
    setSaving(null);
    toast.success("Saved");
  };

  const preview = (patternKey) => {
    const p = PATTERNS[patternKey];
    if (!p || !p.vibration) return;
    if (navigator.vibrate) {
      navigator.vibrate(p.vibration);
    } else {
      // iOS fallback — play a tone
      vibrateOrBeep('double');
    }
    flashScreen('white', 2);
  };

  return (
    <div className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-5 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Vibrate className="w-4 h-4 text-[#d4a843]" />
        <h3 className="text-sm font-bold text-white">Vibration Patterns</h3>
        <span className="text-[10px] text-slate-500 ml-auto">Feel the difference</span>
      </div>
      <p className="text-xs text-slate-500">Customize vibration so you can identify alert types without looking at your screen.</p>

      <div className="space-y-4 pt-1">
        {NOTIFICATION_TYPES.map(type => {
          const current = prefs[type.key] ?? type.default;
          return (
            <div key={type.key} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className={`text-sm font-medium ${type.color}`}>
                  {type.icon} {type.label}
                </span>
                <button
                  onClick={() => preview(current)}
                  disabled={current === 'off'}
                  className="flex items-center gap-1 text-[10px] text-[#d4a843] hover:text-[#e0bb5e] disabled:opacity-30 disabled:cursor-not-allowed transition-colors px-2 py-1 rounded border border-[rgba(212,168,67,0.2)] hover:border-[rgba(212,168,67,0.5)]"
                  title="Preview this pattern"
                >
                  <Play className="w-3 h-3" /> Test
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {Object.entries(PATTERNS).map(([key, pat]) => (
                  <button
                    key={key}
                    onClick={() => handleChange(type.key, key)}
                    className={`text-left px-2.5 py-2 rounded-lg border text-xs transition-all ${
                      current === key
                        ? "border-[#d4a843] bg-[#d4a843]/10 text-[#d4a843]"
                        : "border-[rgba(255,255,255,0.08)] text-slate-400 hover:border-[rgba(212,168,67,0.3)] hover:text-slate-200"
                    } ${saving === type.key ? 'opacity-60' : ''}`}
                  >
                    <div className="font-semibold">{pat.label}</div>
                    <div className="text-[10px] opacity-70 mt-0.5">{pat.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}