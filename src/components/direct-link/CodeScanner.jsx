import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, ChevronLeft } from 'lucide-react';

const CONTAINER_ID = 'direct-link-camera';

export default function CodeScanner({ hint, onCode, onBack }) {
  const [cameraFailed, setCameraFailed] = useState(false);
  const [manual, setManual] = useState('');
  // Keeps the camera running while the page re-renders around it.
  const onCodeRef = useRef(onCode);

  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  useEffect(() => {
    const scanner = new Html5Qrcode(CONTAINER_ID, { verbose: false });
    let stopped = false;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 8, qrbox: { width: 240, height: 240 } },
        (text) => {
          if (stopped) return;
          stopped = true;
          onCodeRef.current(text);
        },
        () => {}
      )
      .catch(() => {
        if (!stopped) setCameraFailed(true);
      });

    return () => {
      stopped = true;
      scanner.stop().catch(() => {});
    };
  }, []);

  return (
    <div className="bg-[#141f3d] border border-[rgba(212,168,67,0.2)] rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <button onClick={onBack} className="flex items-center gap-1 text-slate-400 text-sm">
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
        <span className="text-[#d4a843] text-xs font-semibold uppercase tracking-wider">Scan code</span>
      </div>

      <p className="text-slate-400 text-xs mb-3 leading-relaxed">{hint}</p>

      {!cameraFailed && (
        <div className="rounded-lg overflow-hidden bg-black">
          <div id={CONTAINER_ID} className="w-full" />
        </div>
      )}

      {cameraFailed && (
        <div className="flex items-center gap-2 text-amber-300 text-xs bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
          <Camera className="w-4 h-4 flex-shrink-0" />
          The camera could not be opened. Type the code shown on the other phone instead.
        </div>
      )}

      <textarea
        value={manual}
        onChange={(event) => setManual(event.target.value)}
        placeholder="Paste or type the code from the other phone"
        rows={3}
        className="w-full mt-3 bg-[#0a1128] border border-[rgba(212,168,67,0.2)] rounded-lg p-3 text-xs text-white placeholder:text-slate-500"
      />
      <button
        onClick={() => manual.trim() && onCode(manual.trim())}
        disabled={!manual.trim()}
        className="w-full mt-2 py-3 rounded-lg bg-[#d4a843] text-[#0a1128] font-semibold text-sm disabled:opacity-40"
      >
        Use this code
      </button>
    </div>
  );
}