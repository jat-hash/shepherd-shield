import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Copy, ScanLine } from 'lucide-react';

export default function PairingCode({ title, subtitle, code, scanLabel, onScan }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (_) {
      /* clipboard unavailable — the QR is the way in */
    }
  };

  return (
    <div className="bg-[#141f3d] border border-[rgba(212,168,67,0.2)] rounded-xl p-5 text-center">
      <p className="text-white font-semibold text-sm">{title}</p>
      <p className="text-slate-400 text-xs mt-1 leading-relaxed">{subtitle}</p>
      <div className="bg-white rounded-lg p-3 mt-4 inline-block">
        <QRCodeSVG value={code} size={236} level="L" bgColor="#ffffff" fgColor="#0a1128" />
      </div>
      <div className="mt-4 flex flex-col gap-2">
        {onScan && (
          <button
            onClick={onScan}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-[#d4a843] text-[#0a1128] font-semibold text-sm"
          >
            <ScanLine className="w-4 h-4" />
            {scanLabel}
          </button>
        )}
        <button
          onClick={copy}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-[rgba(212,168,67,0.3)] text-slate-300 text-sm"
        >
          {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
          {copied ? 'Code copied' : 'Copy code'}
        </button>
      </div>
    </div>
  );
}