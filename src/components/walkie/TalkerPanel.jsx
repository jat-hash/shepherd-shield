import React from 'react';
import { Mic, Users } from 'lucide-react';

export default function TalkerPanel({
  participants,
  activeSpeakerIds,
  talkerIds = [],
  selfSpeaking = false,
  nearbyCount,
  selfName,
  connected,
}) {
  // The open microphone is the exact push-to-talk state, so a headset button
  // press lights the person up immediately; voice detection is the backup.
  const isTalking = (participant) =>
    talkerIds.includes(participant.id) ||
    participant.speaking ||
    activeSpeakerIds.includes(participant.id);

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
          <Users className="h-3.5 w-3.5" /> {connected ? `On channel (${participants.length + 1})` : 'Not on channel'}
        </p>
        {nearbyCount > 0 && (
          <span className="text-[10px] font-semibold text-[#d4a843]">{nearbyCount} nearby</span>
        )}
      </div>

      <div className="space-y-1.5">
        <div
          className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 transition-colors ${
            selfSpeaking ? 'bg-emerald-500/15 ring-1 ring-emerald-400/40' : 'bg-[#0a1128]/60'
          }`}
        >
          <span
            className={`text-xs ${
              selfSpeaking
                ? 'font-semibold text-emerald-200'
                : connected
                ? 'text-slate-300'
                : 'text-slate-500'
            }`}
          >
            {selfName || 'You'}
          </span>
          {selfSpeaking ? (
            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
              <Mic className="h-3.5 w-3.5 animate-pulse" /> Talking
            </span>
          ) : (
            <span className="text-[10px] uppercase tracking-wider text-slate-500">
              {connected ? 'You' : 'Not joined'}
            </span>
          )}
        </div>

        {participants.length === 0 && (
          <p className="px-1 py-1 text-[11px] text-slate-500">
            {connected
              ? 'Waiting for teammates to open the Radio tab and join this channel.'
              : 'You are not connected, so nobody else can appear here yet.'}
          </p>
        )}

        {participants.map((participant) => {
          const speaking = isTalking(participant);
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