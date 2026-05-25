import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Vibrate, Play } from "lucide-react";
import { toast } from "sonner";
import { vibrateOrBeep, flashScreen } from "@/lib/notificationEffects";
import { Slider } from "@/components/ui/slider";

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

const STRENGTH_LABELS = { 1: "Normal", 2: "Strong", 3: "Maximum" };
const STRENGTH_DESCS = {
  1: "Standard pulse",
  2: "1.6× longer, louder",
  3: "2.5× longer, max volume",
};

export default function VibrationSettings({ user, onSave }) {
  const [prefs, setPrefs] = useState({});
  const [strength, setStrength] = useState(1);
  const [saving, setSaving] = useState(null);

  useEffect(() => {
    const loaded = {};
    NOTIFICATION_TYPES.forEach(t => {
      loaded[t.key] = user?.[t.key] ?? t.default;
    });
    setPrefs(loaded);
    setStrength(Math.max(1, Math.min(3, Number(user?.vib_strength) || 1)));
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

  const handleStrengthChange = async (val) => {
    const s = val[0];
    setStrength(s);
    await base44.auth.updateMe({ vib_strength: s });
    if (onSave) onSave({ vib_strength: s });
    toast.success("Vibration strength saved");
  };

  const preview = (patternKey) => {
    if (!patternKey || patternKey === 'off') return;
    vibrateOrBeep(patternKey, strength);
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

      {/* Strength Slider */}
      <div className="bg-[#0a1128]/40 rounded-xl p-4 space-y-3 border border-[rgba(212,168,67,0.1)]">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-white">Vibration Strength</span>
          <span className="text-xs font-bold text-[#d4a843] px-2 py-0.5 rounded bg-[#d4a843]/10 border border-[#d4a843]/20">
            {STRENGTH_LABELS[strength]}
          </span>
        </div>
        <Slider
          min={1} max={3} step={1}
          value={[strength]}
          onValueChange={handleStrengthChange}
          className="w-full"
        />
        <div className="flex justify-between text-[10px] text-slate-500">
          <span>Normal</span>
          <span>Strong</span>
          <span>Maximum</span>
        </div>
        <p className="text-[11px] text-slate-400">{STRENGTH_DESCS[strength]} — use <span className="text-[#d4a843]">Test</span> buttons below to feel the difference.</p>
      </div>

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