import React from 'react';
import { Bluetooth } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useRadioSession } from '@/context/RadioSessionContext';

/**
 * Arms a paired Bluetooth button (keyboard-style remote or headset button) as
 * push-to-talk. The button is paired in the phone's own Bluetooth settings;
 * the browser only listens for what the paired button sends.
 */
export default function BluetoothPttCard({ ready }) {
  const { session, headset } = useRadioSession();
  const { armed, toggleArmed } = headset;

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bluetooth
            className={`h-4 w-4 ${armed && ready ? 'text-emerald-400' : 'text-slate-500'}`}
          />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">
              Bluetooth button
            </p>
            <p className="text-[10px] text-slate-500">
              {!ready
                ? 'Waiting for the radio to come online'
                : armed
                ? session.transmitting
                  ? 'Live — tap the headset button again to stop'
                  : 'Ready — tap your headset call button to talk'
                : 'Switched off — turn on to talk with the headset button'}
            </p>
          </div>
        </div>
        <Switch
          checked={armed}
          onCheckedChange={toggleArmed}
          disabled={!ready}
          aria-label="Bluetooth push-to-talk"
          className="data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-white/20"
        />
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
        Any paired Bluetooth headset works: press its call button once to talk and again to stop,
        from any screen in the app. Clip-on remote buttons hold down to talk. Sound and microphone
        follow the headset your phone is paired to.
      </p>
    </div>
  );
}