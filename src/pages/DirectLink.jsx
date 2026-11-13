import React, { useState } from 'react';
import { AlertTriangle, Link2, Radio, ScanLine, Users } from 'lucide-react';
import useDirectLink, { LINK_PHASE } from '@/hooks/useDirectLink';
import PairingCode from '@/components/direct-link/PairingCode';
import CodeScanner from '@/components/direct-link/CodeScanner';
import LinkTalkPanel from '@/components/direct-link/LinkTalkPanel';

export default function DirectLink() {
  const link = useDirectLink();
  // Which phone shows the code and which one scans it first.
  const [scanning, setScanning] = useState(null);

  const handleCode = (code) => {
    setScanning(null);
    link.submitCode(code);
  };

  return (
    <div className="p-4 max-w-md mx-auto space-y-4">
      <div className="bg-[#141f3d] border border-[rgba(212,168,67,0.2)] rounded-xl p-4">
        <div className="flex items-center gap-2">
          <Link2 className="w-5 h-5 text-[#d4a843]" />
          <h1 className="text-white font-bold text-base">Direct Link</h1>
        </div>
        <p className="text-slate-400 text-xs mt-2 leading-relaxed">
          Connects two phones straight to each other over the local Wi-Fi at the building. No
          internet, no cell service and no server are needed once the link is open.
        </p>
      </div>

      {link.error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-300 text-xs">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {link.error}
        </div>
      )}

      {link.phase === LINK_PHASE.STARTING && (
        <div className="bg-[#141f3d] border border-[rgba(212,168,67,0.2)] rounded-xl p-8 flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-[rgba(212,168,67,0.3)] border-t-[#d4a843] rounded-full animate-spin" />
          <p className="text-slate-400 text-xs">Opening the link…</p>
        </div>
      )}

      {link.phase === LINK_PHASE.IDLE && (
        <>
          <div className="grid gap-2">
            <button
              onClick={link.startHost}
              className="flex items-center gap-3 bg-[#d4a843] text-[#0a1128] rounded-xl p-4 text-left"
            >
              <Radio className="w-5 h-5" />
              <span>
                <span className="block font-bold text-sm">Start a link</span>
                <span className="block text-[11px] opacity-80">This phone shows the code</span>
              </span>
            </button>
            <button
              onClick={link.startGuest}
              className="flex items-center gap-3 bg-[#141f3d] border border-[rgba(212,168,67,0.25)] text-white rounded-xl p-4 text-left"
            >
              <ScanLine className="w-5 h-5 text-[#d4a843]" />
              <span>
                <span className="block font-bold text-sm">Join a link</span>
                <span className="block text-[11px] text-slate-400">Scan the other phone's code</span>
              </span>
            </button>
          </div>

          <div className="bg-[#141f3d]/60 border border-[rgba(212,168,67,0.15)] rounded-xl p-4 space-y-2">
            <div className="flex items-start gap-2 text-slate-400 text-xs">
              <Users className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#d4a843]" />
              One link is between two phones. For the whole team at once, use the Team Radio.
            </div>
            <div className="flex items-start gap-2 text-slate-400 text-xs">
              <Link2 className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#d4a843]" />
              Both phones must be on the same Wi-Fi and within its range.
            </div>
          </div>
        </>
      )}

      {link.phase === LINK_PHASE.SHOW_CODE &&
        (scanning ? (
          <CodeScanner
            hint="Point the camera at the code on the other phone."
            onCode={handleCode}
            onBack={() => setScanning(null)}
          />
        ) : (
          <PairingCode
            title={link.role === 'host' ? 'Show this to the other phone' : 'Now show this reply code'}
            subtitle={
              link.role === 'host'
                ? 'They scan it, then show you a reply code to scan.'
                : 'The other phone scans this to finish the link.'
            }
            code={link.myCode}
            scanLabel={link.role === 'host' ? 'Scan their reply instead' : null}
            onScan={link.role === 'host' ? () => setScanning(true) : null}
          />
        ))}

      {link.phase === LINK_PHASE.SCANNING && (
        <CodeScanner
          hint={
            link.role === 'guest'
              ? 'Point the camera at the code on the phone that started the link.'
              : 'Point the camera at the reply code on the other phone.'
          }
          onCode={handleCode}
          onBack={() => {
            setScanning(null);
            if (link.role === 'guest') link.hangUp();
          }}
        />
      )}

      {link.phase === LINK_PHASE.LINKED && (
        <LinkTalkPanel
          talking={link.talking}
          connectionState={link.connectionState}
          remoteStream={link.remoteStream}
          onStartTalking={link.startTalking}
          onStopTalking={link.stopTalking}
          onHangUp={link.hangUp}
        />
      )}
    </div>
  );
}