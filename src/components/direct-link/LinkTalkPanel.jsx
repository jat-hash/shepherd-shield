import React, { useEffect, useRef } from 'react';
import { Mic, PhoneOff } from 'lucide-react';

const STATE_TEXT = {
  new: 'Connecting…',
  connecting: 'Connecting…',
  connected: 'Linked directly between the two phones',
  disconnected: 'Link interrupted — stay close to each other',
  failed: 'The link dropped',
  closed: 'The link is closed',
};

export default function LinkTalkPanel({
  talking,
  connectionState,
  remoteStream,
  onStartTalking,
  onStopTalking,
  onHangUp,
}) {
  const audioRef = useRef(null);
  const connected = connectionState === 'connected';

  useEffect(() => {
    if (!audioRef.current || !remoteStream) return;
    audioRef.current.srcObject = remoteStream;
    audioRef.current.play().catch(() => {});
  }, [remoteStream]);

  const begin = (event) => {
    event.preventDefault();
    audioRef.current?.play().catch(() => {});
    onStartTalking();
  };

  return (
    <div className="bg-[#141f3d] border border-[rgba(212,168,67,0.2)] rounded-xl p-5">
      <audio ref={audioRef} autoPlay playsInline className="hidden" />

      <div className="flex items-center justify-center gap-2 mb-5">
        <span
          className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-green-400' : 'bg-amber-400 animate-pulse'}`}
        />
        <span className="text-slate-300 text-xs">
          {STATE_TEXT[connectionState] || STATE_TEXT.connecting}
        </span>
      </div>

      <button
        onPointerDown={begin}
        onPointerUp={onStopTalking}
        onPointerLeave={onStopTalking}
        onPointerCancel={onStopTalking}
        className={`w-36 h-36 mx-auto rounded-full flex flex-col items-center justify-center gap-2 font-bold text-sm transition-all touch-none select-none ${
          talking
            ? 'bg-red-600 text-white scale-95 ring-8 ring-red-500/30'
            : 'bg-[#d4a843] text-[#0a1128] active:scale-95'
        }`}
      >
        <Mic className="w-9 h-9" />
        {talking ? 'TALKING' : 'HOLD TO TALK'}
      </button>

      <p className="text-center text-slate-500 text-xs mt-4 leading-relaxed">
        Hold the button while you speak, release to listen.
      </p>

      <button
        onClick={onHangUp}
        className="w-full mt-5 flex items-center justify-center gap-2 py-3 rounded-lg border border-red-500/40 text-red-300 text-sm font-semibold"
      >
        <PhoneOff className="w-4 h-4" />
        End link
      </button>
    </div>
  );
}