import React from 'react';
import { Mic, MicOff } from 'lucide-react';

export default function PTTButton({ active, disabled, onStart, onEnd }) {
  const end = (event) => {
    event.preventDefault();
    onEnd();
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        disabled={disabled}
        onPointerDown={(event) => {
          event.preventDefault();
          onStart();
        }}
        onPointerUp={end}
        onPointerLeave={end}
        onPointerCancel={end}
        onContextMenu={(event) => event.preventDefault()}
        className={`relative flex h-44 w-44 touch-none select-none flex-col items-center justify-center rounded-full font-bold uppercase tracking-[0.15em] transition-all disabled:opacity-40 ${
          active
            ? 'scale-95 bg-red-600 text-white shadow-[0_0_60px_rgba(220,38,38,0.65)]'
            : 'bg-[#d4a843] text-[#0a1128] shadow-[0_10px_40px_rgba(212,168,67,0.3)]'
        }`}
      >
        {active && <span className="absolute inset-0 animate-ping rounded-full border-4 border-red-400" />}
        {active ? <Mic className="mb-2 h-14 w-14" /> : <MicOff className="mb-2 h-14 w-14 opacity-70" />}
        <span className="text-[11px]">{active ? 'Transmitting' : 'Hold to talk'}</span>
      </button>
      <p className="text-center text-[11px] text-slate-400">
        {active ? 'Release to stop transmitting' : 'Press and hold to speak on this channel'}
      </p>
    </div>
  );
}