import React from 'react';
import { Headphones } from 'lucide-react';

/**
 * Chooses which speaker the radio voice plays through — a paired Bluetooth
 * headset, a car kit, or the phone itself.
 */
export default function AudioOutputPicker({ outputs = [], value, onChange }) {
  if (!outputs.length) return null;
  const current = value || 'default';
  const hasDefault = outputs.some((device) => device.deviceId === 'default');

  return (
    <div className="flex items-center gap-2">
      <Headphones className="h-4 w-4 shrink-0 text-slate-400" />
      <select
        value={current}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Playback speaker"
        className="w-full min-w-0 rounded-md border border-white/15 bg-[#0a1128] px-2 py-1.5 text-[11px] font-medium text-slate-200"
      >
        {!hasDefault && <option value="default">Phone speaker</option>}
        {outputs.map((device, index) => (
          <option key={device.deviceId || index} value={device.deviceId}>
            {device.label || `Audio device ${index + 1}`}
          </option>
        ))}
      </select>
    </div>
  );
}