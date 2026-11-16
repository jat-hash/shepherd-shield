import React from 'react';
import { Bluetooth, RadioTower, WifiOff } from 'lucide-react';
import { useRadioSession } from '@/context/RadioSessionContext';

// One picker row: the radio voice out, or the radio microphone in.
function DeviceRow({ icon: Icon, label, hint, value, options, onChange, fallback }) {
  return (
    <label className="block">
      <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
        <Icon className="h-3 w-3" /> {label}
      </span>
      <select
        value={value || 'default'}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full min-w-0 rounded-md border border-white/15 bg-[#0a1128] px-2 py-1.5 text-[11px] font-medium text-slate-200"
      >
        <option value="default">{fallback}</option>
        {options.map((device, index) => (
          <option key={device.deviceId || index} value={device.deviceId}>
            {device.label || `Device ${index + 1}`}
          </option>
        ))}
      </select>
      {hint && <span className="mt-1 block text-[10px] leading-relaxed text-slate-500">{hint}</span>}
    </label>
  );
}

/**
 * Ties the team radio to a Bluetooth radio (or headset) once: the voice, the
 * microphone and the talk button all stay on that paired device. The link is
 * held open even when the phone loses service, so the radio keeps working.
 */
export default function BluetoothRadioLinkCard() {
  const { session } = useRadioSession();
  const speaker = (session.audioOutputs || []).find((device) => device.deviceId === session.outputDeviceId);
  const mic = (session.audioInputs || []).find((device) => device.deviceId === session.inputDeviceId);
  // iPhones give the audio to whatever Bluetooth device is connected and do not
  // let a page choose one, so there the link is held without a picker.
  const canChoose = !!session.canPickOutput;
  const linked = canChoose ? !!session.outputDeviceId : !!session.audioOutputs?.length;
  const offline = !!session.networkOffline;

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bluetooth className={`h-4 w-4 ${linked ? 'text-emerald-400' : 'text-slate-500'}`} />
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-300">Radio link</p>
        </div>
        <span
          className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
            linked
              ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300'
              : 'border-white/15 bg-white/5 text-slate-400'
          }`}
        >
          {linked ? 'Linked' : 'Not linked'}
        </span>
      </div>

      {canChoose ? (
        <>
          <DeviceRow
            icon={RadioTower}
            label="Hear on"
            value={session.outputDeviceId}
            options={session.audioOutputs || []}
            onChange={session.selectOutput}
            fallback="Phone speaker"
            hint="Pick your radio here so the team's voice plays through it, not the phone."
          />

          <DeviceRow
            icon={Bluetooth}
            label="Talk through"
            value={session.inputDeviceId}
            options={session.audioInputs || []}
            onChange={session.selectInput}
            fallback="Phone microphone"
            hint="Your radio's own microphone. It is used when the browser can open it, otherwise the phone's."
          />
        </>
      ) : (
        <p className="text-[10px] leading-relaxed text-slate-500">
          This phone sends the radio straight to the Bluetooth device connected in its own settings. Keep the
          radio paired there and the link stays linked — through signal loss too.
        </p>
      )}

      <div
        className={`rounded-lg border p-2 text-[10px] leading-relaxed ${
          offline
            ? 'border-amber-400/40 bg-amber-400/10 text-amber-100'
            : linked
            ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
            : 'border-white/10 bg-white/5 text-slate-400'
        }`}
      >
        {offline ? (
          <span className="flex items-start gap-1.5">
            <WifiOff className="mt-0.5 h-3 w-3 flex-shrink-0" />
            No service, but the Bluetooth link to {speaker?.label || 'your radio'} stays open — keep using the
            radio's own talk button until data comes back.
          </span>
        ) : linked ? (
          <span>
            {speaker?.label || 'Your radio'}
            {mic?.label ? ` and ${mic.label}` : ''} stay paired through signal loss, so the radio keeps working
            with your Bluetooth.
          </span>
        ) : (
          <span>
            Pair your radio in the phone's Bluetooth settings, then pick it here. Once it is picked, losing
            service no longer takes the radio off your Bluetooth.
          </span>
        )}
      </div>
    </div>
  );
}