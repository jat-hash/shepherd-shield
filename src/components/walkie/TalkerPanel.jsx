import React from 'react';
import { Mic, Users } from 'lucide-react';

export default function TalkerPanel({ participants, activeSpeakerIds, nearbyCount, selfName }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
          <Users className="h-3.5 w-3.5" /> On channel ({participants.length + 1})
        </p>
        {nearbyCount > 0 && (
          <span className="text-[10px] font-semibold text-[#d4a843]">{nearbyCount} nearby</span>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between rounded-lg bg-[#0a1128]/60 px-2.5 py-1.5">
          <span className="text-xs text-slate-300">{selfName || 'You'}</span>
          <span className="text-[10px] uppercase tracking-wider text-slate-500">You</span>
        </div>

        {participants.length === 0 && (
          <p className="px-1 py-1 text-[11px] text-slate-500">
            Waiting for teammates to join this channel.
          </p>
        )}

        {participants.map((participant) => {
          const speaking = participant.speaking || activeSpeakerIds.includes(participant.id);
          return (
            <div
              key={participant.id}
              className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 transition-colors ${
                speaking ? 'bg-emerald-500/15 ring-1 ring-emerald-400/40' : 'bg-[#0a1128]/60'
              }`}
            >
              <span className={`text-xs ${speaking ? 'font-semibold text-emerald-200' : 'text-slate-300'}`}>
                {participant.name}
              </span>
              {speaking && <Mic className="h-3.5 w-3.5 animate-pulse text-emerald-300" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}